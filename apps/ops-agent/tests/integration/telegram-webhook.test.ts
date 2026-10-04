import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as webhook } from "@/app/api/telegram/webhook/[id]/route";
import type { Db } from "@/server/db/client";
import { seedDemoData } from "@/server/domains/demo";
import { createSandboxIntegration, type Integration } from "@/server/domains/integrations";
import { call, count, makeOrg, nextTgUserId, nextUpdateId, schema, type TestOrg, tgUpdate, type TgUpdateOpts } from "../helpers";

let o: TestOrg;
let db: Db;
let integration: Integration;

beforeAll(async () => {
  o = await makeOrg("Webhook");
  db = o.db;
  await seedDemoData(db, o.ctx, { conversations: false });
  integration = (await createSandboxIntegration(db, o.ctx))!;
  expect(integration.mode).toBe("sandbox");
});

function post(body: unknown, opts: { id?: string; secret?: string | null; raw?: string } = {}) {
  const id = opts.id ?? integration.id;
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = opts.secret === undefined ? integration.webhookSecret : opts.secret;
  if (secret !== null) headers["x-telegram-bot-api-secret-token"] = secret;
  return call(
    webhook,
    new Request(`http://localhost:3000/api/telegram/webhook/${id}`, { method: "POST", headers, body: opts.raw ?? JSON.stringify(body) }),
    { id },
  );
}

/** A Telegram user with their own private chat. */
function tgUser(extra: Partial<TgUpdateOpts> = {}) {
  const fromId = nextTgUserId();
  return {
    fromId,
    update: (o2: TgUpdateOpts = {}) => tgUpdate({ fromId, chatId: fromId, firstName: "Test", lastName: "User", ...extra, ...o2 }),
  };
}

async function customerFor(fromId: number) {
  const [c] = await db
    .select()
    .from(schema.customers)
    .where(and(eq(schema.customers.orgId, o.org.id), eq(schema.customers.telegramUserId, String(fromId))));
  return c ?? null;
}

async function conversationFor(fromId: number) {
  const [c] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.orgId, o.org.id), eq(schema.conversations.externalChatId, String(fromId))));
  return c ?? null;
}

async function messagesFor(fromId: number) {
  const conv = await conversationFor(fromId);
  if (!conv) return [];
  return db.select().from(schema.messages).where(eq(schema.messages.conversationId, conv.id)).orderBy(schema.messages.createdAt);
}

async function webhookEvent(updateId: number) {
  const [e] = await db
    .select()
    .from(schema.webhookEvents)
    .where(and(eq(schema.webhookEvents.integrationId, integration.id), eq(schema.webhookEvents.externalId, String(updateId))));
  return e ?? null;
}

describe("webhook authentication", () => {
  it("rejects a wrong or missing secret with 401 and processes nothing", async () => {
    const u = tgUser();
    const upd = u.update({ text: "Salom" });
    expect((await post(upd, { secret: "wrong-secret" })).status).toBe(401);
    expect((await post(upd, { secret: null })).status).toBe(401);
    expect(await webhookEvent(upd.update_id)).toBeNull();
    expect(await customerFor(u.fromId)).toBeNull();
  });

  it("unknown integration id → 401; malformed id → 404", async () => {
    expect((await post(tgUpdate({ text: "hi" }), { id: randomUUID() })).status).toBe(401);
    expect((await post(tgUpdate({ text: "hi" }), { id: "not-a-uuid" })).status).toBe(404);
  });

  it("another org's secret does not authenticate against this integration", async () => {
    const other = await makeOrg("Other");
    const otherIntegration = (await createSandboxIntegration(other.db, other.ctx))!;
    expect((await post(tgUpdate({ text: "hi" }), { secret: otherIntegration.webhookSecret })).status).toBe(401);
  });
});

