import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POST as testChatReset } from "@/app/api/v1/agent/test-chat/reset/route";
import { POST as testChatRoute } from "@/app/api/v1/agent/test-chat/route";
import { type InboundMessage, processInbound } from "@/server/agent/orchestrator";
import { T } from "@/server/agent/templates";
import type { Db } from "@/server/db/client";
import { updateAgentSettings } from "@/server/domains/agent-settings";
import { buildDailyReport, getOverview, sendDailyReports } from "@/server/domains/analytics";
import { listConversations, sendOperatorReply, setConversationStatus } from "@/server/domains/conversations";
import { createKnowledge } from "@/server/domains/knowledge";
import { seedDemoData } from "@/server/domains/demo";
import { createSandboxIntegration } from "@/server/domains/integrations";
import { resetTestChat, sendTestMessage } from "@/server/domains/test-chat";
import type { LlmProvider, LlmRequest } from "@/server/providers/llm";
import { SandboxMessagingProvider } from "@/server/providers/messaging/sandbox";
import { addCourse, addSlot, apiRequest, call, count, makeOrg, schema, type TestOrg } from "../helpers";

/** Sends customer messages for one Telegram user through the real pipeline. */
function customer(o: TestOrg, integrationId: string | null, name = "Aziza Karimova") {
  const userId = `u-${randomUUID().slice(0, 8)}`;
  const messaging = new SandboxMessagingProvider();
  let seq = 0;
  const send = (text: string, extra: Partial<InboundMessage> = {}, llm: LlmProvider | null = null) =>
    processInbound(
      o.db,
      { orgId: o.org.id, channel: "telegram", integrationId, chatId: userId, from: { userId, fullName: name }, text, externalMessageId: `${userId}-${++seq}`, ...extra },
      { messaging, llm },
    );
  return { userId, messaging, send };
}

async function leadOf(db: Db, orgId: string, telegramUserId: string) {
  const [row] = await db
    .select({ lead: schema.leads })
    .from(schema.leads)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.leads.customerId))
    .where(and(eq(schema.leads.orgId, orgId), eq(schema.customers.telegramUserId, telegramUserId)));
  return row?.lead ?? null;
}

async function conversationOf(db: Db, orgId: string, chatId: string) {
  const [c] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.orgId, orgId), eq(schema.conversations.externalChatId, chatId)));
  return c;
}

async function setupCatalog(o: TestOrg) {
  const english = await addCourse(o.db, o.ctx);
  const s1 = await addSlot(o.db, o.ctx, english.id, { startsAt: new Date(Date.now() + 26 * 3600_000), location: "Room 1" });
  const s2 = await addSlot(o.db, o.ctx, english.id, { startsAt: new Date(Date.now() + 50 * 3600_000), location: "Room 2" });
  const integration = (await createSandboxIntegration(o.db, o.ctx))!;
  return { english, s1, s2, integration };
}

