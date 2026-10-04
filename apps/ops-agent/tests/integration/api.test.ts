import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { GET as cronRoute } from "@/app/api/cron/daily-report/route";
import { GET as healthRoute } from "@/app/api/health/route";
import { GET as settingsGet, PATCH as settingsPatch } from "@/app/api/v1/agent/settings/route";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { PATCH as bookingPatch } from "@/app/api/v1/bookings/[id]/route";
import { GET as bookingsList, POST as bookingsPost } from "@/app/api/v1/bookings/route";
import { GET as convList } from "@/app/api/v1/conversations/route";
import { DELETE as courseDelete, GET as courseGet, PATCH as coursePatch } from "@/app/api/v1/courses/[id]/route";
import { GET as slotsGet, POST as slotsPost } from "@/app/api/v1/courses/[id]/slots/route";
import { GET as coursesList, POST as coursesPost } from "@/app/api/v1/courses/route";
import { POST as customersPost } from "@/app/api/v1/customers/route";
import { POST as sandboxPost } from "@/app/api/v1/integrations/telegram/sandbox/route";
import { DELETE as knowledgeDelete, PATCH as knowledgePatch } from "@/app/api/v1/knowledge/[id]/route";
import { GET as knowledgeList, POST as knowledgePost } from "@/app/api/v1/knowledge/route";
import { GET as leadGet, PATCH as leadPatch } from "@/app/api/v1/leads/[id]/route";
import { GET as leadsList, POST as leadsPost } from "@/app/api/v1/leads/route";
import { POST as notificationsRead } from "@/app/api/v1/notifications/read/route";
import { GET as notificationsList } from "@/app/api/v1/notifications/route";
import { PATCH as orgPatch } from "@/app/api/v1/org/route";
import { DELETE as slotDelete } from "@/app/api/v1/slots/[id]/route";
import { POST as invitePost } from "@/app/api/v1/team/invitations/route";
import { DELETE as memberDelete, PATCH as memberPatch } from "@/app/api/v1/team/members/[id]/route";
import { GET as teamList } from "@/app/api/v1/team/route";
import { notify } from "@/server/domains/notifications";
import { addCourse, addSlot, apiRequest, call, count, futureDate, makeMember, makeOrg, schema, uniqueEmail } from "../helpers";

const courseBody = {
  name: "Python dasturlash",
  description: "Noldan",
  keywords: ["python"],
  priceAmount: 600000,
  pricePeriod: "month",
  durationWeeks: 20,
  scheduleText: "Shan/Yak 11:00",
  format: "hybrid",
};

