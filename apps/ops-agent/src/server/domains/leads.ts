import { and, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client";
import { courses, customers, leadStatusEnum, leads, memberships, users } from "../db/schema";
import { errors } from "../lib/errors";
import type { TenantContext } from "../tenancy";
import { recordAudit } from "./audit";

export type LeadStatus = (typeof leadStatusEnum.enumValues)[number];
export const LEAD_STATUSES = leadStatusEnum.enumValues;
const CLOSED: LeadStatus[] = ["won", "lost"];

/** Allowed pipeline moves. Closed leads may be reopened to "contacted". */
const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["contacted", "qualified", "trial_booked", "won", "lost"],
  contacted: ["qualified", "trial_booked", "won", "lost"],
  qualified: ["contacted", "trial_booked", "won", "lost"],
  trial_booked: ["qualified", "won", "lost"],
  won: ["contacted"],
  lost: ["contacted"],
};

export function canTransition(from: LeadStatus, to: LeadStatus) {
  return from === to || TRANSITIONS[from].includes(to);
}

export const leadUpdateSchema = z.object({
  status: z.enum(leadStatusEnum.enumValues).optional(),
  notes: z.string().max(4000).nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  interestedCourseId: z.string().uuid().nullable().optional(),
});

export const leadCreateSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(32).optional(),
  interestedCourseId: z.string().uuid().nullable().optional(),
  notes: z.string().max(4000).optional(),
});

export async function listLeads(
  db: DbOrTx,
  ctx: TenantContext,
  opts: { status?: LeadStatus; q?: string; limit?: number; offset?: number } = {},
) {
  const filters = [eq(leads.orgId, ctx.orgId)];
  if (opts.status) filters.push(eq(leads.status, opts.status));
  if (opts.q) {
    const q = `%${opts.q.replace(/[%_]/g, "")}%`;
    filters.push(or(ilike(customers.fullName, q), ilike(customers.phone, q), ilike(customers.telegramUsername, q))!);
  }
  return db
    .select({
      id: leads.id,
      status: leads.status,
      source: leads.source,
      notes: leads.notes,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
      customerId: customers.id,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      telegramUsername: customers.telegramUsername,
      courseId: courses.id,
      courseName: courses.name,
      assignedTo: leads.assignedTo,
      assigneeName: users.name,
    })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .leftJoin(courses, eq(courses.id, leads.interestedCourseId))
    .leftJoin(users, eq(users.id, leads.assignedTo))
    .where(and(...filters))
    .orderBy(desc(leads.updatedAt))
    .limit(Math.min(opts.limit ?? 50, 200))
    .offset(opts.offset ?? 0);
}

export async function getLead(db: DbOrTx, ctx: TenantContext, id: string) {
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.orgId, ctx.orgId)));
  if (!lead) throw errors.notFound("Lead");
  return lead;
}

async function assertCourseInOrg(db: DbOrTx, ctx: TenantContext, courseId: string) {
  const [c] = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, courseId), eq(courses.orgId, ctx.orgId)));
  if (!c) throw errors.notFound("Course");
}

async function assertMemberInOrg(db: DbOrTx, ctx: TenantContext, userId: string) {
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, ctx.orgId)));
  if (!m) throw errors.validation({ assignedTo: "Not a member of this organization" });
}

export async function updateLead(db: DbOrTx, ctx: TenantContext, id: string, input: z.infer<typeof leadUpdateSchema>) {
  const lead = await getLead(db, ctx, id);
  if (input.status && !canTransition(lead.status, input.status)) {
    throw errors.validation({ status: `Cannot move a lead from ${lead.status} to ${input.status}` });
  }
  if (input.interestedCourseId) await assertCourseInOrg(db, ctx, input.interestedCourseId);
  if (input.assignedTo) await assertMemberInOrg(db, ctx, input.assignedTo);
  const [updated] = await db
    .update(leads)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.orgId, ctx.orgId)))
    .returning();
  await recordAudit(db, ctx, {
    action: input.status && input.status !== lead.status ? "lead.status_changed" : "lead.updated",
    entityType: "lead",
    entityId: id,
    metadata: input.status ? { from: lead.status, to: input.status } : { fields: Object.keys(input) },
  });
  return updated;
}

export async function createManualLead(db: DbOrTx, ctx: TenantContext, input: z.infer<typeof leadCreateSchema>) {
  if (input.interestedCourseId) await assertCourseInOrg(db, ctx, input.interestedCourseId);
  const [customer] = await db
    .insert(customers)
    .values({ orgId: ctx.orgId, fullName: input.fullName, phone: input.phone || null })
    .returning();
  const [lead] = await db
    .insert(leads)
    .values({
      orgId: ctx.orgId,
      customerId: customer.id,
      source: "manual",
      interestedCourseId: input.interestedCourseId ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  await recordAudit(db, ctx, { action: "lead.created", entityType: "lead", entityId: lead.id, metadata: { source: "manual" } });
  return lead;
}

/**
 * Returns the customer's open lead, creating it if needed. Safe under
 * concurrent/duplicate deliveries thanks to the partial unique index.
 */
export async function ensureOpenLead(db: DbOrTx, ctx: TenantContext, customerId: string, source = "telegram") {
  const inserted = await db
    .insert(leads)
    .values({ orgId: ctx.orgId, customerId, source })
    .onConflictDoNothing({ target: [leads.orgId, leads.customerId], where: sql`status not in ('won', 'lost')` })
    .returning();
  if (inserted[0]) {
    await recordAudit(db, ctx, { action: "lead.created", entityType: "lead", entityId: inserted[0].id, metadata: { source } });
    return { lead: inserted[0], created: true };
  }
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.orgId, ctx.orgId), eq(leads.customerId, customerId), notInArray(leads.status, CLOSED)))
    .limit(1);
  return { lead, created: false };
}

/** Moves a lead forward automatically (never backwards, never out of a closed state). */
export async function advanceLead(db: DbOrTx, ctx: TenantContext, leadId: string, to: LeadStatus, patch: { interestedCourseId?: string } = {}) {
  const order: LeadStatus[] = ["new", "contacted", "qualified", "trial_booked"];
  const allowedFrom = order.slice(0, order.indexOf(to));
  const updates: Partial<typeof leads.$inferInsert> = { updatedAt: new Date(), ...patch };
  const [moved] = await db
    .update(leads)
    .set({ ...updates, status: to })
    .where(and(eq(leads.id, leadId), eq(leads.orgId, ctx.orgId), inArray(leads.status, allowedFrom.length ? allowedFrom : ["new"])))
    .returning();
  if (moved) {
    await recordAudit(db, ctx, { action: "lead.status_changed", entityType: "lead", entityId: leadId, metadata: { to, automatic: true } });
    return moved;
  }
  if (patch.interestedCourseId) {
    await db.update(leads).set(updates).where(and(eq(leads.id, leadId), eq(leads.orgId, ctx.orgId)));
  }
  return null;
}
