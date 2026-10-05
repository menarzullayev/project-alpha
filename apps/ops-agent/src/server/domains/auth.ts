import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "../db/client";
import { agentSettings, invitations, memberships, organizations, sessions, users } from "../db/schema";
import { hashPassword, randomToken, sha256, verifyPassword } from "../lib/crypto";
import { AppError, errors, isUniqueViolation } from "../lib/errors";
import type { PlatformRole } from "../platform/rbac";
import { getSetting } from "../platform/settings";
import type { Role } from "../rbac";
import type { TenantContext } from "../tenancy";
import { recordAudit } from "./audit";

export const SESSION_COOKIE = "ops_session";
export const SESSION_TTL_DAYS = 14;

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200)
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), "Password must contain letters and digits");

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
  organizationName: z.string().trim().min(2).max(120),
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

export type SessionInfo = {
  sessionId: string;
  user: {
    id: string;
    email: string;
    name: string;
    platformRole: PlatformRole | null;
    mustChangePassword: boolean;
    totpEnabled: boolean;
  };
  /** When this session last passed a TOTP challenge (root-panel step-up). */
  mfaVerifiedAt: Date | null;
  org: { id: string; name: string; slug: string; timezone: string; currency: string; status: "active" | "suspended" } | null;
  role: Role | null;
  memberships: { orgId: string; orgName: string; role: Role }[];
};

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "org"}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "x"}`;
}

export async function createOrganization(tx: DbOrTx, name: string, ownerId: string) {
  const plan = await getSetting(tx, "defaultPlan").catch(() => "free" as const);
  const [org] = await tx.insert(organizations).values({ name, slug: slugify(name), plan }).returning();
  await tx.insert(memberships).values({ orgId: org.id, userId: ownerId, role: "owner" });
  await tx.insert(agentSettings).values({
    orgId: org.id,
    agentName: `${name} assistant`,
    escalationKeywords: ["operator", "menejer", "admin", "shikoyat", "pul qaytar", "оператор", "жалоба", "manager", "refund", "complaint"],
  });
  return org;
}

async function createSession(db: DbOrTx, userId: string, orgId: string | null, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomToken(32);
  const ttlDays = await getSetting(db, "sessionTtlDays").catch(() => SESSION_TTL_DAYS);
  const expiresAt = new Date(Date.now() + ttlDays * 86400_000);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    activeOrgId: orgId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

export async function signup(db: Db, input: z.infer<typeof signupSchema>, meta: { ip?: string | null; userAgent?: string | null }) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ email: input.email, name: input.name, passwordHash }).returning();
      const org = await createOrganization(tx, input.organizationName, user.id);
      await recordAudit(tx, { orgId: org.id, userId: user.id, role: "owner", actorType: "user", ip: meta.ip }, {
        action: "organization.created",
        entityType: "organization",
        entityId: org.id,
      });
      const session = await createSession(tx, user.id, org.id, meta);
      return { user, org, ...session };
    });
  } catch (err) {
    if (isUniqueViolation(err, "users_email_uq")) throw errors.conflict("An account with this email already exists");
    throw err;
  }
}

// Constant-time-ish failure path: always run one scrypt verification.
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export async function login(db: Db, input: z.infer<typeof loginSchema>, meta: { ip?: string | null; userAgent?: string | null }) {
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${input.email}`).limit(1);
  const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw errors.unauthorized("Invalid email or password");
  if (user.status === "suspended") throw new AppError("account_suspended", "This account has been suspended. Contact support.", 403);
  const [membership] = await db
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .orderBy(memberships.createdAt)
    .limit(1);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const session = await createSession(db, user.id, membership?.orgId ?? null, meta);
  return { user, ...session };
}