describe("processInbound: lead lifecycle and conversation state", () => {
  it("new → contacted (course interest) → qualified (phone) → trial_booked (booking)", async () => {
    const o = await makeOrg("Lifecycle");
    const { english, s1, integration } = await setupCatalog(o);
    const c = customer(o, integration.id);

    const r1 = await c.send("Salom");
    expect(r1).toMatchObject({ duplicate: false, replied: true, delivery: "sent" });
    expect((await leadOf(o.db, o.org.id, c.userId))!.status).toBe("new");

    await c.send("Ingliz tili narxi qancha?");
    let lead = (await leadOf(o.db, o.org.id, c.userId))!;
    expect(lead).toMatchObject({ status: "contacted", interestedCourseId: english.id });
    let conv = await conversationOf(o.db, o.org.id, c.userId);
    expect(conv.state).toMatchObject({ courseId: english.id, stage: "idle", language: "uz" });

    const r3 = await c.send("Sinov darsiga yozilmoqchiman");
    expect(r3.reply).toContain("1) ");
    conv = await conversationOf(o.db, o.org.id, c.userId);
    expect(conv.state).toMatchObject({ stage: "awaiting_slot", offeredSlotIds: [s1.id, expect.any(String)] });

    const r4 = await c.send("1");
    expect(r4.reply).toBe(T.uz.askPhone);
    expect(c.messaging.sent.at(-1)!.opts).toMatchObject({ requestContact: true });
    conv = await conversationOf(o.db, o.org.id, c.userId);
    expect(conv.state).toMatchObject({ stage: "awaiting_phone", slotId: s1.id });
    expect((await leadOf(o.db, o.org.id, c.userId))!.status).toBe("contacted");

    const r5 = await c.send("+998 90 123 45 67");
    expect(r5.decision!.actions.map((a) => a.type)).toEqual(["save_phone", "book"]);
    lead = (await leadOf(o.db, o.org.id, c.userId))!;
    expect(lead.status).toBe("trial_booked");
    const [cust] = await o.db.select().from(schema.customers).where(eq(schema.customers.id, lead.customerId));
    expect(cust.phone).toBe("+998901234567");
    const bookings = await o.db.select().from(schema.bookings).where(eq(schema.bookings.customerId, lead.customerId));
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ slotId: s1.id, courseId: english.id, leadId: lead.id, source: "telegram" });
    conv = await conversationOf(o.db, o.org.id, c.userId);
    expect(conv.state.stage).toBe("booked");

    const transitions = await o.db
      .select()
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.entityId, lead.id), eq(schema.auditLogs.action, "lead.status_changed")))
      .orderBy(schema.auditLogs.createdAt);
    expect(transitions.map((t) => (t.metadata as { to: string }).to)).toEqual(["contacted", "qualified", "trial_booked"]);
  });

  it("phone sent on its own qualifies a new lead", async () => {
    const o = await makeOrg("Phone");
    const { integration } = await setupCatalog(o);
    const c = customer(o, integration.id);
    const r = await c.send("Raqamim 93 555 44 33");
    expect(r.reply).toBe(T.uz.phoneSaved);
    expect((await leadOf(o.db, o.org.id, c.userId))!.status).toBe("qualified");
  });

  it("lists conversations with message counts and last message", async () => {
    const o = await makeOrg("List");
    const { integration } = await setupCatalog(o);
    const c = customer(o, integration.id);
    await c.send("Salom");
    await c.send("Rahmat");
    const [row] = await listConversations(o.db, o.ctx);
    expect(row.messageCount).toBe(4);
    expect(row.lastMessage).toBe(T.uz.thanks);
    expect(row.customerName).toBe("Aziza Karimova");
  });

  it("auto replies disabled → inbound stored, no reply", async () => {
    const o = await makeOrg("NoAuto");
    const { integration } = await setupCatalog(o);
    await updateAgentSettings(o.db, o.ctx, { autoReplyEnabled: false });
    const c = customer(o, integration.id);
    const r = await c.send("Salom");
    expect(r.replied).toBe(false);
    expect(c.messaging.sent).toHaveLength(0);
    expect(await count(o.db, schema.messages, eq(schema.messages.orgId, o.org.id))).toBe(1);
  });
});

describe("operator handoff", () => {
  it("operator reply switches to handoff and the bot stays silent; releasing to bot resumes auto replies", async () => {
    const o = await makeOrg("Handoff");
    const { integration } = await setupCatalog(o);
    const c = customer(o, integration.id);
    const first = await c.send("Ingliz tili kursiga yozilmoqchiman");
    const convId = first.conversationId;

    const msg = await sendOperatorReply(o.db, o.ctx, convId, "Salom, men operator Dilnoza.");
    expect(msg).toMatchObject({ senderType: "operator", senderUserId: o.user.id, deliveryStatus: "sent" });
    let conv = await conversationOf(o.db, o.org.id, c.userId);
    expect(conv).toMatchObject({ status: "handoff", handoffReason: "operator_takeover", assignedTo: o.user.id });

    const sentBefore = c.messaging.sent.length;
    const r = await c.send("Narxi qancha?");
    expect(r.replied).toBe(false);
    expect(c.messaging.sent.length).toBe(sentBefore);
    const agentReplies = await count(o.db, schema.messages, and(eq(schema.messages.conversationId, convId), eq(schema.messages.senderType, "agent")));
    expect(agentReplies).toBe(1);

    const released = await setConversationStatus(o.db, o.ctx, convId, "bot");
    expect(released).toMatchObject({ status: "bot", handoffReason: null, assignedTo: null });
    expect(released.state).toEqual({ language: "uz" });

    const r2 = await c.send("Narxi qancha?");
    expect(r2.replied).toBe(true);
    expect(r2.reply).toContain("450");
    conv = await conversationOf(o.db, o.org.id, c.userId);
    expect(conv.status).toBe("bot");
  });

  it("a closed conversation reopens to the bot on the next customer message", async () => {
    const o = await makeOrg("Closed");
    const { integration } = await setupCatalog(o);
    const c = customer(o, integration.id);
    const r1 = await c.send("Salom");
    await setConversationStatus(o.db, o.ctx, r1.conversationId, "closed");
    const r2 = await c.send("Narxlar?");
    expect(r2.replied).toBe(true);
    expect((await conversationOf(o.db, o.org.id, c.userId)).status).toBe("bot");
  });
});