describe("authentication & authorization", () => {
  it("401 without a session cookie", async () => {
    expect((await call(leadsList, apiRequest("GET", "/api/v1/leads"))).status).toBe(401);
    const res = await call(coursesPost, apiRequest("POST", "/api/v1/courses", { body: courseBody }));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect((await call(leadsList, apiRequest("GET", "/api/v1/leads", { token: "bogus-token" }))).status).toBe(401);
  });

  it("viewer can read but gets 403 on every write endpoint", async () => {
    const owner = await makeOrg();
    const viewer = await makeMember(owner, "viewer");
    const course = await addCourse(owner.db, owner.ctx);
    const slot = await addSlot(owner.db, owner.ctx, course.id);
    const t = viewer.token;
    expect((await call(leadsList, apiRequest("GET", "/api/v1/leads", { token: t }))).status).toBe(200);
    expect((await call(coursesList, apiRequest("GET", "/api/v1/courses", { token: t }))).status).toBe(200);
    expect((await call(settingsGet, apiRequest("GET", "/api/v1/agent/settings", { token: t }))).status).toBe(200);

    const writes = [
      call(coursesPost, apiRequest("POST", "/api/v1/courses", { token: t, body: courseBody })),
      call(coursePatch, apiRequest("PATCH", `/api/v1/courses/${course.id}`, { token: t, body: { priceAmount: 1 } }), { id: course.id }),
      call(courseDelete, apiRequest("DELETE", `/api/v1/courses/${course.id}`, { token: t }), { id: course.id }),
      call(slotsPost, apiRequest("POST", `/api/v1/courses/${course.id}/slots`, { token: t, body: { startsAt: futureDate(30).toISOString() } }), { id: course.id }),
      call(slotDelete, apiRequest("DELETE", `/api/v1/slots/${slot.id}`, { token: t }), { id: slot.id }),
      call(leadsPost, apiRequest("POST", "/api/v1/leads", { token: t, body: { fullName: "X" } })),
      call(customersPost, apiRequest("POST", "/api/v1/customers", { token: t, body: { fullName: "X" } })),
      call(bookingsPost, apiRequest("POST", "/api/v1/bookings", { token: t, body: { customerId: randomUUID(), slotId: slot.id } })),
      call(knowledgePost, apiRequest("POST", "/api/v1/knowledge", { token: t, body: { title: "T1", content: "C1" } })),
      call(settingsPatch, apiRequest("PATCH", "/api/v1/agent/settings", { token: t, body: { agentName: "X" } })),
      call(sandboxPost, apiRequest("POST", "/api/v1/integrations/telegram/sandbox", { token: t })),
      call(invitePost, apiRequest("POST", "/api/v1/team/invitations", { token: t, body: { email: uniqueEmail(), role: "viewer" } })),
      call(orgPatch, apiRequest("PATCH", "/api/v1/org", { token: t, body: { name: "Renamed" } })),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("forbidden");
    }
    expect(await count(owner.db, schema.courses, eq(schema.courses.orgId, owner.org.id))).toBe(1);
  });

  it("operator can write CRM records but not the catalog", async () => {
    const owner = await makeOrg();
    const op = await makeMember(owner, "operator");
    expect((await call(leadsPost, apiRequest("POST", "/api/v1/leads", { token: op.token, body: { fullName: "Lead" } }))).status).toBe(201);
    expect((await call(coursesPost, apiRequest("POST", "/api/v1/courses", { token: op.token, body: courseBody }))).status).toBe(403);
    expect((await call(knowledgePost, apiRequest("POST", "/api/v1/knowledge", { token: op.token, body: { title: "T1", content: "C1" } }))).status).toBe(403);
  });

  it("CSRF: POST with a session but missing or foreign Origin → 403", async () => {
    const o = await makeOrg();
    const missing = await call(coursesPost, apiRequest("POST", "/api/v1/courses", { token: o.token, body: courseBody, origin: null }));
    expect(missing.status).toBe(403);
    expect(missing.body.error.message).toMatch(/Origin/);
    const foreign = await call(coursesPost, apiRequest("POST", "/api/v1/courses", { token: o.token, body: courseBody, origin: "https://evil.example" }));
    expect(foreign.status).toBe(403);
    const del = await call(courseDelete, apiRequest("DELETE", `/api/v1/courses/${randomUUID()}`, { token: o.token, origin: "http://localhost:3001" }), {
      id: randomUUID(),
    });
    expect(del.status).toBe(403);
    expect(await count(o.db, schema.courses, eq(schema.courses.orgId, o.org.id))).toBe(0);
    // GET needs no Origin.
    expect((await call(coursesList, apiRequest("GET", "/api/v1/courses", { token: o.token, origin: null }))).status).toBe(200);
    // Same host via proxy headers is accepted.
    const proxied = await call(
      coursesPost,
      apiRequest("POST", "/api/v1/courses", {
        token: o.token,
        body: courseBody,
        origin: "https://app.example.com",
        headers: { "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" },
      }),
    );
    expect(proxied.status).toBe(201);
  });

  it("400 with field details on an invalid body; 400 on invalid JSON; 404 on a malformed id", async () => {
    const o = await makeOrg();
    const res = await call(coursesPost, apiRequest("POST", "/api/v1/courses", { token: o.token, body: { name: "x", priceAmount: -5, format: "tv" } }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(Object.keys(res.body.error.details).sort()).toEqual(["format", "name", "priceAmount"]);
    const bad = await call(coursesPost, apiRequest("POST", "/api/v1/courses", { token: o.token, rawBody: "{not json" }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("bad_request");
    const notUuid = await call(courseGet, apiRequest("GET", "/api/v1/courses/123", { token: o.token }), { id: "123" });
    expect(notUuid.status).toBe(404);
    const missing = await call(courseGet, apiRequest("GET", `/api/v1/courses/${randomUUID()}`, { token: o.token }), { id: randomUUID() });
    expect(missing.status).toBe(404);
  });
});

describe("CRUD happy paths", () => {
  it("courses and slots", async () => {
    const o = await makeOrg();
    const t = o.token;
    const created = await call(coursesPost, apiRequest("POST", "/api/v1/courses", { token: t, body: courseBody }));
    expect(created.status).toBe(201);
    const id = created.body.course.id;
    expect(created.body.course).toMatchObject({ name: "Python dasturlash", priceAmount: 600000, orgId: o.org.id, isActive: true, category: "" });

    const got = await call(courseGet, apiRequest("GET", `/api/v1/courses/${id}`, { token: t }), { id });
    expect(got.body.course.id).toBe(id);
    const patched = await call(coursePatch, apiRequest("PATCH", `/api/v1/courses/${id}`, { token: t, body: { priceAmount: 650000 } }), { id });
    expect(patched.status).toBe(200);
    expect(patched.body.course.priceAmount).toBe(650000);
    expect(patched.body.course.name).toBe("Python dasturlash");

    const startsAt = futureDate(50).toISOString();
    const slot = await call(slotsPost, apiRequest("POST", `/api/v1/courses/${id}/slots`, { token: t, body: { startsAt, capacity: 3, location: "Lab" } }), { id });
    expect(slot.status).toBe(201);
    expect(slot.body.slot).toMatchObject({ courseId: id, capacity: 3, durationMin: 60, location: "Lab", isActive: true });
    const slots = await call(slotsGet, apiRequest("GET", `/api/v1/courses/${id}/slots`, { token: t }), { id });
    expect(slots.body.slots).toHaveLength(1);
    expect(slots.body.slots[0]).toMatchObject({ available: 3, booked: 0 });
    const badSlot = await call(slotsPost, apiRequest("POST", `/api/v1/courses/${id}/slots`, { token: t, body: { startsAt: "nope", capacity: 0 } }), { id });
    expect(badSlot.status).toBe(400);
    expect(badSlot.body.error.details).toHaveProperty("capacity");

    const sid = slot.body.slot.id;
    const deact = await call(slotDelete, apiRequest("DELETE", `/api/v1/slots/${sid}`, { token: t }), { id: sid });
    expect(deact.status).toBe(200);
    expect(deact.body.slot.isActive).toBe(false);

    const del = await call(courseDelete, apiRequest("DELETE", `/api/v1/courses/${id}`, { token: t }), { id });
    expect(del.status).toBe(200);
    expect(await count(o.db, schema.courses, eq(schema.courses.id, id))).toBe(0);
    expect(await count(o.db, schema.courseSlots, eq(schema.courseSlots.id, sid))).toBe(0);
    const audit = await o.db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.orgId, o.org.id), eq(schema.auditLogs.entityId, id)));
    expect(audit.map((a) => a.action).sort()).toEqual(["course.created", "course.deleted", "course.updated"]);
  });

  it("knowledge", async () => {
    const o = await makeOrg();
    const t = o.token;
    const created = await call(knowledgePost, apiRequest("POST", "/api/v1/knowledge", { token: t, body: { title: "Manzil", content: "Chilonzor 12", keywords: ["manzil"] } }));
    expect(created.status).toBe(201);
    expect(created.body.article).toMatchObject({ status: "draft", category: "faq", createdBy: o.user.id });
    const id = created.body.article.id;
    const approved = await call(knowledgePatch, apiRequest("PATCH", `/api/v1/knowledge/${id}`, { token: t, body: { status: "approved" } }), { id });
    expect(approved.body.article.status).toBe("approved");
    expect(await count(o.db, schema.auditLogs, and(eq(schema.auditLogs.entityId, id), eq(schema.auditLogs.action, "knowledge.approved")))).toBe(1);
    const list = await call(knowledgeList, apiRequest("GET", "/api/v1/knowledge", { token: t }));
    expect(list.body.articles.map((a: any) => a.id)).toEqual([id]);
    expect((await call(knowledgeDelete, apiRequest("DELETE", `/api/v1/knowledge/${id}`, { token: t }), { id })).status).toBe(200);
    expect((await call(knowledgeDelete, apiRequest("DELETE", `/api/v1/knowledge/${id}`, { token: t }), { id })).status).toBe(404);
  });

  it("leads: create, list, filter, get, update, invalid transition", async () => {
    const o = await makeOrg();
    const t = o.token;
    const course = await addCourse(o.db, o.ctx);
    const created = await call(leadsPost, apiRequest("POST", "/api/v1/leads", { token: t, body: { fullName: "Lola", phone: "+998901234567", interestedCourseId: course.id } }));
    expect(created.status).toBe(201);
    const id = created.body.lead.id;
    expect(created.body.lead).toMatchObject({ status: "new", source: "manual", interestedCourseId: course.id });

    const list = await call(leadsList, apiRequest("GET", "/api/v1/leads?q=lola", { token: t }));
    expect(list.body.leads).toHaveLength(1);
    expect(list.body.leads[0]).toMatchObject({ id, customerName: "Lola", courseName: course.name });
    const filtered = await call(leadsList, apiRequest("GET", "/api/v1/leads?status=won", { token: t }));
    expect(filtered.body.leads).toEqual([]);

    const upd = await call(leadPatch, apiRequest("PATCH", `/api/v1/leads/${id}`, { token: t, body: { status: "contacted", assignedTo: o.user.id, notes: "called" } }), { id });
    expect(upd.status).toBe(200);
    expect(upd.body.lead).toMatchObject({ status: "contacted", assignedTo: o.user.id, notes: "called" });

    const bad = await call(leadPatch, apiRequest("PATCH", `/api/v1/leads/${id}`, { token: t, body: { status: "new" } }), { id });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.status).toMatch(/contacted to new/);

    const won = await call(leadPatch, apiRequest("PATCH", `/api/v1/leads/${id}`, { token: t, body: { status: "won" } }), { id });
    expect(won.body.lead.status).toBe("won");
    const got = await call(leadGet, apiRequest("GET", `/api/v1/leads/${id}`, { token: t }), { id });
    expect(got.body.lead.status).toBe("won");
    expect(await count(o.db, schema.auditLogs, and(eq(schema.auditLogs.entityId, id), eq(schema.auditLogs.action, "lead.status_changed")))).toBe(2);
  });

  it("bookings: create (201), idempotent repeat (200), status change, list filter", async () => {
    const o = await makeOrg();
    const t = o.token;
    const course = await addCourse(o.db, o.ctx);
    const slot = await addSlot(o.db, o.ctx, course.id);
    const lead = await call(leadsPost, apiRequest("POST", "/api/v1/leads", { token: t, body: { fullName: "Bek" } }));
    const customerId = lead.body.lead.customerId;

    const first = await call(bookingsPost, apiRequest("POST", "/api/v1/bookings", { token: t, body: { customerId, slotId: slot.id } }));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ created: true, booking: { status: "confirmed", source: "manual", courseId: course.id, leadId: lead.body.lead.id } });
    const again = await call(bookingsPost, apiRequest("POST", "/api/v1/bookings", { token: t, body: { customerId, slotId: slot.id } }));
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);
    expect(again.body.booking.id).toBe(first.body.booking.id);
    expect(await count(o.db, schema.bookings, eq(schema.bookings.orgId, o.org.id))).toBe(1);

    const leadNow = await call(leadGet, apiRequest("GET", `/api/v1/leads/${lead.body.lead.id}`, { token: t }), { id: lead.body.lead.id });
    expect(leadNow.body.lead).toMatchObject({ status: "trial_booked", interestedCourseId: course.id });

    const bid = first.body.booking.id;
    const upcoming = await call(bookingsList, apiRequest("GET", "/api/v1/bookings?upcoming=true", { token: t }));
    expect(upcoming.body.bookings.map((b: any) => b.id)).toEqual([bid]);
    const patched = await call(bookingPatch, apiRequest("PATCH", `/api/v1/bookings/${bid}`, { token: t, body: { status: "attended" } }), { id: bid });
    expect(patched.body.booking.status).toBe("attended");
    const badStatus = await call(bookingPatch, apiRequest("PATCH", `/api/v1/bookings/${bid}`, { token: t, body: { status: "teleported" } }), { id: bid });
    expect(badStatus.status).toBe(400);
    const confirmed = await call(bookingsList, apiRequest("GET", "/api/v1/bookings?status=confirmed", { token: t }));
    expect(confirmed.body.bookings).toEqual([]);
    const attended = await call(bookingsList, apiRequest("GET", "/api/v1/bookings?status=attended", { token: t }));
    expect(attended.body.bookings).toHaveLength(1);
  });

  it("notifications list + mark read; agent settings patch; conversations list", async () => {
    const o = await makeOrg();
    await notify(o.db, o.org.id, { type: "lead.created", title: "New lead" });
    const list = await call(notificationsList, apiRequest("GET", "/api/v1/notifications", { token: o.token }));
    expect(list.body.unread).toBe(1);
    expect(list.body.notifications[0].title).toBe("New lead");
    await call(notificationsRead, apiRequest("POST", "/api/v1/notifications/read", { token: o.token }));
    expect((await call(notificationsList, apiRequest("GET", "/api/v1/notifications", { token: o.token }))).body.unread).toBe(0);

    const s = await call(settingsPatch, apiRequest("PATCH", "/api/v1/agent/settings", { token: o.token, body: { agentName: "Bilim", maxUnknownBeforeHandoff: 3 } }));
    expect(s.body.settings).toMatchObject({ agentName: "Bilim", maxUnknownBeforeHandoff: 3 });
    const badS = await call(settingsPatch, apiRequest("PATCH", "/api/v1/agent/settings", { token: o.token, body: { maxUnknownBeforeHandoff: 99 } }));
    expect(badS.status).toBe(400);
    expect((await call(convList, apiRequest("GET", "/api/v1/conversations", { token: o.token }))).body.conversations).toEqual([]);
  });
});

