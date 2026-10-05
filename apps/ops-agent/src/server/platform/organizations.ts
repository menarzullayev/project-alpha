import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "../db/client";
import { integrations, memberships, organizations, users } from "../db/schema";
import { errors } from "../lib/errors";
import { recordPlatformAudit } from "./audit";
import type { RootContext } from "./context";

export const PLANS = ["free", "pro", "enterprise"] as const;

export const orgListQuery = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  plan: z.enum(PLANS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const updateOrgSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  plan: z.enum(PLANS).optional(),
});

const usage = {
  members: sql<number>`(select count(*)::int from ops_agent.memberships m where m.org_id = ${organizations.id})`,
  leads: sql<number>`(select count(*)::int from ops_agent.leads l where l.org_id = ${organizations.id})`,
  bookings: sql<number>`(select count(*)::int from ops_agent.bookings b where b.org_id = ${organizations.id})`,
  messages30d: sql<number>`(select count(*)::int from ops_agent.messages x where x.org_id = ${organizations.id} and x.created_at > now() - interval '30 days')`,
  lastActivityAt: sql<Date | null>`(select max(c.last_message_at) from ops_agent.conversations c where c.org_id = ${organizations.id})`,
};

export async function listOrganizations(db: DbOrTx, opts: z.infer<typeof orgListQuery>) {
  const filters: SQL[] = [];
  if (opts.q) {
    const q = `%${opts.q.replace(/[%_]/g, "")}%`;
    filters.push(or(ilike(organizations.name, q), ilike(organizations.slug, q))!);
  }
  if (opts.status) filters.push(eq(organizations.status, opts.status));
  if (opts.plan) filters.push(eq(organizations.plan, opts.plan));
  const where = filters.length ? and(...filters) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        plan: organizations.plan,
        status: organizations.status,
        createdAt: organizations.createdAt,
        ...usage,
      })
      .from(organizations)
      .where(where)
      .orderBy(desc(organizations.createdAt))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ total: count() }).from(organizations).where(where),
  ]);
  return { organizations: rows, total };
}

export async function getOrganizationDetail(db: DbOrTx, id: string) {
  const [org] = await db.select({ org: organizations, ...usage }).from(organizations).where(eq(organizations.id, id));
  if (!org) throw errors.notFound("Organization");
  const [members, tg] = await Promise.all([
    db
      .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, status: users.status })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, id))
      .orderBy(memberships.createdAt),
    db
      .select({ status: integrations.status, mode: integrations.mode, name: integrations.name, lastError: integrations.lastError })
      .from(integrations)
      .where(and(eq(integrations.orgId, id), eq(integrations.type, "telegram"))),
  ]);
  const { org: o, ...stats } = org;
  return { organization: o, stats, members, telegram: tg[0] ?? null };
}

export async function updateOrganizationAsRoot(db: Db, ctx: RootContext, id: string, input: z.infer<typeof updateOrgSchema>) {
  const [before] = await db.select().from(organizations).where(eq(organizations.id, id));
  if (!before) throw errors.notFound("Organization");
  const [org] = await db.update(organizations).set(input).where(eq(organizations.id, id)).returning();
  await recordPlatformAudit(db, ctx, {
    action: input.plan && input.plan !== before.plan ? "organization.plan_changed" : "organization.updated",
    targetType: "organization",
    targetId: id,
    metadata: { ...input, previousPlan: before.plan },
  });
  return org;
}

/** Suspension blocks the dashboard/API for members and stops the Telegram agent. */
export async function setOrganizationStatus(db: Db, ctx: RootContext, id: string, status: "active" | "suspended", reason?: string) {
  const [org] = await db
    .update(organizations)
    .set(status === "suspended" ? { status, suspendedAt: new Date(), suspendedReason: reason ?? null } : { status, suspendedAt: null, suspendedReason: null })
    .where(eq(organizations.id, id))
    .returning();
  if (!org) throw errors.notFound("Organization");
  await recordPlatformAudit(db, ctx, {
    action: status === "suspended" ? "organization.suspended" : "organization.reactivated",
    targetType: "organization",
    targetId: id,
    metadata: { reason, name: org.name },
  });
  return org;
}
