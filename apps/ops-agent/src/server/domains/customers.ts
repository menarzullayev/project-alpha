import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client";
import { bookings, conversations, customers, leads } from "../db/schema";
import { errors } from "../lib/errors";
import type { TenantContext } from "../tenancy";
import { recordAudit } from "./audit";

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine((v) => /^\+?\d{7,15}$/.test(v), "Invalid phone number");

export const customerInputSchema = z.object({
  fullName: z.string().trim().min(1).max(120).nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function listCustomers(db: DbOrTx, ctx: TenantContext, opts: { q?: string; limit?: number; offset?: number } = {}) {
  const filters = [eq(customers.orgId, ctx.orgId)];
  if (opts.q) {
    const q = `%${opts.q.replace(/[%_]/g, "")}%`;
    filters.push(or(ilike(customers.fullName, q), ilike(customers.phone, q), ilike(customers.telegramUsername, q))!);
  }
  return db
    .select()
    .from(customers)
    .where(and(...filters))
    .orderBy(desc(customers.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200))
    .offset(opts.offset ?? 0);
}

export async function getCustomer(db: DbOrTx, ctx: TenantContext, id: string) {
  const [c] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.orgId, ctx.orgId)));
  if (!c) throw errors.notFound("Customer");
  return c;
}

export async function getCustomerOverview(db: DbOrTx, ctx: TenantContext, id: string) {
  const customer = await getCustomer(db, ctx, id);
  const [customerLeads, customerBookings, convs] = await Promise.all([
    db.select().from(leads).where(and(eq(leads.orgId, ctx.orgId), eq(leads.customerId, id))).orderBy(desc(leads.createdAt)),
    db.select().from(bookings).where(and(eq(bookings.orgId, ctx.orgId), eq(bookings.customerId, id))).orderBy(desc(bookings.createdAt)),
    db
      .select()
      .from(conversations)
      .where(and(eq(conversations.orgId, ctx.orgId), eq(conversations.customerId, id)))
      .orderBy(desc(conversations.lastMessageAt)),
  ]);
  return { customer, leads: customerLeads, bookings: customerBookings, conversations: convs };
}

export async function createCustomer(db: DbOrTx, ctx: TenantContext, input: z.infer<typeof customerInputSchema>) {
  const [c] = await db
    .insert(customers)
    .values({ orgId: ctx.orgId, fullName: input.fullName ?? null, phone: input.phone ?? null, notes: input.notes ?? null })
    .returning();
  await recordAudit(db, ctx, { action: "customer.created", entityType: "customer", entityId: c.id });
  return c;
}

export async function updateCustomer(db: DbOrTx, ctx: TenantContext, id: string, input: z.infer<typeof customerInputSchema>) {
  const [c] = await db
    .update(customers)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.orgId, ctx.orgId)))
    .returning();
  if (!c) throw errors.notFound("Customer");
  await recordAudit(db, ctx, { action: "customer.updated", entityType: "customer", entityId: id, metadata: { fields: Object.keys(input) } });
  return c;
}

/** Idempotent upsert keyed by (org, telegram user id). */
export async function upsertTelegramCustomer(
  db: DbOrTx,
  orgId: string,
  tg: { userId: string; username?: string | null; fullName?: string | null; language?: string | null },
) {
  const [c] = await db
    .insert(customers)
    .values({
      orgId,
      telegramUserId: tg.userId,
      telegramUsername: tg.username ?? null,
      fullName: tg.fullName ?? null,
      language: tg.language ?? null,
    })
    .onConflictDoUpdate({
      target: [customers.orgId, customers.telegramUserId],
      set: {
        telegramUsername: sql`coalesce(excluded.telegram_username, ${customers.telegramUsername})`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return c;
}
