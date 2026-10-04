import { and, asc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client";
import { bookings, courseSlots, courses } from "../db/schema";
import { errors } from "../lib/errors";
import type { TenantContext } from "../tenancy";
import { recordAudit } from "./audit";

export const courseInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(4000).default(""),
  category: z.string().max(80).default(""),
  level: z.string().max(80).default(""),
  keywords: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  priceAmount: z.coerce.number().int().min(0).max(1_000_000_000),
  pricePeriod: z.enum(["month", "course", "lesson"]).default("month"),
  durationWeeks: z.coerce.number().int().min(1).max(520).nullable().optional(),
  scheduleText: z.string().max(500).default(""),
  format: z.enum(["offline", "online", "hybrid"]).default("offline"),
  isActive: z.boolean().default(true),
});

export const slotInputSchema = z.object({
  startsAt: z.coerce.date(),
  durationMin: z.coerce.number().int().min(15).max(600).default(60),
  capacity: z.coerce.number().int().min(1).max(500).default(5),
  location: z.string().max(200).default(""),
});

export async function listCourses(db: DbOrTx, ctx: TenantContext, opts: { activeOnly?: boolean } = {}) {
  const filters = [eq(courses.orgId, ctx.orgId)];
  if (opts.activeOnly) filters.push(eq(courses.isActive, true));
  return db.select().from(courses).where(and(...filters)).orderBy(asc(courses.name));
}

export async function getCourse(db: DbOrTx, ctx: TenantContext, id: string) {
  const [c] = await db.select().from(courses).where(and(eq(courses.id, id), eq(courses.orgId, ctx.orgId)));
  if (!c) throw errors.notFound("Course");
  return c;
}

export async function createCourse(db: DbOrTx, ctx: TenantContext, input: z.infer<typeof courseInputSchema>) {
  const [c] = await db.insert(courses).values({ ...input, orgId: ctx.orgId }).returning();
  await recordAudit(db, ctx, { action: "course.created", entityType: "course", entityId: c.id, metadata: { name: c.name } });
  return c;
}

export async function updateCourse(db: DbOrTx, ctx: TenantContext, id: string, input: Partial<z.infer<typeof courseInputSchema>>) {
  const [c] = await db
    .update(courses)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(courses.id, id), eq(courses.orgId, ctx.orgId)))
    .returning();
  if (!c) throw errors.notFound("Course");
  await recordAudit(db, ctx, { action: "course.updated", entityType: "course", entityId: id, metadata: { fields: Object.keys(input) } });
  return c;
}

export async function deleteCourse(db: DbOrTx, ctx: TenantContext, id: string) {
  const [c] = await db.delete(courses).where(and(eq(courses.id, id), eq(courses.orgId, ctx.orgId))).returning({ id: courses.id });
  if (!c) throw errors.notFound("Course");
  await recordAudit(db, ctx, { action: "course.deleted", entityType: "course", entityId: id });
}

export type SlotWithAvailability = typeof courseSlots.$inferSelect & { booked: number; available: number };

export async function listSlots(
  db: DbOrTx,
  ctx: TenantContext,
  opts: { courseId?: string; upcomingOnly?: boolean; limit?: number } = {},
): Promise<SlotWithAvailability[]> {
  const filters = [eq(courseSlots.orgId, ctx.orgId)];
  if (opts.courseId) filters.push(eq(courseSlots.courseId, opts.courseId));
  if (opts.upcomingOnly) filters.push(gt(courseSlots.startsAt, new Date()), eq(courseSlots.isActive, true));
  const rows = await db
    .select({
      slot: courseSlots,
      // Fully qualified: drizzle renders a bare "id" here, which Postgres would bind to b.id.
      booked: sql<number>`(select count(*)::int from ${bookings} b where b.slot_id = ops_agent.course_slots.id and b.status in ('pending','confirmed'))`,
    })
    .from(courseSlots)
    .where(and(...filters))
    .orderBy(asc(courseSlots.startsAt))
    .limit(Math.min(opts.limit ?? 100, 500));
  return rows.map((r) => ({ ...r.slot, booked: r.booked, available: Math.max(0, r.slot.capacity - r.booked) }));
}

export async function createSlot(db: DbOrTx, ctx: TenantContext, courseId: string, input: z.infer<typeof slotInputSchema>) {
  await getCourse(db, ctx, courseId);
  const [s] = await db.insert(courseSlots).values({ ...input, courseId, orgId: ctx.orgId }).returning();
  await recordAudit(db, ctx, { action: "slot.created", entityType: "course_slot", entityId: s.id, metadata: { courseId } });
  return s;
}

export async function deactivateSlot(db: DbOrTx, ctx: TenantContext, slotId: string) {
  const [s] = await db
    .update(courseSlots)
    .set({ isActive: false })
    .where(and(eq(courseSlots.id, slotId), eq(courseSlots.orgId, ctx.orgId)))
    .returning();
  if (!s) throw errors.notFound("Slot");
  await recordAudit(db, ctx, { action: "slot.deactivated", entityType: "course_slot", entityId: slotId });
  return s;
}