describe("grounded LLM fallback in the pipeline", () => {
  class FakeLlm implements LlmProvider {
    readonly name = "fake-llm";
    calls: LlmRequest[] = [];
    constructor(private readonly reply: () => Promise<string>) {}
    complete(req: LlmRequest) {
      this.calls.push(req);
      return this.reply();
    }
  }

  it("uses a grounded LLM answer for unknown questions, only with approved knowledge in the prompt", async () => {
    const o = await makeOrg("Llm");
    const { integration } = await setupCatalog(o);
    await createKnowledge(o.db, o.ctx, { title: "Parking", content: "Bepul avtoturargoh bor.", category: "faq", keywords: [], status: "approved" });
    await createKnowledge(o.db, o.ctx, { title: "Draft camp", content: "Yozgi lager 999 000", category: "faq", keywords: [], status: "draft" });
    const llm = new FakeLlm(async () => "Ha, bepul avtoturargoh bor.");
    const c = customer(o, integration.id);
    const r = await c.send("Mashina qo'yish joyi bormi?", {}, llm);
    expect(r.reply).toBe("Ha, bepul avtoturargoh bor.");
    expect(llm.calls[0].system).toContain("Bepul avtoturargoh bor.");
    expect(llm.calls[0].system).not.toContain("Yozgi lager");
    const [agentMsg] = await o.db.select().from(schema.messages).where(and(eq(schema.messages.orgId, o.org.id), eq(schema.messages.senderType, "agent")));
    expect(agentMsg.meta).toMatchObject({ provider: "fake-llm", intent: "faq" });
    expect((await conversationOf(o.db, o.org.id, c.userId)).state.unknownCount ?? 0).toBe(0);
  });

  it("falls back to the rules reply when the LLM hallucinates or fails", async () => {
    const o = await makeOrg("LlmBad");
    const { integration } = await setupCatalog(o);
    const c = customer(o, integration.id);
    const r1 = await c.send("Mashina qo'yish joyi bormi?", {}, new FakeLlm(async () => "Ha, oyiga 70 000 so'm."));
    expect(r1.reply).toBe(T.uz.unknown);
    const r2 = await c.send("Basseyn bormi?", {}, new FakeLlm(async () => Promise.reject(new Error("timeout"))));
    expect(r2.decision!.actions).toEqual([{ type: "handoff", reason: "unable_to_answer" }]);
    expect((await conversationOf(o.db, o.org.id, c.userId)).status).toBe("handoff");
  });

  it("llmEnabled=false never calls the model", async () => {
    const o = await makeOrg("LlmOff");
    const { integration } = await setupCatalog(o);
    await updateAgentSettings(o.db, o.ctx, { llmEnabled: false });
    const llm = new FakeLlm(async () => "x");
    await customer(o, integration.id).send("Mashina qo'yish joyi bormi?", {}, llm);
    expect(llm.calls).toHaveLength(0);
  });
});

