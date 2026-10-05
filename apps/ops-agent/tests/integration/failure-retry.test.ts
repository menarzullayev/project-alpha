import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST as webhook } from "@/app/api/telegram/webhook/[id]/route";
import { POST as connectRoute } from "@/app/api/v1/integrations/telegram/route";
import { DeliveryError, processInbound } from "@/server/agent/orchestrator";
import { createBooking } from "@/server/domains/bookings";
import { deactivateSlot, listSlots } from "@/server/domains/courses";
import { createCustomer } from "@/server/domains/customers";
import { connectTelegram, createSandboxIntegration, type Integration, setTelegramFetchForTests } from "@/server/domains/integrations";
import { createManualLead, getLead } from "@/server/domains/leads";
import { handleTelegramUpdate } from "@/server/domains/telegram-webhook";
import { decryptSecret } from "@/server/lib/crypto";
import { AppError } from "@/server/lib/errors";
import type { MessagingProvider, OutboundOptions } from "@/server/providers/messaging/types";
import { SandboxMessagingProvider } from "@/server/providers/messaging/sandbox";
import { addCourse, addSlot, apiRequest, call, count, makeOrg, schema, type TestOrg, tgUpdate } from "../helpers";

class FlakyProvider implements MessagingProvider {
  readonly name = "flaky";
  calls: { chatId: string; text: string; opts?: OutboundOptions }[] = [];
  constructor(private failures: number) {}
  async sendText(chatId: string, text: string, opts?: OutboundOptions) {
    this.calls.push({ chatId, text, opts });
    if (this.failures > 0) {
      this.failures--;
      throw new Error("Telegram sendMessage failed: 502 Bad Gateway");
    }
    return { externalId: `ext-${this.calls.length}` };
  }
}

const BOT_TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw_test";

describe("delivery failure and redelivery", () => {
  let o: TestOrg;
  let integration: Integration;
  beforeAll(async () => {
    o = await makeOrg("Retry");
    integration = (await createSandboxIntegration(o.db, o.ctx))!;
  });

  async function rowsFor(chatId: number) {
    const [conv] = await o.db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.orgId, o.org.id), eq(schema.conversations.externalChatId, String(chatId))));
    const msgs = await o.db.select().from(schema.messages).where(eq(schema.messages.conversationId, conv.id));
    return { conv, inbound: msgs.filter((m) => m.direction === "inbound"), agent: msgs.filter((m) => m.senderType === "agent") };
  }

  it("throws, marks the event and reply failed, then a redelivery re-sends the same reply exactly once", async () => {
    const upd = tgUpdate({ text: "Salom" });
    const chatId = upd.message.chat as { id: number };
    const flaky = new FlakyProvider(1);
    await expect(handleTelegramUpdate(o.db, integration, upd, { llm: null, messaging: flaky })).rejects.toBeInstanceOf(DeliveryError);

    const [event] = await o.db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.externalId, String(upd.update_id)));
    expect(event).toMatchObject({ status: "failed", attempts: 1 });
    expect(event.error).toMatch(/delivery failed/i);
    let rows = await rowsFor(chatId.id);
    expect(rows.inbound).toHaveLength(1);
    expect(rows.agent).toHaveLength(1);
    expect(rows.agent[0]).toMatchObject({ deliveryStatus: "failed", attempts: 1 });
    expect(rows.agent[0].error).toContain("502");
    const failedNotes = await o.db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.orgId, o.org.id), eq(schema.notifications.type, "message.delivery_failed")));
    expect(failedNotes).toHaveLength(1);

    const working = new SandboxMessagingProvider();
    const outcome = await handleTelegramUpdate(o.db, integration, upd, { llm: null, messaging: working });
    expect(outcome.status).toBe("processed");
    if (outcome.status === "processed") expect(outcome.result).toMatchObject({ duplicate: true, replied: true, delivery: "sent" });
    expect(working.sent).toHaveLength(1);
    expect(working.sent[0].text).toBe(rows.agent[0].body);

    rows = await rowsFor(chatId.id);
    expect(rows.inbound).toHaveLength(1);
    expect(rows.agent).toHaveLength(1);
    expect(rows.agent[0]).toMatchObject({ deliveryStatus: "sent", attempts: 2, error: null });
    const [event2] = await o.db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.externalId, String(upd.update_id)));
    expect(event2).toMatchObject({ status: "processed", attempts: 2, error: null });

    // A third delivery of an already processed update does nothing.
    const again = new SandboxMessagingProvider();
    expect((await handleTelegramUpdate(o.db, integration, upd, { llm: null, messaging: again })).status).toBe("duplicate");
    expect(again.sent).toHaveLength(0);
  });

  it("a failed redelivery keeps the event failed and the reply retryable", async () => {
    const upd = tgUpdate({ text: "Narxlar qancha?" });
    await expect(handleTelegramUpdate(o.db, integration, upd, { llm: null, messaging: new FlakyProvider(5) })).rejects.toThrow();
    await expect(handleTelegramUpdate(o.db, integration, upd, { llm: null, messaging: new FlakyProvider(5) })).rejects.toThrow();
    const [event] = await o.db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.externalId, String(upd.update_id)));
    expect(event).toMatchObject({ status: "failed", attempts: 2 });
    const rows = await rowsFor((upd.message.chat as { id: number }).id);
    expect(rows.agent).toHaveLength(1);
    expect(rows.agent[0]).toMatchObject({ deliveryStatus: "failed", attempts: 2 });
    const ok = new SandboxMessagingProvider();
    await handleTelegramUpdate(o.db, integration, upd, { llm: null, messaging: ok });
    expect(ok.sent).toHaveLength(1);
  });

  it("processInbound redelivery with a sent reply does not send again", async () => {
    const p = new SandboxMessagingProvider();
    const msg = {
      orgId: o.org.id,
      channel: "telegram" as const,
      integrationId: integration.id,
      chatId: "direct-1",
      from: { userId: "direct-1", fullName: "Direct" },
      text: "Salom",
      externalMessageId: "m-1",
    };
    const r1 = await processInbound(o.db, msg, { messaging: p, llm: null });
    const r2 = await processInbound(o.db, msg, { messaging: p, llm: null });
    expect(r1).toMatchObject({ duplicate: false, replied: true, delivery: "sent" });
    expect(r2).toMatchObject({ duplicate: true, replied: false, inboundMessageId: r1.inboundMessageId });
    expect(p.sent).toHaveLength(1);
  });
});

