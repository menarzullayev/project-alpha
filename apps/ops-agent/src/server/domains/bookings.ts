import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "../db/client";
import { bookingStatusEnum, bookings, courseSlots, courses, customers } from "../db/schema";
import { errors, isUniqueViolation } from "../lib/errors";
import type { TenantContext } from "../tenancy";
import { recordAudit } from "./audit";
import { advanceLead, ensureOpenLead } from "./leads";

export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];

export const bookingCreateSchema = z.object({
  customerId: z.string().uuid(),
  slotId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});

export const bookingStatusSchema = z.object({ status: z.enum(bookingStatusEnum.enumValues) });

export async function listBookings(
  db: DbOrTx,
  ctx: TenantContext,
  opts: { status?: BookingStatus; upcoming?: boolean; limit?: number } = {},
) {
  const filters = [eq(bookings.orgId, ctx.orgId)];
  if (opts.status) filters.push(eq(bookings.status, opts.status));
  if (opts.upcoming) filters.push(sql`${courseSlots.startsAt} > now()`);
  return db
    .select({
      id: bookings.id,
      status: bookings.status,
      source: bookings.source,
      notes: bookings.notes,
      createdAt: bookings.createdAt,
      customerId: customers.id,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      courseId: courses.id,
      courseName: courses.name,
      slotId: courseSlots.id,
      startsAt: courseSlots.startsAt,
      location: courseSlots.location,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(courses, eq(courses.id, bookings.courseId))
    .innerJoin(courseSlots, eq(courseSlots.id, bookings.slotId))
    .where(and(...filters))
    .orderBy(opts.upcoming ? courseSlots.startsAt : desc(bookings.createdAt))
    .limit(Math.min(opts.limit ?? 100, 500));
}

export type CreateBookingResult = {
  booking: typeof bookings.$inferSelect;
  created: boolean;
};

/**
 * Books a customer into a slot. Locks the slot row so concurrent requests
 * cannot overbook; returns the existing booking when the same customer is
 * already booked into the slot (idempotent).
 */
export async function createBooking(
  db: Db,
  ctx: TenantContext,
  input: z.infer<typeof bookingCreateSchema> & { source?: string },
): Promise<CreateBookingResult> {
  try {
    return await db.transaction(async (tx) => {
      const [slot] = await tx
        .select()
        .from(courseSlots)
        .where(and(eq(courseSlots.id, input.slotId), eq(courseSlots.orgId, ctx.orgId)))
        .for("update");
      if (!slot) throw errors.notFound("Slot");
      const [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.orgId, ctx.orgId)));
      if (!customer) throw errors.notFound("Customer");

      const [existing] = await tx
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.slotId, slot.id),
            eq(bookings.customerId, customer.id),
            sql`${bookings.status} in ('pending','confirmed')`,
          ),
        );
      if (existing) return { booking: existing, created: false };

      if (!slot.isActive || slot.startsAt.getTime() <= Date.now()) throw errors.conflict("This time slot is no longer available");
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(bookings)
        .where(and(eq(bookings.slotId, slot.id), sql`${bookings.status} in ('pending','confirmed')`));
      if (n >= slot.capacity) throw errors.conflict("This time slot is full");

      const { lead } = await ensureOpenLead(tx, ctx, customer.id, input.source ?? "manual");
      const [booking] = await tx
        .insert(bookings)
        .values({
          orgId: ctx.orgId,
          customerId: customer.id,
          courseId: slot.courseId,
          slotId: slot.id,
          leadId: lead?.id ?? null,
          status: "confirmed",
          source: input.source ?? "manual",
          notes: input.notes ?? null,
        })
        .returning();
      if (lead) await advanceLead(tx, ctx, lead.id, "trial_booked", { interestedCourseId: slot.courseId });
      await recordAudit(tx, ctx, {
        action: "booking.created",
        entityType: "booking",
        entityId: booking.id,
        metadata: { slotId: slot.id, courseId: slot.courseId, source: booking.source },
      });
      return { booking, created: true };
    });
  } catch (err) {
    if (isUniqueViolation(err, "bookings_active_slot_customer_uq")) {
      const [existing] = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.orgId, ctx.orgId),
            eq(bookings.slotId, input.slotId),
            eq(bookings.customerId, input.customerId),
            sql`${bookings.status} in ('pending','confirmed')`,
          ),
        );
      if (existing) return { booking: existing, created: false };
    }
    throw err;
  }
}

export async function updateBookingStatus(db: DbOrTx, ctx: TenantContext, id: string, status: BookingStatus) {
  const [b] = await db
    .update(bookings)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(bookings.id, id), eq(bookings.orgId, ctx.orgId)))
    .returning();
  if (!b) throw errors.notFound("Booking");
  await recordAudit(db, ctx, { action: "booking.status_changed", entityType: "booking", entityId: id, metadata: { status } });
  return b;
}
