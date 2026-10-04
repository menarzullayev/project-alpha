import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { deliver, listConversationMessages } from "../agent/orchestrator";
import type { Db, DbOrTx } from "../db/client";
import { conversationStatusEnum, conversations, customers, integrations, messages } from "../db/schema";
import { errors } from "../lib/errors";
import type { TenantContext } from "../tenancy";
import { recordAudit } from "./audit";
import { messagingProviderFor } from "./integrations";

export type ConversationStatus = (typeof conversationStatusEnum.enumValues)[number];

export const operatorReplySchema = z.object({ body: z.string().trim().min(1).max(4000) });
export const conversationStatusSchema = z.object({ status: z.enum(conversationStatusEnum.enumValues) });

export async function listConversations(db: DbOrTx, ctx: TenantContext, opts: { status?: ConversationStatus; limit?: number } = {}) {
  const filters = [eq(conversations.orgId, ctx.orgId)];
  if (opts.status) filters.push(eq(conversations.status, opts.status));
  return db
    .select({
      id: conversations.id,
      status: conversations.status,
      channel: conversations.channel,
      handoffReason: conversations.handoffReason,
      lastMessageAt: conversations.lastMessageAt,
      customerId: customers.id,
      customerName: customers.fullName,
      telegramUsername: customers.telegramUsername,
      customerPhone: customers.phone,
      lastMessage: sql<string | null>`(select m.body from ${messages} m where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1)`,
      messageCount: sql<number>`(select count(*)::int from ${messages} m where m.conversation_id = ${conversations.id})`,
    })
    .from(conversations)
    .innerJoin(customers, eq(customers.id, conversations.customerId))
    .where(and(...filters))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(Math.min(opts.limit ?? 50, 200));
}

export async function getConversation(db: Db, ctx: TenantContext, id: string) {
  const [row] = await db
    .select({ conversation: conversations, customer: customers })
    .from(conversations)
    .innerJoin(customers, eq(customers.id, conversations.customerId))
    .where(and(eq(conversations.id, id), eq(conversations.orgId, ctx.orgId)));
  if (!row) throw errors.notFound("Conversation");
  const msgs = await listConversationMessages(db, ctx.orgId, id);
  return { ...row, messages: msgs };
}

export async function setConversationStatus(db: DbOrTx, ctx: TenantContext, id: string, status: ConversationStatus) {
  const [c] = await db
    .update(conversations)
    .set({
      status,
      handoffReason: status === "handoff" ? "operator_takeover" : null,
      assignedTo: status === "handoff" ? ctx.userId : null,
      // Releasing to the bot starts a fresh funnel.
      ...(status !== "handoff" ? { state: sql`jsonb_build_object('language', ${conversations.state}->'language')` } : {}),
    })
    .where(and(eq(conversations.id, id), eq(conversations.orgId, ctx.orgId)))
    .returning();
  if (!c) throw errors.notFound("Conversation");
  await recordAudit(db, ctx, { action: `conversation.${status === "bot" ? "released" : status}`, entityType: "conversation", entityId: id });
  return c;
}

/** Sends an operator message. Replying takes the conversation over from the bot. */
export async function sendOperatorReply(db: Db, ctx: TenantContext, id: string, body: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.orgId, ctx.orgId)));
  if (!conv) throw errors.notFound("Conversation");
  const [integration] = conv.integrationId
    ? await db.select().from(integrations).where(and(eq(integrations.id, conv.integrationId), eq(integrations.orgId, ctx.orgId)))
    : [null];
  const [msg] = await db
    .insert(messages)
    .values({
      orgId: ctx.orgId,
      conversationId: id,
      direction: "outbound",
      senderType: "operator",
      senderUserId: ctx.userId,
      body,
      deliveryStatus: "pending",
    })
    .returning();
  if (conv.status !== "handoff") {
    await db
      .update(conversations)
      .set({ status: "handoff", handoffReason: "operator_takeover", assignedTo: ctx.userId })
      .where(eq(conversations.id, id));
  }
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, id));
  const provider = messagingProviderFor(conv.channel === "telegram" ? (integration ?? null) : null);
  const delivery = await deliver(db, provider, msg.id, conv.externalChatId, body, {});
  await recordAudit(db, ctx, { action: "conversation.operator_reply", entityType: "conversation", entityId: id, metadata: { delivery } });
  if (delivery === "failed") throw errors.badRequest("The message was saved but could not be delivered to Telegram. Check the integration.");
  return { ...msg, deliveryStatus: delivery };
}