describe("processing updates", () => {
  it("valid update → 200; inbound + agent reply persisted, customer + lead created, lead.created notification", async () => {
    const u = tgUser({ username: "aziza_k" });
    const upd = u.update({ text: "Salom" });
    const before = await count(db, schema.notifications, and(eq(schema.notifications.orgId, o.org.id), eq(schema.notifications.type, "lead.created")));
    const res = await post(upd);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, status: "processed" });

    const customer = await customerFor(u.fromId);
    expect(customer).toMatchObject({ fullName: "Test User", telegramUsername: "aziza_k", language: "uz" });
    const leads = await db.select().from(schema.leads).where(eq(schema.leads.customerId, customer!.id));
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ status: "new", source: "telegram" });

    const msgs = await messagesFor(u.fromId);
    expect(msgs).toHaveLength(2);
    const [inbound, reply] = msgs;
    expect(inbound).toMatchObject({ direction: "inbound", senderType: "customer", body: "Salom", deliveryStatus: "received", externalMessageId: String(upd.message.message_id) });
    expect(reply).toMatchObject({ direction: "outbound", senderType: "agent", deliveryStatus: "sent", replyToId: inbound.id, attempts: 1 });
    expect(reply.body).toContain("Assalomu alaykum");
    expect(reply.externalMessageId).toMatch(/^sandbox-/);
    expect(reply.meta).toMatchObject({ intent: "greeting", provider: "rules" });

    const after = await count(db, schema.notifications, and(eq(schema.notifications.orgId, o.org.id), eq(schema.notifications.type, "lead.created")));
    expect(after - before).toBe(1);
    expect((await webhookEvent(upd.update_id))!.status).toBe("processed");
  });

  it("/start greets", async () => {
    const u = tgUser();
    const res = await post(u.update({ text: "/start" }));
    expect(res.status).toBe(200);
    const msgs = await messagesFor(u.fromId);
    expect(msgs[1].meta.intent).toBe("greeting");
  });

  it("the same update_id delivered twice → exactly one inbound, one reply, one lead", async () => {
    const u = tgUser();
    const upd = u.update({ text: "Ingliz tili narxi qancha?" });
    const r1 = await post(upd);
    const r2 = await post(upd);
    expect(r1.body.status).toBe("processed");
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe("duplicate");
    const msgs = await messagesFor(u.fromId);
    expect(msgs.filter((m) => m.direction === "inbound")).toHaveLength(1);
    expect(msgs.filter((m) => m.senderType === "agent")).toHaveLength(1);
    const customer = await customerFor(u.fromId);
    expect(await count(db, schema.leads, eq(schema.leads.customerId, customer!.id))).toBe(1);
    expect((await webhookEvent(upd.update_id))!.attempts).toBe(1);
  });

  it("the same update delivered concurrently → exactly one inbound, one reply, one lead", async () => {
    const u = tgUser();
    const upd = u.update({ text: "Narxlar qancha?" });
    const results = await Promise.all([post(upd), post(upd), post(upd), post(upd)]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.status === "processed")).toHaveLength(1);
    const msgs = await messagesFor(u.fromId);
    expect(msgs.filter((m) => m.direction === "inbound")).toHaveLength(1);
    expect(msgs.filter((m) => m.senderType === "agent")).toHaveLength(1);
    const customer = await customerFor(u.fromId);
    expect(await count(db, schema.leads, eq(schema.leads.customerId, customer!.id))).toBe(1);
    expect(await count(db, schema.customers, and(eq(schema.customers.orgId, o.org.id), eq(schema.customers.telegramUserId, String(u.fromId))))).toBe(1);
  });

  it("concurrent distinct first messages from a new user → one customer, one lead, one conversation", async () => {
    const u = tgUser();
    const results = await Promise.all([u.update({ text: "Salom" }), u.update({ text: "Narxlar?" }), u.update({ text: "Kurslar" })].map((x) => post(x)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const customer = await customerFor(u.fromId);
    expect(await count(db, schema.leads, eq(schema.leads.customerId, customer!.id))).toBe(1);
    expect(await count(db, schema.conversations, eq(schema.conversations.customerId, customer!.id))).toBe(1);
    const msgs = await messagesFor(u.fromId);
    expect(msgs.filter((m) => m.direction === "inbound")).toHaveLength(3);
  });

  it("same message_id with a different update_id → no duplicate message or reply", async () => {
    const u = tgUser();
    const messageId = nextUpdateId();
    const r1 = await post(u.update({ text: "Salom", messageId }));
    const r2 = await post(u.update({ text: "Salom", messageId }));
    expect(r1.body.status).toBe("processed");
    expect(r2.body.status).toBe("processed");
    const msgs = await messagesFor(u.fromId);
    expect(msgs).toHaveLength(2);
    expect(msgs.filter((m) => m.direction === "inbound")).toHaveLength(1);
  });

  it("full booking flow over several updates → exactly one booking, lead trial_booked, even if the last update is redelivered", async () => {
    const u = tgUser();
    const r1 = await post(u.update({ text: "Ingliz tili kursiga yozilmoqchiman" }));
    expect(r1.status).toBe(200);
    let conv = (await conversationFor(u.fromId))!;
    expect(conv.state.stage).toBe("awaiting_slot");
    expect(conv.state.offeredSlotIds?.length).toBe(3);
    const chosen = conv.state.offeredSlotIds![0];

    await post(u.update({ text: "1" }));
    conv = (await conversationFor(u.fromId))!;
    expect(conv.state).toMatchObject({ stage: "awaiting_phone", slotId: chosen });

    const last = u.update({ text: "+998 90 123 45 67" });
    await post(last);
    const redelivered = await post(last);
    expect(redelivered.body.status).toBe("duplicate");
    await post(u.update({ text: "+998 90 123 45 67", messageId: last.message.message_id })); // same message, new update id

    const customer = (await customerFor(u.fromId))!;
    expect(customer.phone).toBe("+998901234567");
    const bookings = await db.select().from(schema.bookings).where(eq(schema.bookings.customerId, customer.id));
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ slotId: chosen, status: "confirmed", source: "telegram" });
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.customerId, customer.id));
    expect(lead.status).toBe("trial_booked");
    expect(bookings[0].leadId).toBe(lead.id);
    conv = (await conversationFor(u.fromId))!;
    expect(conv.state.stage).toBe("booked");
    const msgs = await messagesFor(u.fromId);
    expect(msgs.filter((m) => m.direction === "inbound")).toHaveLength(3);
    expect(msgs.filter((m) => m.senderType === "agent")).toHaveLength(3);
    expect(msgs.at(-1)!.body).toContain("✅");
    const bookingNotes = await db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.orgId, o.org.id), eq(schema.notifications.type, "booking.created"), eq(schema.notifications.link, `/bookings?highlight=${bookings[0].id}`)));
    expect(bookingNotes).toHaveLength(1);
  });

  it("contact share saves the phone and qualifies the lead", async () => {
    const u = tgUser();
    await post(u.update({ text: "Salom" }));
    const res = await post(u.update({ contact: { phone_number: "998901112233", user_id: u.fromId } }));
    expect(res.body.status).toBe("processed");
    const customer = (await customerFor(u.fromId))!;
    expect(customer.phone).toBe("+998901112233");
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.customerId, customer.id));
    expect(lead.status).toBe("qualified");
    const msgs = await messagesFor(u.fromId);
    expect(msgs.find((m) => m.direction === "inbound" && m.body.includes("+998901112233"))).toBeDefined();
  });

  it("someone else's contact card without text is ignored", async () => {
    const u = tgUser();
    const upd = u.update({ contact: { phone_number: "+998900000000", user_id: 1 } });
    const res = await post(upd);
    expect(res.body.status).toBe("ignored");
    expect(await customerFor(u.fromId)).toBeNull();
    expect((await webhookEvent(upd.update_id))!).toMatchObject({ status: "ignored", error: "unsupported_message_type" });
  });

  it("group chats are ignored", async () => {
    const u = tgUser();
    const upd = u.update({ text: "Salom", chatType: "group", chatId: -100123 });
    const res = await post(upd);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ignored");
    expect(await customerFor(u.fromId)).toBeNull();
    expect((await webhookEvent(upd.update_id))!).toMatchObject({ status: "ignored", error: "non_private_chat" });
  });

  it("bot senders are ignored", async () => {
    const u = tgUser({ isBot: true });
    const upd = u.update({ text: "Salom" });
    const res = await post(upd);
    expect(res.body.status).toBe("ignored");
    expect(await customerFor(u.fromId)).toBeNull();
    expect((await webhookEvent(upd.update_id))!.error).toBe("bot_or_anonymous_sender");
  });

  it("updates without a message (e.g. callback_query) are ignored", async () => {
    const id = nextUpdateId();
    const res = await post({ update_id: id, callback_query: { id: "1" } });
    expect(res.body.status).toBe("ignored");
    expect((await webhookEvent(id))!.error).toBe("no_message");
  });

  it("complaint → conversation handoff, notification and audit entry", async () => {
    const u = tgUser();
    await post(u.update({ text: "Pulimni qaytarib bering, darslar yomon!" }));
    const conv = (await conversationFor(u.fromId))!;
    expect(conv.status).toBe("handoff");
    expect(conv.handoffReason).toBe("complaint");
    const notes = await db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.orgId, o.org.id), eq(schema.notifications.link, `/conversations/${conv.id}`)));
    expect(notes.map((n) => n.type)).toEqual(["conversation.handoff"]);
    expect(notes[0].body).toContain("complaint");
    expect(await count(db, schema.auditLogs, and(eq(schema.auditLogs.entityId, conv.id), eq(schema.auditLogs.action, "conversation.handoff")))).toBe(1);
    const msgs = await messagesFor(u.fromId);
    expect(msgs.at(-1)!.senderType).toBe("agent");
  });

  it("a conversation in handoff gets no automatic reply", async () => {
    const u = tgUser();
    await post(u.update({ text: "operator kerak" }));
    expect((await conversationFor(u.fromId))!.status).toBe("handoff");
    const res = await post(u.update({ text: "Narxlar qancha?" }));
    expect(res.body.status).toBe("processed");
    const msgs = await messagesFor(u.fromId);
    expect(msgs.filter((m) => m.direction === "inbound")).toHaveLength(2);
    expect(msgs.filter((m) => m.senderType === "agent")).toHaveLength(1);
  });

  it("invalid JSON → 400", async () => {
    const res = await post(null, { raw: "{oops" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_json");
  });

  it("malformed update → 200 and ignored without side effects", async () => {
    const res = await post({ hello: "world" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const res2 = await post({ update_id: "abc", message: { text: 1 } });
    expect(res2.status).toBe(200);
    expect(await count(db, schema.webhookEvents, eq(schema.webhookEvents.externalId, "abc"))).toBe(0);
  });

  it("a disabled integration acknowledges without processing", async () => {
    const other = await makeOrg("Disabled");
    const integ = (await createSandboxIntegration(other.db, other.ctx))!;
    await other.db.update(schema.integrations).set({ status: "disabled" }).where(eq(schema.integrations.id, integ.id));
    const upd = tgUpdate({ text: "Salom" });
    const res = await call(
      webhook,
      new Request(`http://localhost:3000/api/telegram/webhook/${integ.id}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": integ.webhookSecret },
        body: JSON.stringify(upd),
      }),
      { id: integ.id },
    );
    expect(res.status).toBe(200);
    expect(await count(other.db, schema.webhookEvents, eq(schema.webhookEvents.integrationId, integ.id))).toBe(0);
  });
});