describe("operational endpoints", () => {
  it("health → 200 status ok with database check", async () => {
    const res = await healthRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.config.ok).toBe(true);
    expect(body.checks.database.ok).toBe(true);
    expect(body.llm).toBe("rules");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("cron daily report: 401 without/with wrong bearer, 200 with the secret", async () => {
    expect((await cronRoute(new Request("http://localhost:3000/api/cron/daily-report"))).status).toBe(401);
    expect((await cronRoute(new Request("http://localhost:3000/api/cron/daily-report", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    expect(
      (await cronRoute(new Request("http://localhost:3000/api/cron/daily-report", { headers: { authorization: "test-cron-secret-123456" } }))).status,
    ).toBe(401);
    const ok = await cronRoute(new Request("http://localhost:3000/api/cron/daily-report", { headers: { authorization: "Bearer test-cron-secret-123456" } }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.organizations).toBeGreaterThan(0);
    expect(typeof body.sent).toBe("number");
  });

  it("login is rate limited per IP: 429 with retry-after after 20 attempts", async () => {
    const ip = "203.0.113.77";
    const statuses: number[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await call(loginRoute, apiRequest("POST", "/api/v1/auth/login", { ip, body: { email: uniqueEmail("rl"), password: "wrong-pass-1" } }));
      statuses.push(res.status);
    }
    expect(statuses.every((s) => s === 401)).toBe(true);
    const limited = await call(loginRoute, apiRequest("POST", "/api/v1/auth/login", { ip, body: { email: uniqueEmail("rl"), password: "wrong-pass-1" } }));
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("rate_limited");
    const retryAfter = Number(limited.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(600);
    // A different IP is unaffected.
    const other = await call(loginRoute, apiRequest("POST", "/api/v1/auth/login", { body: { email: uniqueEmail("rl"), password: "wrong-pass-1" } }));
    expect(other.status).toBe(401);
  });

  it("login is also rate limited per email (10 attempts) across IPs", async () => {
    const o = await makeOrg();
    for (let i = 0; i < 10; i++) {
      expect((await call(loginRoute, apiRequest("POST", "/api/v1/auth/login", { body: { email: o.email, password: "wrong-pass-1" } }))).status).toBe(401);
    }
    const blocked = await call(loginRoute, apiRequest("POST", "/api/v1/auth/login", { body: { email: o.email, password: "correct-horse-42" } }));
    expect(blocked.status).toBe(429);
  });
});

describe("team role rules", () => {
  it("admin cannot promote to owner, cannot touch owners or other admins, cannot invite admins", async () => {
    const owner = await makeOrg();
    const admin = await makeMember(owner, "admin");
    const op = await makeMember(owner, "operator");
    const t = admin.token;
    const promote = await call(memberPatch, apiRequest("PATCH", `/api/v1/team/members/${op.user.id}`, { token: t, body: { role: "owner" } }), { id: op.user.id });
    expect(promote.status).toBe(403);
    const toAdmin = await call(memberPatch, apiRequest("PATCH", `/api/v1/team/members/${op.user.id}`, { token: t, body: { role: "admin" } }), { id: op.user.id });
    expect(toAdmin.status).toBe(403);
    const demoteOwner = await call(memberPatch, apiRequest("PATCH", `/api/v1/team/members/${owner.user.id}`, { token: t, body: { role: "viewer" } }), {
      id: owner.user.id,
    });
    expect(demoteOwner.status).toBe(403);
    const removeOwner = await call(memberDelete, apiRequest("DELETE", `/api/v1/team/members/${owner.user.id}`, { token: t }), { id: owner.user.id });
    expect(removeOwner.status).toBe(403);
    const inviteAdmin = await call(invitePost, apiRequest("POST", "/api/v1/team/invitations", { token: t, body: { email: uniqueEmail(), role: "admin" } }));
    expect(inviteAdmin.status).toBe(403);

    const demoteOp = await call(memberPatch, apiRequest("PATCH", `/api/v1/team/members/${op.user.id}`, { token: t, body: { role: "viewer" } }), { id: op.user.id });
    expect(demoteOp.status).toBe(200);
    const inviteViewer = await call(invitePost, apiRequest("POST", "/api/v1/team/invitations", { token: t, body: { email: uniqueEmail(), role: "viewer" } }));
    expect(inviteViewer.status).toBe(201);
    expect(inviteViewer.body.inviteUrl).toMatch(/^http:\/\/localhost:3000\/invite\/.+/);

    const members = await call(teamList, apiRequest("GET", "/api/v1/team", { token: owner.token }));
    const roles = Object.fromEntries(members.body.members.map((m: any) => [m.userId, m.role]));
    expect(roles).toEqual({ [owner.user.id]: "owner", [admin.user.id]: "admin", [op.user.id]: "viewer" });
    expect(members.body.invitations).toHaveLength(1);
  });

  it("the last owner cannot be demoted or removed; with a second owner it can", async () => {
    const owner = await makeOrg();
    const admin = await makeMember(owner, "admin");
    const t = owner.token;
    const demoteSelf = await call(memberPatch, apiRequest("PATCH", `/api/v1/team/members/${owner.user.id}`, { token: t, body: { role: "admin" } }), { id: owner.user.id });
    expect(demoteSelf.status).toBe(409);
    const leave = await call(memberDelete, apiRequest("DELETE", `/api/v1/team/members/${owner.user.id}`, { token: t }), { id: owner.user.id });
    expect(leave.status).toBe(409);

    const promote = await call(memberPatch, apiRequest("PATCH", `/api/v1/team/members/${admin.user.id}`, { token: t, body: { role: "owner" } }), { id: admin.user.id });
    expect(promote.status).toBe(200);
    const demoteNow = await call(memberPatch, apiRequest("PATCH", `/api/v1/team/members/${owner.user.id}`, { token: t, body: { role: "admin" } }), { id: owner.user.id });
    expect(demoteNow.status).toBe(200);
    const [m] = await owner.db
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, owner.org.id), eq(schema.memberships.userId, owner.user.id)));
    expect(m.role).toBe("admin");
  });

  it("any member may leave; a viewer cannot remove others", async () => {
    const owner = await makeOrg();
    const v1 = await makeMember(owner, "viewer");
    const v2 = await makeMember(owner, "viewer");
    const other = await call(memberDelete, apiRequest("DELETE", `/api/v1/team/members/${v2.user.id}`, { token: v1.token }), { id: v2.user.id });
    expect(other.status).toBe(403);
    const self = await call(memberDelete, apiRequest("DELETE", `/api/v1/team/members/${v1.user.id}`, { token: v1.token }), { id: v1.user.id });
    expect(self.status).toBe(200);
    expect(await count(owner.db, schema.memberships, eq(schema.memberships.orgId, owner.org.id))).toBe(2);
  });
});
