import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "../db/client";
import { invitations, memberships, organizations, users } from "../db/schema";
import { errors } from "../lib/errors";
import { canAssignRole, type Role } from "../rbac";
import type { TenantContext } from "../tenancy";
import { recordAudit } from "./audit";

export async function listMembers(db: DbOrTx, ctx: TenantContext) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      joinedAt: memberships.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, ctx.orgId))
    .orderBy(memberships.createdAt);
}

export async function listPendingInvitations(db: DbOrTx, ctx: TenantContext) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(and(eq(invitations.orgId, ctx.orgId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .orderBy(desc(invitations.createdAt));
}

export async function revokeInvitation(db: DbOrTx, ctx: TenantContext, id: string) {
  const [row] = await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, id), eq(invitations.orgId, ctx.orgId), isNull(invitations.acceptedAt)))
    .returning({ id: invitations.id });
  if (!row) throw errors.notFound("Invitation");
  await recordAudit(db, ctx, { action: "invitation.revoked", entityType: "invitation", entityId: id });
}

async function getMembership(db: DbOrTx, ctx: TenantContext, userId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, userId)));
  if (!m) throw errors.notFound("Member");
  return m;
}

async function ownerCount(db: DbOrTx, orgId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "owner")));
  return r.n;
}

export const changeRoleSchema = z.object({ role: z.enum(["owner", "admin", "operator", "viewer"]) });

export async function changeMemberRole(db: Db, ctx: TenantContext, userId: string, role: Role) {
  return db.transaction(async (tx) => {
    const target = await getMembership(tx, ctx, userId);
    if (!canAssignRole(ctx.role, target.role) || !canAssignRole(ctx.role, role)) throw errors.forbidden();
    if (target.role === "owner" && role !== "owner" && (await ownerCount(tx, ctx.orgId)) <= 1) {
      throw errors.conflict("An organization must keep at least one owner");
    }
    await tx.update(memberships).set({ role }).where(eq(memberships.id, target.id));
    await recordAudit(tx, ctx, {
      action: "member.role_changed",
      entityType: "membership",
      entityId: userId,
      metadata: { from: target.role, to: role },
    });
  });
}

export async function removeMember(db: Db, ctx: TenantContext, userId: string) {
  return db.transaction(async (tx) => {
    const target = await getMembership(tx, ctx, userId);
    const self = userId === ctx.userId;
    if (!self && !canAssignRole(ctx.role, target.role)) throw errors.forbidden();
    if (target.role === "owner" && (await ownerCount(tx, ctx.orgId)) <= 1) {
      throw errors.conflict("An organization must keep at least one owner");
    }
    await tx.delete(memberships).where(eq(memberships.id, target.id));
    await recordAudit(tx, ctx, { action: "member.removed", entityType: "membership", entityId: userId });
  });
}

export const orgUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  timezone: z
    .string()
    .max(64)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown time zone")
    .optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
});

export async function updateOrganization(db: DbOrTx, ctx: TenantContext, input: z.infer<typeof orgUpdateSchema>) {
  const [org] = await db.update(organizations).set(input).where(eq(organizations.id, ctx.orgId)).returning();
  await recordAudit(db, ctx, { action: "organization.updated", entityType: "organization", entityId: ctx.orgId, metadata: input });
  return org;
}