describe("test chat", () => {
  it("sendTestMessage runs the real pipeline in a web_test conversation; resetTestChat clears it", async () => {
    const o = await makeOrg("TestChat");
    await setupCatalog(o);
    const user = { id: o.user.id, name: "Owner User" };
    const id1 = randomUUID();
    const r1 = await sendTestMessage(o.db, o.ctx, user, "Salom", id1);
    expect(r1.replied).toBe(true);
    expect(r1.reply).toContain("Assalomu alaykum");
    const dup = await sendTestMessage(o.db, o.ctx, user, "Salom", id1);
    expect(dup.duplicate).toBe(true);
    await sendTestMessage(o.db, o.ctx, user, "Ingliz tili narxi?", randomUUID());

    const [conv] = await o.db.select().from(schema.conversations).where(eq(schema.conversations.id, r1.conversationId));
    expect(conv).toMatchObject({ channel: "web_test", externalChatId: `web:${o.user.id}`, integrationId: null });
    const [lead] = await o.db.select().from(schema.leads).where(eq(schema.leads.customerId, conv.customerId));
    expect(lead).toMatchObject({ source: "test_chat", status: "contacted" });
    expect(await count(o.db, schema.messages, eq(schema.messages.conversationId, conv.id))).toBe(4);

    await resetTestChat(o.db, o.ctx, o.user.id);
    expect(await count(o.db, schema.conversations, eq(schema.conversations.orgId, o.org.id))).toBe(0);
    expect(await count(o.db, schema.customers, eq(schema.customers.orgId, o.org.id))).toBe(0);
    expect(await count(o.db, schema.leads, eq(schema.leads.orgId, o.org.id))).toBe(0);

    const fresh = await sendTestMessage(o.db, o.ctx, user, "Salom", id1);
    expect(fresh.duplicate).toBe(false);
  });

  it("test chat API: reply payload, validation, reset", async () => {
    const o = await makeOrg("TestChatApi");
    await setupCatalog(o);
    const res = await call(testChatRoute, apiRequest("POST", "/api/v1/agent/test-chat", { token: o.token, body: { text: "operator kerak", clientMessageId: randomUUID() } }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ intent: "human", handedOff: true, actions: ["handoff"], duplicate: false });
    const bad = await call(testChatRoute, apiRequest("POST", "/api/v1/agent/test-chat", { token: o.token, body: { text: "", clientMessageId: "x" } }));
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details).sort()).toEqual(["clientMessageId", "text"]);
    const reset = await call(testChatReset, apiRequest("POST", "/api/v1/agent/test-chat/reset", { token: o.token }));
    expect(reset.status).toBe(200);
    expect(await count(o.db, schema.conversations, eq(schema.conversations.orgId, o.org.id))).toBe(0);
  });
});

describe("demo data", () => {
  it("seedDemoData creates catalog, knowledge, genuine bookings and handoffs; second run is skipped", async () => {
    const o = await makeOrg("Demo");
    const r = await seedDemoData(o.db, o.ctx);
    expect(r).toEqual({ skipped: false, courses: 5 });
    const db = o.db;
    const org = eq(schema.courses.orgId, o.org.id);
    expect(await count(db, schema.courses, org)).toBe(5);
    expect(await count(db, schema.courseSlots, eq(schema.courseSlots.orgId, o.org.id))).toBe(30);
    expect(await count(db, schema.knowledgeArticles, and(eq(schema.knowledgeArticles.orgId, o.org.id), eq(schema.knowledgeArticles.status, "approved")))).toBe(5);
    expect(await count(db, schema.customers, eq(schema.customers.orgId, o.org.id))).toBe(5);
    expect(await count(db, schema.leads, eq(schema.leads.orgId, o.org.id))).toBe(5);

    const bookings = await db
      .select({ name: schema.customers.fullName, course: schema.courses.name })
      .from(schema.bookings)
      .innerJoin(schema.customers, eq(schema.customers.id, schema.bookings.customerId))
      .innerJoin(schema.courses, eq(schema.courses.id, schema.bookings.courseId))
      .where(eq(schema.bookings.orgId, o.org.id));
    expect(bookings.map((b) => `${b.name}:${b.course}`).sort()).toEqual(["Aziza Karimova:Ingliz tili (General English)", "Bekzod Tursunov:IELTS Intensive"]);

    const handoffs = await db
      .select({ name: schema.customers.fullName, reason: schema.conversations.handoffReason })
      .from(schema.conversations)
      .innerJoin(schema.customers, eq(schema.customers.id, schema.conversations.customerId))
      .where(and(eq(schema.conversations.orgId, o.org.id), eq(schema.conversations.status, "handoff")));
    expect(handoffs.map((h) => `${h.name}:${h.reason}`).sort()).toEqual(["John Miller:unable_to_answer", "Malika Yusupova:complaint"]);

    const trialBooked = await count(db, schema.leads, and(eq(schema.leads.orgId, o.org.id), eq(schema.leads.status, "trial_booked")));
    expect(trialBooked).toBe(2);
    // Every inbound message got exactly one agent reply (no handoff conversations are silent before handoff).
    const inbound = await count(db, schema.messages, and(eq(schema.messages.orgId, o.org.id), eq(schema.messages.direction, "inbound")));
    const agent = await count(db, schema.messages, and(eq(schema.messages.orgId, o.org.id), eq(schema.messages.senderType, "agent")));
    expect(inbound).toBe(17);
    expect(agent).toBe(17);

    expect(await seedDemoData(o.db, o.ctx)).toEqual({ skipped: true });
    expect(await count(db, schema.courses, org)).toBe(5);
  });
});

