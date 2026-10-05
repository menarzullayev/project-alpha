import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as overviewRoute } from "@/app/api/v1/analytics/overview/route";
import { GET as auditRoute } from "@/app/api/v1/audit/route";
import { PATCH as bookingPatch } from "@/app/api/v1/bookings/[id]/route";
import { GET as bookingsList, POST as bookingsPost } from "@/app/api/v1/bookings/route";
import { POST as convMessagesPost } from "@/app/api/v1/conversations/[id]/messages/route";
import { GET as convGet, PATCH as convPatch } from "@/app/api/v1/conversations/[id]/route";
import { GET as convList } from "@/app/api/v1/conversations/route";
import { DELETE as courseDelete, GET as courseGet, PATCH as coursePatch } from "@/app/api/v1/courses/[id]/route";
import { GET as slotsGet, POST as slotsPost } from "@/app/api/v1/courses/[id]/slots/route";
import { GET as coursesList } from "@/app/api/v1/courses/route";
import { GET as customerGet, PATCH as customerPatch } from "@/app/api/v1/customers/[id]/route";
import { GET as customersList } from "@/app/api/v1/customers/route";
import { GET as integrationGet } from "@/app/api/v1/integrations/telegram/route";
import { DELETE as knowledgeDelete, PATCH as knowledgePatch } from "@/app/api/v1/knowledge/[id]/route";
import { GET as knowledgeList } from "@/app/api/v1/knowledge/route";
import { GET as leadGet, PATCH as leadPatch } from "@/app/api/v1/leads/[id]/route";
import { GET as leadsList, POST as leadsPost } from "@/app/api/v1/leads/route";
import { GET as notificationsList } from "@/app/api/v1/notifications/route";
import { DELETE as slotDelete } from "@/app/api/v1/slots/[id]/route";
import { DELETE as invitationDelete } from "@/app/api/v1/team/invitations/[id]/route";
import { DELETE as memberDelete, PATCH as memberPatch } from "@/app/api/v1/team/members/[id]/route";
import { GET as teamList } from "@/app/api/v1/team/route";
import { processInbound } from "@/server/agent/orchestrator";
import { getOverview } from "@/server/domains/analytics";
import { listAudit } from "@/server/domains/audit";
import { createInvitation } from "@/server/domains/auth";
import { createBooking, listBookings, updateBookingStatus } from "@/server/domains/bookings";
import { getConversation, listConversations, sendOperatorReply, setConversationStatus } from "@/server/domains/conversations";
import { createSlot, deactivateSlot, deleteCourse, getCourse, listCourses, listSlots, updateCourse } from "@/server/domains/courses";
import { getCustomer, getCustomerOverview, listCustomers, updateCustomer } from "@/server/domains/customers";
import { createSandboxIntegration, getTelegramIntegration, updateIntegration } from "@/server/domains/integrations";
import { createKnowledge, deleteKnowledge, listKnowledge, updateKnowledge } from "@/server/domains/knowledge";
import { createManualLead, getLead, listLeads, updateLead } from "@/server/domains/leads";
import { listNotifications, markAllRead } from "@/server/domains/notifications";
import { changeMemberRole, listMembers, listPendingInvitations, removeMember, revokeInvitation } from "@/server/domains/team";
import { AppError } from "@/server/lib/errors";
import { SandboxMessagingProvider } from "@/server/providers/messaging/sandbox";
import { addCourse, addSlot, apiRequest, call, makeMember, makeOrg, schema, type TestOrg } from "../helpers";

async function expectStatus(p: Promise<unknown>, status: number) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(status);
}

let A: TestOrg;
let B: TestOrg;
const b = {} as {
  courseId: string;
  slotId: string;
  customerId: string;
  leadId: string;
  bookingId: string;
  knowledgeId: string;
  conversationId: string;
  invitationId: string;
  memberUserId: string;
  integrationId: string;
};
const a = {} as { courseId: string; slotId: string; customerId: string; leadId: string };