describe("booking capacity and idempotency", () => {
  let o: TestOrg;
  beforeAll(async () => {
    o = await makeOrg("Booking");
  });

  it("capacity 1: two different customers booking concurrently → one succeeds, the other gets 409", async () => {
    const course = await addCourse(o.db, o.ctx);
    const slot = await addSlot(o.db, o.ctx, course.id, { capacity: 1 });
    const c1 = await createCustomer(o.db, o.ctx, { fullName: "One" });
    const c2 = await createCustomer(o.db, o.ctx, { fullName: "Two" });
    const results = await Promise.allSettled([
      createBooking(o.db, o.ctx, { customerId: c1.id, slotId: slot.id }),
      createBooking(o.db, o.ctx, { customerId: c2.id, slotId: slot.id }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(AppError);
    expect(failed[0].reason.status).toBe(409);
    expect(await count(o.db, schema.bookings, eq(schema.bookings.slotId, slot.id))).toBe(1);
  });

  it("listSlots reports booked/available from active bookings", async () => {
    const course = await addCourse(o.db, o.ctx, { name: "Capacity Course" });
    const slot = await addSlot(o.db, o.ctx, course.id, { capacity: 2 });
    const c1 = await createCustomer(o.db, o.ctx, { fullName: "Booked One" });
    await createBooking(o.db, o.ctx, { customerId: c1.id, slotId: slot.id });
    const [s] = (await listSlots(o.db, o.ctx, { courseId: course.id }));
    expect(s.booked).toBe(1);
    expect(s.available).toBe(1);
  });

  it("the agent does not offer a slot that is already full", async () => {
    const other = await makeOrg("Full slot");
    const course = await addCourse(other.db, other.ctx);
    const full = await addSlot(other.db, other.ctx, course.id, { capacity: 1, startsAt: new Date(Date.now() + 24 * 3600_000) });
    const open = await addSlot(other.db, other.ctx, course.id, { capacity: 3, startsAt: new Date(Date.now() + 48 * 3600_000) });
    const c = await createCustomer(other.db, other.ctx, { fullName: "Taken" });
    await createBooking(other.db, other.ctx, { customerId: c.id, slotId: full.id });
    const r = await processInbound(
      other.db,
      { orgId: other.org.id, channel: "telegram", integrationId: null, chatId: "full-1", from: { userId: "full-1", fullName: "Ali" }, text: "Ingliz tili kursiga yozilmoqchiman", externalMessageId: "f1" },
      { messaging: new SandboxMessagingProvider(), llm: null },
    );
    expect(r.decision?.state.offeredSlotIds).toEqual([open.id]);
  });

  it("same customer booking the same slot twice (even concurrently) is idempotent", async () => {
    const course = await addCourse(o.db, o.ctx);
    const slot = await addSlot(o.db, o.ctx, course.id, { capacity: 5 });
    const c = await createCustomer(o.db, o.ctx, { fullName: "Repeat" });
    const [r1, r2] = await Promise.all([
      createBooking(o.db, o.ctx, { customerId: c.id, slotId: slot.id }),
      createBooking(o.db, o.ctx, { customerId: c.id, slotId: slot.id }),
    ]);
    expect([r1.created, r2.created].sort()).toEqual([false, true]);
    expect(r1.booking.id).toBe(r2.booking.id);
    const r3 = await createBooking(o.db, o.ctx, { customerId: c.id, slotId: slot.id });
    expect(r3.created).toBe(false);
    expect(await count(o.db, schema.bookings, eq(schema.bookings.customerId, c.id))).toBe(1);
  });

  it("past or inactive slots → 409", async () => {
    const course = await addCourse(o.db, o.ctx);
    const past = await addSlot(o.db, o.ctx, course.id, { startsAt: new Date(Date.now() - 3600_000) });
    const inactive = await addSlot(o.db, o.ctx, course.id);
    await deactivateSlot(o.db, o.ctx, inactive.id);
    const c = await createCustomer(o.db, o.ctx, { fullName: "Late" });
    for (const slotId of [past.id, inactive.id]) {
      const err = await createBooking(o.db, o.ctx, { customerId: c.id, slotId }).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(409);
    }
    expect(await count(o.db, schema.bookings, eq(schema.bookings.customerId, c.id))).toBe(0);
  });

  it("createBooking moves the open lead to trial_booked and records the course", async () => {
    const course = await addCourse(o.db, o.ctx);
    const slot = await addSlot(o.db, o.ctx, course.id);
    const lead = await createManualLead(o.db, o.ctx, { fullName: "Lead" });
    const { booking } = await createBooking(o.db, o.ctx, { customerId: lead.customerId, slotId: slot.id });
    expect(booking.leadId).toBe(lead.id);
    const after = await getLead(o.db, o.ctx, lead.id);
    expect(after).toMatchObject({ status: "trial_booked", interestedCourseId: course.id });
    // A customer without a lead gets one.
    const c = await createCustomer(o.db, o.ctx, { fullName: "No lead" });
    const r = await createBooking(o.db, o.ctx, { customerId: c.id, slotId: slot.id, source: "manual" });
    const [l] = await o.db.select().from(schema.leads).where(eq(schema.leads.customerId, c.id));
    expect(l).toMatchObject({ status: "trial_booked", source: "manual", id: r.booking.leadId });
  });
});

describe("connectTelegram with a stubbed Telegram API", () => {
  afterEach(() => setTelegramFetchForTests(undefined));

  type Handler = (method: string, body: any) => Response;
  function stub(handler: Handler) {
    const calls: { method: string; body: any }[] = [];
    setTelegramFetchForTests(async (url, init) => {
      const method = url.split("/").pop()!;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ method, body });
      return handler(method, body);
    });
    return calls;
  }
  const ok = (result: unknown) => Response.json({ ok: true, result });
  const fail = (code: number, description: string) => Response.json({ ok: false, error_code: code, description }, { status: code });

  it("getMe ok + setWebhook ok → live integration with the token encrypted at rest", async () => {
    const o = await makeOrg("Connect");
    const calls = stub((m) => (m === "getMe" ? ok({ id: 42, username: "bilim_bot", first_name: "Bilim" }) : ok(true)));
    const integration = await connectTelegram(o.db, o.ctx, BOT_TOKEN);
    expect(integration).toMatchObject({ mode: "live", status: "active", name: "@bilim_bot", type: "telegram" });
    expect(integration.config).toEqual({ botUsername: "bilim_bot", botId: 42 });
    expect(calls.map((c) => c.method)).toEqual(["getMe", "setWebhook"]);
    expect(calls[1].body).toMatchObject({
      url: `http://localhost:3000/api/telegram/webhook/${integration.id}`,
      secret_token: integration.webhookSecret,
    });

    const [row] = await o.db.select().from(schema.integrations).where(eq(schema.integrations.id, integration.id));
    expect(row.secretEncrypted).toBeTruthy();
    expect(row.secretEncrypted).not.toContain(BOT_TOKEN);
    expect(row.secretEncrypted).not.toContain(BOT_TOKEN.split(":")[1]);
    expect(decryptSecret(row.secretEncrypted!)).toBe(BOT_TOKEN);
    expect(JSON.stringify(row.config)).not.toContain(BOT_TOKEN);
    expect(await count(o.db, schema.auditLogs, and(eq(schema.auditLogs.orgId, o.org.id), eq(schema.auditLogs.action, "integration.connected")))).toBe(1);
  });

  it("getMe 401 → 400 bad request and no integration", async () => {
    const o = await makeOrg("BadToken");
    const calls = stub(() => fail(401, "Unauthorized"));
    const err = await connectTelegram(o.db, o.ctx, BOT_TOKEN).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(400);
    expect(calls).toHaveLength(1);
    expect(await count(o.db, schema.integrations, eq(schema.integrations.orgId, o.org.id))).toBe(0);
  });

  it("setWebhook failure → 400 and integration marked error", async () => {
    const o = await makeOrg("HookFail");
    stub((m) => (m === "getMe" ? ok({ id: 1, username: "x_bot", first_name: "X" }) : fail(400, "Bad Request: bad webhook")));
    const err = await connectTelegram(o.db, o.ctx, BOT_TOKEN).catch((e) => e);
    expect(err.status).toBe(400);
    const [row] = await o.db.select().from(schema.integrations).where(eq(schema.integrations.orgId, o.org.id));
    expect(row.status).toBe("error");
    expect(row.lastError).toContain("bad webhook");
  });

  it("API: connect returns the public view only; malformed token → 400", async () => {
    const o = await makeOrg("ConnectApi");
    stub((m) => (m === "getMe" ? ok({ id: 7, username: "api_bot", first_name: "A" }) : ok(true)));
    const bad = await call(connectRoute, apiRequest("POST", "/api/v1/integrations/telegram", { token: o.token, body: { botToken: "nope" } }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.botToken).toBeDefined();
    const res = await call(connectRoute, apiRequest("POST", "/api/v1/integrations/telegram", { token: o.token, body: { botToken: BOT_TOKEN } }));
    expect(res.status).toBe(200);
    expect(res.body.integration).toMatchObject({ mode: "live", botUsername: "api_bot", status: "active" });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(BOT_TOKEN.split(":")[1]);
    expect(text).not.toMatch(/secretEncrypted|webhookSecret/);
  });

  it("live webhook: Telegram send failure → 500 (so Telegram retries); retry after recovery → reply delivered once", async () => {
    const o = await makeOrg("LiveHook");
    let sendOk = false;
    let msgId = 1000;
    const calls = stub((m) => {
      if (m === "getMe") return ok({ id: 9, username: "live_bot", first_name: "L" });
      if (m === "setWebhook") return ok(true);
      if (m === "sendMessage") return sendOk ? ok({ message_id: ++msgId }) : fail(403, "Forbidden: bot was blocked by the user");
      return fail(404, "Not Found");
    });
    const integration = await connectTelegram(o.db, o.ctx, BOT_TOKEN);
    const upd = tgUpdate({ text: "Salom" });
    const send = () =>
      call(
        webhook,
        new Request(`http://localhost:3000/api/telegram/webhook/${integration.id}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": integration.webhookSecret },
          body: JSON.stringify(upd),
        }),
        { id: integration.id },
      );
    const r1 = await send();
    expect(r1.status).toBe(500);
    expect(r1.body.error).toBe("processing_failed");
    expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(1); // 403 is not retried in-process

    sendOk = true;
    const r2 = await send();
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe("processed");
    const sends = calls.filter((c) => c.method === "sendMessage");
    expect(sends).toHaveLength(2);
    expect(sends[1].body.chat_id).toBe(String((upd.message.chat as { id: number }).id));
    const agent = await o.db
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.orgId, o.org.id), eq(schema.messages.senderType, "agent")));
    expect(agent).toHaveLength(1);
    expect(agent[0]).toMatchObject({ deliveryStatus: "sent", externalMessageId: "1001", attempts: 2 });
    const r3 = await send();
    expect(r3.body.status).toBe("duplicate");
    expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(2);
  });
});
