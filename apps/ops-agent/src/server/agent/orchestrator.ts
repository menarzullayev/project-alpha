/**
 * Runs one inbound customer message through the full operations workflow:
 * persist → CRM (customer, lead) → decide → apply actions (booking, handoff)
 * → persist reply → deliver. Every step is idempotent so a redelivered
 * webhook never duplicates messages, leads, bookings or replies.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { type ConversationState, conversations, customers, messages, organizations } from "../db/schema";
import { getAgentSettings } from "../domains/agent-settings";
import { recordAudit } from "../domains/audit";
import { createBooking } from "../domains/bookings";
import { listCourses, listSlots } from "../domains/courses";
import { upsertTelegramCustomer } from "../domains/customers";
import { listKnowledge } from "../domains/knowledge";
import { advanceLead, ensureOpenLead } from "../domains/leads";
import { notify } from "../domains/notifications";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { LlmProvider } from "../providers/llm";
import type { MessagingProvider, OutboundOptions } from "../providers/messaging/types";
import { systemContext, type TenantContext } from "../tenancy";
import { type AgentDecision, type AgentInput, decide } from "./engine";
import { groundedAnswer } from "./grounded-llm";
import type { Lang } from "./language";
import { T } from "./templates";

export type InboundMessage = {
  orgId: string;
  channel: "telegram" | "web_test";
  integrationId: string | null;
  chatId: string;
  from: { userId: string; username?: string | null; fullName?: string | null; language?: string | null };
  text: string;
  sharedPhone?: string | null;
  externalMessageId: string;
  isStart?: boolean;
};

export type ProcessResult = {
  conversationId: string;
  inboundMessageId: string;
  duplicate: boolean;
  replied: boolean;
  reply?: string;
  decision?: AgentDecision;
  delivery?: "sent" | "failed";
};

export class DeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryError";
  }
}

type Deps = { messaging: MessagingProvider; llm: LlmProvider | null };

export async function processInbound(db: Db, msg: InboundMessage, deps: Deps): Promise<ProcessResult> {
  const ctx: TenantContext = systemContext(msg.orgId, "agent");
  const log = logger.child({ orgId: msg.orgId, chatId: msg.chatId, externalMessageId: msg.externalMessageId });

  // ---- 1. Persist inbound + CRM records (one transaction).
  const stage1 = await db.transaction(async (tx) => {
    const customer = await upsertTelegramCustomer(tx, msg.orgId, msg.from);
    const [conversation] = await tx
      .insert(conversations)
      .values({
        orgId: msg.orgId,
        customerId: customer.id,
        channel: msg.channel,
        integrationId: msg.integrationId,
        externalChatId: msg.chatId,
      })
      .onConflictDoUpdate({
        target: [conversations.orgId, conversations.channel, conversations.externalChatId],
        set: { lastMessageAt: new Date() },
      })
      .returning();

    const [inbound] = await tx
      .insert(messages)
      .values({
        orgId: msg.orgId,
        conversationId: conversation.id,
        direction: "inbound",
        senderType: "customer",
        body: msg.text || (msg.sharedPhone ? `📱 ${msg.sharedPhone}` : ""),
        externalMessageId: msg.externalMessageId,
        deliveryStatus: "received",
      })
      .onConflictDoNothing({
        target: [messages.conversationId, messages.externalMessageId],
        where: sql`direction = 'inbound' and external_message_id is not null`,
      })
      .returning();

    if (!inbound) {
      const [existing] = await tx
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversation.id),
            eq(messages.externalMessageId, msg.externalMessageId),
            eq(messages.direction, "inbound"),
          ),
        );
      return { duplicate: true as const, customer, conversation, inbound: existing };
    }

    if (conversation.status === "closed") {
      await tx.update(conversations).set({ status: "bot" }).where(eq(conversations.id, conversation.id));
      conversation.status = "bot";
    }
    const { lead, created } = await ensureOpenLead(tx, ctx, customer.id, msg.channel === "web_test" ? "test_chat" : "telegram");
    if (created) {
      await notify(tx, msg.orgId, {
        type: "lead.created",
        title: `New lead: ${customer.fullName ?? customer.telegramUsername ?? "Telegram user"}`,
        body: msg.text.slice(0, 200),
        link: `/leads/${lead.id}`,
      });
    }
    return { duplicate: false as const, customer, conversation, inbound, lead };
  });

  const base = { conversationId: stage1.conversation.id, inboundMessageId: stage1.inbound.id };

  if (stage1.duplicate) {
    // Redelivery: if our earlier reply never got out, try sending it again.
    const [reply] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.replyToId, stage1.inbound.id), eq(messages.senderType, "agent")));
    if (reply && reply.deliveryStatus !== "sent") {
      const delivery = await deliver(db, deps.messaging, reply.id, msg.chatId, reply.body, {}, log);
      if (delivery === "failed") throw new DeliveryError("Reply delivery failed on retry");
      return { ...base, duplicate: true, replied: true, reply: reply.body, delivery };
    }
    log.info("duplicate inbound message ignored");
    return { ...base, duplicate: true, replied: false };
  }

  const settings = await getAgentSettings(db, msg.orgId);
  if (stage1.conversation.status === "handoff" || !settings.autoReplyEnabled) {
    log.info("auto-reply skipped", { status: stage1.conversation.status, autoReply: settings.autoReplyEnabled });
    return { ...base, duplicate: false, replied: false };
  }

  // ---- 2. Decide.
  const [org] = await db.select().from(organizations).where(eq(organizations.id, msg.orgId));
  const [courses, slots, knowledge] = await Promise.all([
    listCourses(db, ctx, { activeOnly: true }),
    listSlots(db, ctx, { upcomingOnly: true, limit: 200 }),
    listKnowledge(db, ctx, { approvedOnly: true }),
  ]);
  const input: AgentInput = {
    text: msg.text,
    sharedPhone: msg.sharedPhone ?? null,
    isStart: msg.isStart,
    org: { name: org.name, timezone: org.timezone, currency: org.currency },
    settings: {
      agentName: settings.agentName,
      defaultLanguage: (settings.defaultLanguage as Lang) ?? "uz",
      greeting: settings.greeting,
      escalationKeywords: settings.escalationKeywords,
      maxUnknownBeforeHandoff: settings.maxUnknownBeforeHandoff,
    },
    customer: { fullName: stage1.customer.fullName, phone: stage1.customer.phone },
    state: stage1.conversation.state,
    courses: courses.map((c) => ({ ...c })),
    slots: slots.map((s) => ({ id: s.id, courseId: s.courseId, startsAt: s.startsAt, location: s.location, available: s.available })),
    knowledge: knowledge.map((k) => ({ id: k.id, title: k.title, content: k.content, category: k.category, keywords: k.keywords })),
  };
  let decision = decide(input);
  let provider = "rules";

  // Grounded LLM fallback, only for messages the rules engine could not answer.
  if (decision.intent === "unknown" && deps.llm && settings.llmEnabled) {
    try {
      const history = await recentHistory(db, stage1.conversation.id, stage1.inbound.id);
      const answer = await groundedAnswer(deps.llm, input, decision.language, history);
      if (answer) {
        decision = { ...decision, reply: answer, intent: "faq", confidence: 0.6, quickReplies: undefined, state: { ...decision.state, unknownCount: input.state.unknownCount ?? 0 } };
        provider = deps.llm.name;
      }
    } catch (err) {
      log.warn("llm fallback failed; using rules reply", { err: (err as Error).message });
    }
  }

  // ---- 3. Apply side effects.
  let reply = decision.reply;
  let state: ConversationState = decision.state;
  const lead = stage1.lead;
  for (const action of decision.actions) {
    switch (action.type) {
      case "save_phone":
        await db.update(customers).set({ phone: action.phone, updatedAt: new Date() }).where(and(eq(customers.id, stage1.customer.id), eq(customers.orgId, msg.orgId)));
        if (lead) await advanceLead(db, ctx, lead.id, "qualified");
        break;
      case "save_name":
        await db.update(customers).set({ fullName: action.fullName, updatedAt: new Date() }).where(and(eq(customers.id, stage1.customer.id), eq(customers.orgId, msg.orgId)));
        break;
      case "set_interest":
        if (lead) await advanceLead(db, ctx, lead.id, "contacted", { interestedCourseId: action.courseId });
        break;
      case "book":
        try {
          const { booking, created } = await createBooking(db, ctx, {
            customerId: stage1.customer.id,
            slotId: action.slotId,
            source: msg.channel === "web_test" ? "test_chat" : "telegram",
          });
          if (created) {
            await notify(db, msg.orgId, {
              type: "booking.created",
              title: `Trial booked: ${stage1.customer.fullName ?? "customer"}`,
              body: reply,
              link: `/bookings?highlight=${booking.id}`,
            });
          }
        } catch (err) {
          if (!(err instanceof AppError) || err.status !== 409) throw err;
          reply = T[decision.language].bookingFailed;
          state = { ...state, stage: "idle", slotId: undefined, offeredSlotIds: undefined };
        }
        break;
      case "handoff":
        await db
          .update(conversations)
          .set({ status: "handoff", handoffReason: action.reason })
          .where(and(eq(conversations.id, stage1.conversation.id), eq(conversations.orgId, msg.orgId)));
        await notify(db, msg.orgId, {
          type: "conversation.handoff",
          title: `Handoff needed: ${stage1.customer.fullName ?? stage1.customer.telegramUsername ?? "customer"}`,
          body: `Reason: ${action.reason}\n“${msg.text.slice(0, 200)}”`,
          link: `/conversations/${stage1.conversation.id}`,
        });
        await recordAudit(db, ctx, { action: "conversation.handoff", entityType: "conversation", entityId: stage1.conversation.id, metadata: { reason: action.reason } });
        break;
    }
  }
  await db.update(conversations).set({ state, lastMessageAt: new Date() }).where(eq(conversations.id, stage1.conversation.id));

  // ---- 4. Persist and deliver the reply (unique per inbound message).
  const [outbound] = await db
    .insert(messages)
    .values({
      orgId: msg.orgId,
      conversationId: stage1.conversation.id,
      direction: "outbound",
      senderType: "agent",
      body: reply,
      replyToId: stage1.inbound.id,
      deliveryStatus: "pending",
      meta: { intent: decision.intent, confidence: decision.confidence, sources: decision.sources, provider, action: decision.actions.map((a) => a.type).join(",") || undefined },
    })
    .onConflictDoNothing({ target: messages.replyToId, where: sql`sender_type = 'agent' and reply_to_id is not null` })
    .returning();
  if (!outbound) return { ...base, duplicate: true, replied: false };

  const opts: OutboundOptions = { requestContact: decision.requestContact, quickReplies: decision.quickReplies };
  const delivery = await deliver(db, deps.messaging, outbound.id, msg.chatId, reply, opts, log);
  if (delivery === "failed") {
    await notify(db, msg.orgId, {
      type: "message.delivery_failed",
      title: "Reply could not be delivered",
      body: reply.slice(0, 200),
      link: `/conversations/${stage1.conversation.id}`,
    });
    throw new DeliveryError("Reply delivery failed");
  }
  return { ...base, duplicate: false, replied: true, reply, decision, delivery };
}

async function recentHistory(db: Db, conversationId: string, excludeId: string) {
  const rows = await db
    .select({ id: messages.id, direction: messages.direction, body: messages.body })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(8);
  return rows
    .filter((r) => r.id !== excludeId)
    .reverse()
    .map((r) => ({ role: r.direction === "inbound" ? ("user" as const) : ("assistant" as const), content: r.body }));
}

export async function deliver(
  db: Db,
  provider: MessagingProvider,
  messageId: string,
  chatId: string,
  text: string,
  opts: OutboundOptions,
  log = logger,
): Promise<"sent" | "failed"> {
  try {
    const { externalId } = await provider.sendText(chatId, text, opts);
    await db
      .update(messages)
      .set({ deliveryStatus: "sent", externalMessageId: externalId, attempts: sql`${messages.attempts} + 1`, error: null })
      .where(eq(messages.id, messageId));
    return "sent";
  } catch (err) {
    log.error("message delivery failed", { messageId, err: (err as Error).message });
    await db
      .update(messages)
      .set({ deliveryStatus: "failed", attempts: sql`${messages.attempts} + 1`, error: (err as Error).message.slice(0, 500) })
      .where(eq(messages.id, messageId));
    return "failed";
  }
}

export async function listConversationMessages(db: Db, orgId: string, conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.orgId, orgId), eq(messages.conversationId, conversationId)))
    .orderBy(asc(messages.createdAt));
}