beforeAll(async () => {
  A = await makeOrg("Alpha");
  B = await makeOrg("Beta");
  const db = B.db;

  const course = await addCourse(db, B.ctx, { name: "Beta Secret Course", keywords: ["betasecret"] });
  const slot = await addSlot(db, B.ctx, course.id);
  const lead = await createManualLead(db, B.ctx, { fullName: "Beta Customer", phone: "+998900000001" });
  const { booking } = await createBooking(db, B.ctx, { customerId: lead.customerId, slotId: slot.id });
  const kb = await createKnowledge(db, B.ctx, { title: "Beta FAQ", content: "Beta only", category: "faq", keywords: ["beta"], status: "approved" });
  const integ = await createSandboxIntegration(db, B.ctx);
  const r = await processInbound(
    db,
    {
      orgId: B.org.id,
      channel: "telegram",
      integrationId: integ!.id,
      chatId: "b-chat-1",
      from: { userId: "b-user-1", fullName: "Beta Telegram" },
      text: "Salom",
      externalMessageId: "b-msg-1",
    },
    { messaging: new SandboxMessagingProvider(), llm: null },
  );
  const { invitation } = await createInvitation(db, B.ctx, { email: `beta-invite-${Date.now()}@example.test`, role: "viewer" });
  const member = await makeMember(B, "operator");
  Object.assign(b, {
    courseId: course.id,
    slotId: slot.id,
    customerId: lead.customerId,
    leadId: lead.id,
    bookingId: booking.id,
    knowledgeId: kb.id,
    conversationId: r.conversationId,
    invitationId: invitation.id,
    memberUserId: member.user.id,
    integrationId: integ!.id,
  });

  const aCourse = await addCourse(A.db, A.ctx, { name: "Alpha Course" });
  const aSlot = await addSlot(A.db, A.ctx, aCourse.id);
  const aLead = await createManualLead(A.db, A.ctx, { fullName: "Alpha Customer" });
  Object.assign(a, { courseId: aCourse.id, slotId: aSlot.id, customerId: aLead.customerId, leadId: aLead.id });
});