describe("analytics", () => {
  it("getOverview numbers match the data created", async () => {
    const o = await makeOrg("Analytics");
    const { english, integration } = await setupCatalog(o);
    // 1: books a trial.
    const a = customer(o, integration.id, "Booker");
    await a.send("Ingliz tili kursiga yozilmoqchiman");
    await a.send("1");
    await a.send("+998901234567");
    // 2: complaint → handoff.
    const b = customer(o, integration.id, "Angry");
    await b.send("Pulimni qaytaring, shikoyat qilaman");
    // 3: greeting only.
    const c = customer(o, integration.id, "Hello");
    await c.send("Salom");

    const ov = await getOverview(o.db, o.ctx, "Asia/Tashkent");
    expect(ov.leads30d).toBe(3);
    expect(ov.leadsToday).toBe(3);
    expect(ov.bookings30d).toBe(1);
    expect(ov.upcomingBookings).toBe(1);
    expect(ov.openHandoffs).toBe(1);
    expect(ov.conversations30d).toBe(3);
    expect(ov.conversion30d).toBeCloseTo(1 / 3, 5);
    expect(ov.automationRate30d).toBe(1); // 5 inbound, 5 agent replies
    expect(ov.funnel).toEqual([
      { status: "new", count: 2 },
      { status: "contacted", count: 0 },
      { status: "qualified", count: 0 },
      { status: "trial_booked", count: 1 },
      { status: "won", count: 0 },
      { status: "lost", count: 0 },
    ]);
    expect(ov.leadsByDay).toHaveLength(14);
    expect(ov.leadsByDay.at(-1)).toMatchObject({ leads: 3, bookings: 1 });
    expect(ov.leadsByDay.slice(0, -1).every((d) => d.leads === 0 && d.bookings === 0)).toBe(true);
    expect(ov.topCourses).toEqual([{ name: english.name, leads: 1 }]);
  });

  it("an empty org has zeroed metrics", async () => {
    const o = await makeOrg("Empty");
    const ov = await getOverview(o.db, o.ctx);
    expect(ov).toMatchObject({ leads30d: 0, bookings30d: 0, conversion30d: 0, automationRate30d: 0, openHandoffs: 0, topCourses: [] });
  });

  it("sendDailyReports creates a daily_report notification for an org with yesterday's activity only", async () => {
    const active = await makeOrg("Yesterday");
    const { integration } = await setupCatalog(active);
    const c = customer(active, integration.id);
    await c.send("Salom");
    await c.send("operator kerak");
    const db = active.db;
    const orgId = active.org.id;
    for (const table of ["leads", "messages", "audit_logs", "customers", "conversations"]) {
      await db.execute(sql`update ${sql.raw(`ops_agent.${table}`)} set created_at = now() - interval '1 day' where org_id = ${orgId}`);
    }
    const idle = await makeOrg("Idle");

    const report = await buildDailyReport(db, orgId, "Asia/Tashkent");
    expect(report).toEqual({ leads: 1, bookings: 0, handoffs: 1, inbound: 2, agentReplies: 2 });

    const r = await sendDailyReports(db);
    expect(r.sent).toBeGreaterThanOrEqual(1);
    expect(r.organizations).toBeGreaterThanOrEqual(2);
    const [note] = await db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.orgId, orgId), eq(schema.notifications.type, "daily_report")));
    expect(note.title).toBe(`Daily report — ${active.org.name}`);
    expect(note.body).toContain("Leads: 1");
    expect(note.body).toContain("Messages received: 2");
    expect(note.body).toContain("Automated replies: 2");
    expect(note.body).toContain("Handoffs to staff: 1");
    expect(await count(db, schema.notifications, and(eq(schema.notifications.orgId, idle.org.id), eq(schema.notifications.type, "daily_report")))).toBe(0);
  });
});
