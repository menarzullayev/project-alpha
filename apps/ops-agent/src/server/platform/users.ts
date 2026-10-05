import { randomInt } from "node:crypto";
import { and, count, desc, eq, ilike, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "../db/client";
import { memberships, organizations, platformRoleEnum, roleEnum, sessions, users } from "../db/schema";
import { emailSchema } from "../domains/auth";
import { hashPassword } from "../lib/crypto";
import { errors, isUniqueViolation } from "../lib/errors";
import { recordPlatformAudit } from "./audit";
import type { RootContext } from "./context";
import { canPlatform, type PlatformRole } from "./rbac";

export const userListQuery = z.object({
  q: z.string().max(100).optional(),
  role: z.enum([...platformRoleEnum.enumValues, "none"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(100),
  platformRole: z.enum(platformRoleEnum.enumValues).nullable().default(null),
  organizationId: z.string().uuid().optional(),
  organizationRole: z.enum(roleEnum.enumValues).default("admin"),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: emailSchema.optional(),
  platformRole: z.enum(platformRoleEnum.enumValues).nullable().optional(),
});

export const suspendSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const membershipSchema = z.object({ organizationId: z.string().uuid(), role: z.enum(roleEnum.enumValues) });

/** Readable one-time password: 4 groups, letters + digits, satisfies password policy. */
// No look-alikes (0/O, 1/l/I) so passwords can be read out over the phone.
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 16 random characters (~93 bits) in four dash-separated groups, e.g. `Kp7w-x2Qa-9mFt-Rb4c`. */
export function temporaryPassword() {
  const chars = Array.from({ length: 16 }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join("");
  return chars.match(/.{4}/g)!.join("-");
}

export async function listUsers(db: DbOrTx, opts: z.infer<typeof userListQuery>) {
  const filters: SQL[] = [];
  if (opts.q) {
    const q = `%${opts.q.replace(/[%_]/g, "")}%`;
    filters.push(or(ilike(users.email, q), ilike(users.name, q))!);
  }
  if (opts.role === "none") filters.push(sql`${users.platformRole} is null`);
  else if (opts.role) filters.push(eq(users.platformRole, opts.role));
  if (opts.status) filters.push(eq(users.status, opts.status));
  const where = filters.length ? and(...filters) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        platformRole: users.platformRole,
        status: users.status,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        totpEnabled: sql<boolean>`${users.totpEnabledAt} is not null`,
        workspaces: sql<number>`(select count(*)::int from ${memberships} m where m.user_id = ${users.id})`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(opts.limit)
      .offset(opts.offset),
    db.select({ total: count() }).from(users).where(where),
  ]);
  return { users: rows, total };
}

export async function getUserDetail(db: DbOrTx, id: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      platformRole: users.platformRole,
      status: users.status,
      suspendedAt: users.suspendedAt,
      suspendedReason: users.suspendedReason,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      mustChangePassword: users.mustChangePassword,
      totpEnabledAt: users.totpEnabledAt,
    })
    .from(users)
    .where(eq(users.id, id));
  if (!user) throw errors.notFound("User");
  const [mems, [{ activeSessions }]] = await Promise.all([
    db
      .select({ organizationId: organizations.id, organizationName: organizations.name, organizationStatus: organizations.status, role: memberships.role, joinedAt: memberships.createdAt })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, id))
      .orderBy(memberships.createdAt),
    db.select({ activeSessions: sql<number>`count(*)::int` }).from(sessions).where(and(eq(sessions.userId, id), sql`${sessions.expiresAt} > now()`)),
  ]);
  return { user, memberships: mems, activeSessions };
}

async function activeSuperadmins(db: DbOrTx) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.platformRole, "superadmin"), eq(users.status, "active")));
  return n;
}

function assertCanAssign(ctx: RootContext, role: PlatformRole | null) {
  if (role !== null && !canPlatform(ctx.role, "platform_roles:assign")) throw errors.forbidden("Only a superadmin can grant platform roles");
}

/** Platform-operator accounts can only be managed by a superadmin (no lateral/upward moves by admins). */
function assertCanManage(ctx: RootContext, target: { id: string; platformRole: PlatformRole | null }) {
  if (target.platformRole && target.id !== ctx.userId && !canPlatform(ctx.role, "platform_roles:assign")) {
    throw errors.forbidden("Only a superadmin can manage platform operator accounts");
  }
}

export async function createUser(db: Db, ctx: RootContext, input: z.infer<typeof createUserSchema>) {
  assertCanAssign(ctx, input.platformRole);
  const password = temporaryPassword();
  try {
    const user = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ email: input.email, name: input.name, passwordHash: await hashPassword(password), platformRole: input.platformRole, mustChangePassword: true })
        .returning();
      if (input.organizationId) {
        const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, input.organizationId));
        if (!org) throw errors.notFound("Organization");
        await tx.insert(memberships).values({ orgId: org.id, userId: u.id, role: input.organizationRole });
      }
      await recordPlatformAudit(tx, ctx, {
        action: "user.created",
        targetType: "user",
        targetId: u.id,
        metadata: { email: u.email, platformRole: input.platformRole, organizationId: input.organizationId, organizationRole: input.organizationId ? input.organizationRole : undefined },
      });
      return u;
    });
    return { user: { id: user.id, email: user.email }, temporaryPassword: password };
  } catch (err) {
    if (isUniqueViolation(err, "users_email_uq")) throw errors.conflict("A user with this email already exists");
    throw err;
  }
}