describe("domain services scope every query by org", () => {
  it("leads", async () => {
    const db = A.db;
    await expectStatus(getLead(db, A.ctx, b.leadId), 404);
    await expectStatus(updateLead(db, A.ctx, b.leadId, { status: "lost" }), 404);
    expect((await listLeads(db, A.ctx)).map((l) => l.id)).toEqual([a.leadId]);
    expect((await getLead(db, B.ctx, b.leadId)).status).toBe("trial_booked");
  });

  it("updateLead: assignee from another org → validation error; course from another org → 404", async () => {
    await expectStatus(updateLead(A.db, A.ctx, a.leadId, { assignedTo: B.user.id }), 400);
    await expectStatus(updateLead(A.db, A.ctx, a.leadId, { assignedTo: b.memberUserId }), 400);
    await expectStatus(updateLead(A.db, A.ctx, a.leadId, { interestedCourseId: b.courseId }), 404);
    await expectStatus(createManualLead(A.db, A.ctx, { fullName: "X", interestedCourseId: b.courseId }), 404);
    const lead = await getLead(A.db, A.ctx, a.leadId);
    expect(lead.assignedTo).toBeNull();
    expect(lead.interestedCourseId).toBeNull();
  });

  it("customers", async () => {
    const db = A.db;
    await expectStatus(getCustomer(db, A.ctx, b.customerId), 404);
    await expectStatus(getCustomerOverview(db, A.ctx, b.customerId), 404);
    await expectStatus(updateCustomer(db, A.ctx, b.customerId, { fullName: "Hacked" }), 404);
    const ids = (await listCustomers(db, A.ctx)).map((c) => c.id);
    expect(ids).not.toContain(b.customerId);
    expect((await listCustomers(db, A.ctx, { q: "Beta" })).length).toBe(0);
    expect((await getCustomer(db, B.ctx, b.customerId)).fullName).toBe("Beta Customer");
  });

  it("courses and slots", async () => {
    const db = A.db;
    await expectStatus(getCourse(db, A.ctx, b.courseId), 404);
    await expectStatus(updateCourse(db, A.ctx, b.courseId, { priceAmount: 1 }), 404);
    await expectStatus(deleteCourse(db, A.ctx, b.courseId), 404);
    await expectStatus(createSlot(db, A.ctx, b.courseId, { startsAt: new Date(Date.now() + 86400_000), durationMin: 60, capacity: 1, location: "" }), 404);
    await expectStatus(deactivateSlot(db, A.ctx, b.slotId), 404);
    expect((await listCourses(db, A.ctx)).map((c) => c.id)).toEqual([a.courseId]);
    expect((await listSlots(db, A.ctx)).map((s) => s.id)).toEqual([a.slotId]);
    expect(await listSlots(db, A.ctx, { courseId: b.courseId })).toEqual([]);
    const course = await getCourse(db, B.ctx, b.courseId);
    expect(course.priceAmount).toBe(450000);
    expect((await listSlots(db, B.ctx))[0]).toMatchObject({ id: b.slotId, isActive: true });
  });

  it("bookings", async () => {
    const db = A.db;
    await expectStatus(updateBookingStatus(db, A.ctx, b.bookingId, "cancelled"), 404);
    expect(await listBookings(db, A.ctx)).toEqual([]);
    await expectStatus(createBooking(db, A.ctx, { customerId: a.customerId, slotId: b.slotId }), 404);
    await expectStatus(createBooking(db, A.ctx, { customerId: b.customerId, slotId: a.slotId }), 404);
    const [bk] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, b.bookingId));
    expect(bk.status).toBe("confirmed");
  });

  it("conversations", async () => {
    const db = A.db;
    await expectStatus(getConversation(db, A.ctx, b.conversationId), 404);
    await expectStatus(setConversationStatus(db, A.ctx, b.conversationId, "closed"), 404);
    await expectStatus(sendOperatorReply(db, A.ctx, b.conversationId, "hi from A"), 404);
    expect(await listConversations(db, A.ctx)).toEqual([]);
    const conv = await getConversation(db, B.ctx, b.conversationId);
    expect(conv.conversation.status).toBe("bot");
    expect(conv.messages.some((m) => m.body === "hi from A")).toBe(false);
  });

  it("knowledge", async () => {
    const db = A.db;
    await expectStatus(updateKnowledge(db, A.ctx, b.knowledgeId, { content: "pwned" }), 404);
    await expectStatus(deleteKnowledge(db, A.ctx, b.knowledgeId), 404);
    expect(await listKnowledge(db, A.ctx)).toEqual([]);
    expect((await listKnowledge(db, B.ctx))[0].content).toBe("Beta only");
  });

  it("integrations", async () => {
    const db = A.db;
    expect(await getTelegramIntegration(db, A.ctx)).toBeNull();
    await expectStatus(updateIntegration(db, A.ctx, { status: "disabled" }), 404);
    expect((await getTelegramIntegration(db, B.ctx))?.status).toBe("active");
  });

  it("notifications", async () => {
    const db = A.db;
    expect(await listNotifications(db, A.ctx)).toEqual([]);
    await markAllRead(db, A.ctx);
    const bn = await listNotifications(db, B.ctx);
    expect(bn.length).toBeGreaterThan(0);
    expect(bn.every((n) => n.readAt === null)).toBe(true);
  });

  it("audit", async () => {
    const entries = await listAudit(A.db, A.ctx, { limit: 500 });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.orgId === A.org.id)).toBe(true);
    expect(entries.some((e) => e.entityId === b.courseId || e.entityId === b.bookingId)).toBe(false);
  });

  it("analytics", async () => {
    const o = await getOverview(A.db, A.ctx);
    expect(o.leads30d).toBe(1);
    expect(o.bookings30d).toBe(0);
    expect(o.conversations30d).toBe(0);
    expect(o.openHandoffs).toBe(0);
    const ob = await getOverview(B.db, B.ctx);
    expect(ob.bookings30d).toBe(1);
    expect(ob.leads30d).toBe(2);
  });

  it("team", async () => {
    const db = A.db;
    const members = await listMembers(db, A.ctx);
    expect(members.map((m) => m.userId)).toEqual([A.user.id]);
    expect(await listPendingInvitations(db, A.ctx)).toEqual([]);
    await expectStatus(changeMemberRole(db, A.ctx, b.memberUserId, "viewer"), 404);
    await expectStatus(removeMember(db, A.ctx, b.memberUserId), 404);
    await expectStatus(revokeInvitation(db, A.ctx, b.invitationId), 404);
    expect((await listMembers(db, B.ctx)).find((m) => m.userId === b.memberUserId)?.role).toBe("operator");
    expect((await listPendingInvitations(db, B.ctx)).map((i) => i.id)).toContain(b.invitationId);
  });
});