export async function logout(db: DbOrTx, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export async function resolveSession(db: DbOrTx, token: string | undefined | null): Promise<SessionInfo | null> {
  if (!token || token.length > 200) return null;
  const [row] = await db
    .select({
      session: sessions,
      user: {
        id: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        platformRole: users.platformRole,
        mustChangePassword: users.mustChangePassword,
        totpEnabledAt: users.totpEnabledAt,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || row.user.status === "suspended") return null;

  const mems = await db
    .select({
      orgId: memberships.orgId,
      role: memberships.role,
      orgName: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
      currency: organizations.currency,
      orgStatus: organizations.status,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, row.user.id))
    .orderBy(memberships.createdAt);

  // The active org must still be one the user belongs to (membership may have been revoked).
  const active = mems.find((m) => m.orgId === row.session.activeOrgId) ?? mems[0] ?? null;
  return {
    sessionId: row.session.id,
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      platformRole: row.user.platformRole,
      mustChangePassword: row.user.mustChangePassword,
      totpEnabled: Boolean(row.user.totpEnabledAt),
    },
    mfaVerifiedAt: row.session.mfaVerifiedAt,
    org: active
      ? {
          id: active.orgId,
          name: active.orgName,
          slug: active.slug,
          timezone: active.timezone,
          currency: active.currency,
          status: active.orgStatus,
        }
      : null,
    role: active?.role ?? null,
    memberships: mems.map((m) => ({ orgId: m.orgId, orgName: m.orgName, role: m.role })),
  };
}

export async function switchOrganization(db: DbOrTx, session: SessionInfo, orgId: string) {
  if (!session.memberships.some((m) => m.orgId === orgId)) throw errors.forbidden();
  await db.update(sessions).set({ activeOrgId: orgId }).where(eq(sessions.id, session.sessionId));
}

export async function createAdditionalOrganization(db: Db, session: SessionInfo, name: string) {
  const max = await getSetting(db, "maxOrganizationsPerUser");
  const owned = session.memberships.filter((m) => m.role === "owner").length;
  if (owned >= max) throw errors.conflict(`You can own at most ${max} workspaces`);
  return db.transaction(async (tx) => {
    const org = await createOrganization(tx, name, session.user.id);
    await tx.update(sessions).set({ activeOrgId: org.id }).where(eq(sessions.id, session.sessionId));
    await recordAudit(tx, { orgId: org.id, userId: session.user.id, role: "owner", actorType: "user" }, {
      action: "organization.created",
      entityType: "organization",
      entityId: org.id,
    });
    return org;
  });
}

// ---------------------------------------------------------------- invitations

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "operator", "viewer"]),
});

export async function createInvitation(db: DbOrTx, ctx: TenantContext, input: z.infer<typeof inviteSchema>) {
  const token = randomToken(24);
  const [inv] = await db
    .insert(invitations)
    .values({
      orgId: ctx.orgId,
      email: input.email,
      role: input.role,
      tokenHash: sha256(token),
      invitedBy: ctx.userId,
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    })
    .returning();
  await recordAudit(db, ctx, {
    action: "invitation.created",
    entityType: "invitation",
    entityId: inv.id,
    metadata: { email: input.email, role: input.role },
  });
  return { invitation: inv, token };
}

export async function getInvitationByToken(db: DbOrTx, token: string) {
  const [row] = await db
    .select({ invitation: invitations, orgName: organizations.name })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .where(
      and(
        eq(invitations.tokenHash, sha256(token)),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export const acceptInviteSchema = z.object({
  token: z.string().min(10).max(200),
  name: z.string().trim().min(1).max(100).optional(),
  password: passwordSchema.optional(),
});

/**
 * Accepts an invitation. A signed-in user joins directly (their email must
 * match); otherwise a new account is created with the invited email.
 */
export async function acceptInvitation(
  db: Db,
  input: z.infer<typeof acceptInviteSchema>,
  session: SessionInfo | null,
  meta: { ip?: string | null; userAgent?: string | null },
) {
  return db.transaction(async (tx) => {
    const found = await getInvitationByToken(tx, input.token);
    if (!found) throw errors.notFound("Invitation");
    const inv = found.invitation;
    let userId: string;
    let newSession: { token: string; expiresAt: Date } | null = null;

    if (session) {
      if (session.user.email.toLowerCase() !== inv.email.toLowerCase()) {
        throw errors.forbidden("This invitation was sent to a different email address");
      }
      userId = session.user.id;
    } else {
      if (!input.name || !input.password) throw errors.validation({ name: "required", password: "required" });
      const [existing] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${inv.email}`);
      if (existing) throw errors.conflict("An account with this email exists — sign in first, then open the link again");
      const [user] = await tx
        .insert(users)
        .values({ email: inv.email, name: input.name, passwordHash: await hashPassword(input.password) })
        .returning();
      userId = user.id;
    }

    await tx
      .insert(memberships)
      .values({ orgId: inv.orgId, userId, role: inv.role })
      .onConflictDoNothing({ target: [memberships.orgId, memberships.userId] });
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
    if (session) {
      await tx.update(sessions).set({ activeOrgId: inv.orgId }).where(eq(sessions.id, session.sessionId));
    } else {
      newSession = await createSession(tx, userId, inv.orgId, meta);
    }
    await recordAudit(tx, { orgId: inv.orgId, userId, role: inv.role, actorType: "user", ip: meta.ip }, {
      action: "invitation.accepted",
      entityType: "membership",
      entityId: userId,
      metadata: { role: inv.role },
    });
    return { orgId: inv.orgId, session: newSession };
  });
}

// ---------------------------------------------------------------- password change

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

/** Changes the password and revokes every other session of the user. */
export async function changePassword(db: Db, session: SessionInfo, input: z.infer<typeof changePasswordSchema>) {
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw errors.validation({ currentPassword: ["Current password is incorrect"] }, "Current password is incorrect");
  }
  if (input.currentPassword === input.newPassword) throw errors.validation({ newPassword: ["Choose a different password"] });
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash: await hashPassword(input.newPassword), mustChangePassword: false })
      .where(eq(users.id, user.id));
    await tx.delete(sessions).where(and(eq(sessions.userId, user.id), sql`${sessions.id} <> ${session.sessionId}`));
  });
}