export async function updateUser(db: Db, ctx: RootContext, id: string, input: z.infer<typeof updateUserSchema>) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(users).where(eq(users.id, id)).for("update");
    if (!current) throw errors.notFound("User");
    assertCanManage(ctx, current);
    if (input.platformRole !== undefined && input.platformRole !== current.platformRole) {
      assertCanAssign(ctx, input.platformRole ?? "support");
      if (id === ctx.userId) throw errors.forbidden("You cannot change your own platform role");
      if (current.platformRole === "superadmin" && current.status === "active" && (await activeSuperadmins(tx)) <= 1) {
        throw errors.conflict("The platform must keep at least one active superadmin");
      }
    }
    try {
      const [u] = await tx.update(users).set(input).where(eq(users.id, id)).returning();
      await recordPlatformAudit(tx, ctx, {
        action: input.platformRole !== undefined && input.platformRole !== current.platformRole ? "user.platform_role_changed" : "user.updated",
        targetType: "user",
        targetId: id,
        metadata: { ...input, previousPlatformRole: current.platformRole },
      });
      return u;
    } catch (err) {
      if (isUniqueViolation(err, "users_email_uq")) throw errors.conflict("A user with this email already exists");
      throw err;
    }
  });
}

export async function setUserStatus(db: Db, ctx: RootContext, id: string, status: "active" | "suspended", reason?: string) {
  if (id === ctx.userId) throw errors.forbidden("You cannot suspend your own account");
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(users).where(eq(users.id, id)).for("update");
    if (!current) throw errors.notFound("User");
    assertCanManage(ctx, current);
    if (status === "suspended" && current.platformRole === "superadmin") {
      if (current.status === "active" && (await activeSuperadmins(tx)) <= 1) throw errors.conflict("The platform must keep at least one active superadmin");
    }
    await tx
      .update(users)
      .set(status === "suspended" ? { status, suspendedAt: new Date(), suspendedReason: reason ?? null } : { status, suspendedAt: null, suspendedReason: null })
      .where(eq(users.id, id));
    if (status === "suspended") await tx.delete(sessions).where(eq(sessions.userId, id));
    await recordPlatformAudit(tx, ctx, { action: status === "suspended" ? "user.suspended" : "user.reactivated", targetType: "user", targetId: id, metadata: { reason, email: current.email } });
  });
}

export async function resetUserPassword(db: Db, ctx: RootContext, id: string) {
  const password = temporaryPassword();
  await db.transaction(async (tx) => {
    const [u] = await tx.select({ id: users.id, platformRole: users.platformRole }).from(users).where(eq(users.id, id));
    if (!u) throw errors.notFound("User");
    assertCanManage(ctx, u);
    await tx.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: true }).where(eq(users.id, id));
    await tx.delete(sessions).where(eq(sessions.userId, id));
    await recordPlatformAudit(tx, ctx, { action: "user.password_reset", targetType: "user", targetId: id });
  });
  return { temporaryPassword: password };
}

export async function revokeUserSessions(db: Db, ctx: RootContext, id: string) {
  const [target] = await db.select({ id: users.id, platformRole: users.platformRole }).from(users).where(eq(users.id, id));
  if (!target) throw errors.notFound("User");
  assertCanManage(ctx, target);
  const deleted = await db.delete(sessions).where(and(eq(sessions.userId, id), id === ctx.userId ? ne(sessions.id, ctx.sessionId) : undefined)).returning({ id: sessions.id });
  await recordPlatformAudit(db, ctx, { action: "user.sessions_revoked", targetType: "user", targetId: id, metadata: { count: deleted.length } });
  return { revoked: deleted.length };
}

export async function resetUserMfa(db: Db, ctx: RootContext, id: string) {
  if (!canPlatform(ctx.role, "platform_roles:assign")) throw errors.forbidden();
  const [u] = await db.update(users).set({ totpSecretEncrypted: null, totpEnabledAt: null }).where(eq(users.id, id)).returning({ id: users.id });
  if (!u) throw errors.notFound("User");
  await db.update(sessions).set({ mfaVerifiedAt: null }).where(eq(sessions.userId, id));
  await recordPlatformAudit(db, ctx, { action: "user.mfa_reset", targetType: "user", targetId: id });
}

async function ownerCount(db: DbOrTx, orgId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "owner")));
  return n;
}

export async function setMembership(db: Db, ctx: RootContext, userId: string, input: z.infer<typeof membershipSchema>) {
  return db.transaction(async (tx) => {
    const [org] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, input.organizationId));
    if (!org) throw errors.notFound("Organization");
    const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!u) throw errors.notFound("User");
    const [existing] = await tx.select().from(memberships).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, userId)));
    if (existing?.role === "owner" && input.role !== "owner" && (await ownerCount(tx, org.id)) <= 1) {
      throw errors.conflict("A workspace must keep at least one owner");
    }
    await tx
      .insert(memberships)
      .values({ orgId: org.id, userId, role: input.role })
      .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: input.role } });
    await recordPlatformAudit(tx, ctx, { action: existing ? "membership.role_changed" : "membership.added", targetType: "user", targetId: userId, metadata: { organizationId: org.id, role: input.role, previousRole: existing?.role } });
  });
}

export async function removeMembership(db: Db, ctx: RootContext, userId: string, orgId: string) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
    if (!existing) throw errors.notFound("Membership");
    if (existing.role === "owner" && (await ownerCount(tx, orgId)) <= 1) throw errors.conflict("A workspace must keep at least one owner");
    await tx.delete(memberships).where(eq(memberships.id, existing.id));
    await recordPlatformAudit(tx, ctx, { action: "membership.removed", targetType: "user", targetId: userId, metadata: { organizationId: orgId, role: existing.role } });
  });
}

export async function platformOperators(db: DbOrTx) {
  return db
    .select({ id: users.id, email: users.email, name: users.name, platformRole: users.platformRole, status: users.status, totpEnabledAt: users.totpEnabledAt, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(isNotNull(users.platformRole))
    .orderBy(users.createdAt);
}