describe("API routes with org A's cookie and org B's ids → 404", () => {
  const cases: [string, (t: string) => Promise<{ status: number }>][] = [
    ["GET /leads/:id", (t) => call(leadGet, apiRequest("GET", `/api/v1/leads/${b.leadId}`, { token: t }), { id: b.leadId })],
    ["PATCH /leads/:id", (t) => call(leadPatch, apiRequest("PATCH", `/api/v1/leads/${b.leadId}`, { token: t, body: { notes: "x" } }), { id: b.leadId })],
    ["GET /customers/:id", (t) => call(customerGet, apiRequest("GET", `/api/v1/customers/${b.customerId}`, { token: t }), { id: b.customerId })],
    ["PATCH /customers/:id", (t) => call(customerPatch, apiRequest("PATCH", `/api/v1/customers/${b.customerId}`, { token: t, body: { fullName: "x" } }), { id: b.customerId })],
    ["GET /courses/:id", (t) => call(courseGet, apiRequest("GET", `/api/v1/courses/${b.courseId}`, { token: t }), { id: b.courseId })],
    ["PATCH /courses/:id", (t) => call(coursePatch, apiRequest("PATCH", `/api/v1/courses/${b.courseId}`, { token: t, body: { priceAmount: 1 } }), { id: b.courseId })],
    ["DELETE /courses/:id", (t) => call(courseDelete, apiRequest("DELETE", `/api/v1/courses/${b.courseId}`, { token: t }), { id: b.courseId })],
    [
      "POST /courses/:id/slots",
      (t) =>
        call(slotsPost, apiRequest("POST", `/api/v1/courses/${b.courseId}/slots`, { token: t, body: { startsAt: new Date(Date.now() + 86400_000).toISOString() } }), {
          id: b.courseId,
        }),
    ],
    ["DELETE /slots/:id", (t) => call(slotDelete, apiRequest("DELETE", `/api/v1/slots/${b.slotId}`, { token: t }), { id: b.slotId })],
    ["PATCH /bookings/:id", (t) => call(bookingPatch, apiRequest("PATCH", `/api/v1/bookings/${b.bookingId}`, { token: t, body: { status: "cancelled" } }), { id: b.bookingId })],
    ["POST /bookings (B slot)", (t) => call(bookingsPost, apiRequest("POST", "/api/v1/bookings", { token: t, body: { customerId: a.customerId, slotId: b.slotId } }))],
    ["GET /conversations/:id", (t) => call(convGet, apiRequest("GET", `/api/v1/conversations/${b.conversationId}`, { token: t }), { id: b.conversationId })],
    ["PATCH /conversations/:id", (t) => call(convPatch, apiRequest("PATCH", `/api/v1/conversations/${b.conversationId}`, { token: t, body: { status: "closed" } }), { id: b.conversationId })],
    [
      "POST /conversations/:id/messages",
      (t) => call(convMessagesPost, apiRequest("POST", `/api/v1/conversations/${b.conversationId}/messages`, { token: t, body: { body: "hi" } }), { id: b.conversationId }),
    ],
    ["PATCH /knowledge/:id", (t) => call(knowledgePatch, apiRequest("PATCH", `/api/v1/knowledge/${b.knowledgeId}`, { token: t, body: { content: "pwned" } }), { id: b.knowledgeId })],
    ["DELETE /knowledge/:id", (t) => call(knowledgeDelete, apiRequest("DELETE", `/api/v1/knowledge/${b.knowledgeId}`, { token: t }), { id: b.knowledgeId })],
    ["DELETE /team/invitations/:id", (t) => call(invitationDelete, apiRequest("DELETE", `/api/v1/team/invitations/${b.invitationId}`, { token: t }), { id: b.invitationId })],
    ["PATCH /team/members/:id", (t) => call(memberPatch, apiRequest("PATCH", `/api/v1/team/members/${b.memberUserId}`, { token: t, body: { role: "viewer" } }), { id: b.memberUserId })],
    ["DELETE /team/members/:id", (t) => call(memberDelete, apiRequest("DELETE", `/api/v1/team/members/${b.memberUserId}`, { token: t }), { id: b.memberUserId })],
    ["POST /leads (B course)", (t) => call(leadsPost, apiRequest("POST", "/api/v1/leads", { token: t, body: { fullName: "x", interestedCourseId: b.courseId } }))],
  ];

  it.each(cases)("%s", async (_name, run) => {
    const res = await run(A.token);
    expect(res.status).toBe(404);
  });

  it("PATCH /leads/:id assigning a member of another org → 400", async () => {
    const res = await call(leadPatch, apiRequest("PATCH", `/api/v1/leads/${a.leadId}`, { token: A.token, body: { assignedTo: b.memberUserId } }), { id: a.leadId });
    expect(res.status).toBe(400);
    expect((res as any).body.error.details.assignedTo).toBeDefined();
  });

  it("B's records were not modified by any of the above", async () => {
    const db = B.db;
    expect((await getLead(db, B.ctx, b.leadId)).notes).toBeNull();
    expect((await getCustomer(db, B.ctx, b.customerId)).fullName).toBe("Beta Customer");
    expect((await getCourse(db, B.ctx, b.courseId)).priceAmount).toBe(450000);
    expect((await listSlots(db, B.ctx))[0].isActive).toBe(true);
    expect((await listKnowledge(db, B.ctx)).map((k) => k.content)).toEqual(["Beta only"]);
    expect((await listPendingInvitations(db, B.ctx)).map((i) => i.id)).toContain(b.invitationId);
    expect((await listMembers(db, B.ctx)).length).toBe(2);
    const conv = await getConversation(db, B.ctx, b.conversationId);
    expect(conv.conversation.status).toBe("bot");
    expect(conv.messages.filter((m) => m.senderType === "operator")).toEqual([]);
  });

  it("list endpoints never include B's records", async () => {
    const t = A.token;
    const leads = await call(leadsList, apiRequest("GET", "/api/v1/leads", { token: t }));
    expect(leads.body.leads.map((l: any) => l.id)).toEqual([a.leadId]);
    const customers = await call(customersList, apiRequest("GET", "/api/v1/customers?q=Beta", { token: t }));
    expect(customers.body.customers).toEqual([]);
    const courses = await call(coursesList, apiRequest("GET", "/api/v1/courses", { token: t }));
    expect(courses.body.courses.map((c: any) => c.id)).toEqual([a.courseId]);
    const slots = await call(slotsGet, apiRequest("GET", `/api/v1/courses/${b.courseId}/slots`, { token: t }), { id: b.courseId });
    expect(slots.body.slots).toEqual([]);
    const bookings = await call(bookingsList, apiRequest("GET", "/api/v1/bookings", { token: t }));
    expect(bookings.body.bookings).toEqual([]);
    const convs = await call(convList, apiRequest("GET", "/api/v1/conversations", { token: t }));
    expect(convs.body.conversations).toEqual([]);
    const kb = await call(knowledgeList, apiRequest("GET", "/api/v1/knowledge", { token: t }));
    expect(kb.body.articles).toEqual([]);
    const integ = await call(integrationGet, apiRequest("GET", "/api/v1/integrations/telegram", { token: t }));
    expect(integ.body.integration).toBeNull();
    const notes = await call(notificationsList, apiRequest("GET", "/api/v1/notifications", { token: t }));
    expect(notes.body.notifications).toEqual([]);
    const audit = await call(auditRoute, apiRequest("GET", "/api/v1/audit", { token: t }));
    expect(audit.body.entries.every((e: any) => e.orgId === A.org.id)).toBe(true);
    const team = await call(teamList, apiRequest("GET", "/api/v1/team", { token: t }));
    expect(team.body.members.map((m: any) => m.userId)).toEqual([A.user.id]);
    expect(team.body.invitations).toEqual([]);
    const ov = await call(overviewRoute, apiRequest("GET", "/api/v1/analytics/overview", { token: t }));
    expect(ov.body.overview.bookings30d).toBe(0);
  });

  it("B's integration secret is never exposed in API responses", async () => {
    const integ = await call(integrationGet, apiRequest("GET", "/api/v1/integrations/telegram", { token: B.token }));
    expect(integ.body.integration.id).toBe(b.integrationId);
    expect(JSON.stringify(integ.body)).not.toMatch(/webhookSecret|secretEncrypted/);
  });
});
