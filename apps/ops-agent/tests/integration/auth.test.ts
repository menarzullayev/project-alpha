import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POST as acceptInviteRoute } from "@/app/api/v1/auth/accept-invite/route";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { POST as logoutRoute } from "@/app/api/v1/auth/logout/route";
import { GET as meRoute } from "@/app/api/v1/auth/me/route";
import { POST as signupRoute } from "@/app/api/v1/auth/signup/route";
import { POST as switchOrgRoute } from "@/app/api/v1/auth/switch-org/route";
import { getDb } from "@/server/db/client";
import {
  acceptInvitation,
  createAdditionalOrganization,
  createInvitation,
  login,
  logout,
  resolveSession,
  signup,
  switchOrganization,
} from "@/server/domains/auth";
import { revokeInvitation } from "@/server/domains/team";
import { sha256 } from "@/server/lib/crypto";
import { AppError } from "@/server/lib/errors";
import { apiRequest, call, count, makeOrg, schema, TEST_PASSWORD, uniqueEmail } from "../helpers";

const db = () => getDb();

async function expectAppError(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err, "expected an AppError").toBeInstanceOf(AppError);
  expect(err.status).toBe(status);
  if (code) expect(err.code).toBe(code);
  return err as AppError;
}

describe("signup", () => {
  it("creates user, organization, owner membership, agent settings, audit entry and a session", async () => {
    const email = uniqueEmail("signup");
    const r = await signup(db(), { name: "Ann", email, password: TEST_PASSWORD, organizationName: "Ann's Academy" }, { ip: "1.2.3.4" });
    expect(r.user.email).toBe(email);
    expect(r.user.passwordHash).not.toContain(TEST_PASSWORD);
    expect(r.org.slug).toMatch(/^ann-s-academy-[a-z0-9]+$/);
    const [m] = await db().select().from(schema.memberships).where(eq(schema.memberships.orgId, r.org.id));
    expect(m).toMatchObject({ userId: r.user.id, role: "owner" });
    const [settings] = await db().select().from(schema.agentSettings).where(eq(schema.agentSettings.orgId, r.org.id));
    expect(settings.agentName).toBe("Ann's Academy assistant");
    expect(settings.escalationKeywords).toContain("operator");
    expect(await count(db(), schema.auditLogs, and(eq(schema.auditLogs.orgId, r.org.id), eq(schema.auditLogs.action, "organization.created")))).toBe(1);
    const [s] = await db().select().from(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(r.token)));
    expect(s).toMatchObject({ userId: r.user.id, activeOrgId: r.org.id, ip: "1.2.3.4" });
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now() + 13 * 86400_000);
  });

  it("rejects a duplicate email (case-insensitive) with 409 and leaves no orphan org", async () => {
    const email = uniqueEmail("dup");
    await signup(db(), { name: "A", email, password: TEST_PASSWORD, organizationName: "First Org" }, {});
    const orgName = `Second Org ${email}`;
    await expectAppError(
      signup(db(), { name: "B", email: email.toUpperCase(), password: TEST_PASSWORD, organizationName: orgName }, {}),
      409,
      "conflict",
    );
    // Case-insensitive uniqueness at the DB level.
    await expect(
      db().insert(schema.users).values({ email: email.toUpperCase(), name: "x", passwordHash: "x" }),
    ).rejects.toThrow();
    expect(await count(db(), schema.organizations, eq(schema.organizations.name, orgName))).toBe(0);
  });

  it("signup API: 201 + session cookie, then /me works with it", async () => {
    const email = uniqueEmail("api");
    const res = await call(
      signupRoute,
      apiRequest("POST", "/api/v1/auth/signup", { body: { name: "Api", email, password: TEST_PASSWORD, organizationName: "Api Org" } }),
    );
    expect(res.status).toBe(201);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^ops_session=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+/);
    const token = decodeURIComponent(cookie.split(";")[0].split("=")[1]);
    const me = await call(meRoute, apiRequest("GET", "/api/v1/auth/me", { token }));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.role).toBe("owner");
    expect(me.body.organization.name).toBe("Api Org");
  });

  it("signup API: weak password → 400 with field details", async () => {
    const res = await call(
      signupRoute,
      apiRequest("POST", "/api/v1/auth/signup", { body: { name: "X", email: uniqueEmail(), password: "short", organizationName: "Org" } }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(res.body.error.details.password).toBeDefined();
  });
});

describe("login / sessions", () => {
  it("logs in with the right password and rejects a wrong one or unknown email", async () => {
    const o = await makeOrg();
    const r = await login(db(), { email: o.email, password: TEST_PASSWORD }, {});
    expect(r.user.id).toBe(o.user.id);
    const session = await resolveSession(db(), r.token);
    expect(session?.org?.id).toBe(o.org.id);
    const [u] = await db().select().from(schema.users).where(eq(schema.users.id, o.user.id));
    expect(u.lastLoginAt).not.toBeNull();
    const e1 = await expectAppError(login(db(), { email: o.email, password: "wrong-password-1" }, {}), 401);
    const e2 = await expectAppError(login(db(), { email: uniqueEmail("nobody"), password: TEST_PASSWORD }, {}), 401);
    expect(e1.message).toBe(e2.message); // no account enumeration
  });

  it("login API sets a cookie; bad password → 401", async () => {
    const o = await makeOrg();
    const ok = await call(loginRoute, apiRequest("POST", "/api/v1/auth/login", { body: { email: o.email.toUpperCase(), password: TEST_PASSWORD } }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain("ops_session=");
    const bad = await call(loginRoute, apiRequest("POST", "/api/v1/auth/login", { body: { email: o.email, password: "nope-nope-1" } }));
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("unauthorized");
  });

  it("resolves a session with user, org, role and memberships", async () => {
    const o = await makeOrg();
    const s = await resolveSession(db(), o.token);
    expect(s).toMatchObject({
      user: { id: o.user.id, email: o.email },
      org: { id: o.org.id, name: o.org.name, timezone: "Asia/Tashkent", currency: "UZS" },
      role: "owner",
      memberships: [{ orgId: o.org.id, role: "owner" }],
    });
    expect(await resolveSession(db(), null)).toBeNull();
    expect(await resolveSession(db(), "x".repeat(201))).toBeNull();
    expect(await resolveSession(db(), "not-a-real-token")).toBeNull();
  });

  it("logout invalidates the session (domain and API)", async () => {
    const o = await makeOrg();
    await logout(db(), o.token);
    expect(await resolveSession(db(), o.token)).toBeNull();

    const r = await login(db(), { email: o.email, password: TEST_PASSWORD }, {});
    const res = await call(logoutRoute, apiRequest("POST", "/api/v1/auth/logout", { token: r.token }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await resolveSession(db(), r.token)).toBeNull();
    const me = await call(meRoute, apiRequest("GET", "/api/v1/auth/me", { token: r.token }));
    expect(me.status).toBe(401);
  });

  it("an expired session does not resolve", async () => {
    const o = await makeOrg();
    await db().update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.sessions.tokenHash, sha256(o.token)));
    expect(await resolveSession(db(), o.token)).toBeNull();
  });

  it("falls back to another membership when the active org membership was revoked", async () => {
    const o = await makeOrg();
    const s1 = (await resolveSession(db(), o.token))!;
    const second = await createAdditionalOrganization(db(), s1, "Second Branch");
    // Now active = second; remove that membership.
    await db().delete(schema.memberships).where(and(eq(schema.memberships.orgId, second.id), eq(schema.memberships.userId, o.user.id)));
    const s2 = (await resolveSession(db(), o.token))!;
    expect(s2.org?.id).toBe(o.org.id);
  });
});

describe("switch organization", () => {
  it("switches only to organizations the user belongs to", async () => {
    const a = await makeOrg("A");
    const b = await makeOrg("B");
    const s = (await resolveSession(db(), a.token))!;
    const extra = await createAdditionalOrganization(db(), s, "A second");
    let now = (await resolveSession(db(), a.token))!;
    expect(now.org?.id).toBe(extra.id);
    expect(now.memberships.map((m) => m.orgId).sort()).toEqual([a.org.id, extra.id].sort());

    await switchOrganization(db(), now, a.org.id);
    now = (await resolveSession(db(), a.token))!;
    expect(now.org?.id).toBe(a.org.id);

    await expectAppError(switchOrganization(db(), now, b.org.id), 403);
    expect((await resolveSession(db(), a.token))!.org?.id).toBe(a.org.id);

    const api = await call(switchOrgRoute, apiRequest("POST", "/api/v1/auth/switch-org", { token: a.token, body: { orgId: b.org.id } }));
    expect(api.status).toBe(403);
    const apiOk = await call(switchOrgRoute, apiRequest("POST", "/api/v1/auth/switch-org", { token: a.token, body: { orgId: extra.id } }));
    expect(apiOk.status).toBe(200);
    expect((await resolveSession(db(), a.token))!.org?.id).toBe(extra.id);
  });
});

describe("invitations", () => {
  it("create → accept as a new user → membership with the invited role and a session", async () => {
    const o = await makeOrg();
    const email = uniqueEmail("invitee");
    const { invitation, token } = await createInvitation(db(), o.ctx, { email, role: "operator" });
    expect(invitation.tokenHash).toBe(sha256(token));
    const r = await acceptInvitation(db(), { token, name: "Olim", password: TEST_PASSWORD }, null, {});
    expect(r.orgId).toBe(o.org.id);
    const session = await resolveSession(db(), r.session!.token);
    expect(session).toMatchObject({ user: { email }, org: { id: o.org.id }, role: "operator" });
    const [inv] = await db().select().from(schema.invitations).where(eq(schema.invitations.id, invitation.id));
    expect(inv.acceptedAt).not.toBeNull();
    // Reuse is rejected.
    await expectAppError(acceptInvitation(db(), { token, name: "Again", password: TEST_PASSWORD }, null, {}), 404);
  });

  it("accept-invite API sets a session cookie", async () => {
    const o = await makeOrg();
    const email = uniqueEmail("viaapi");
    const { token } = await createInvitation(db(), o.ctx, { email, role: "viewer" });
    const res = await call(acceptInviteRoute, apiRequest("POST", "/api/v1/auth/accept-invite", { body: { token, name: "V", password: TEST_PASSWORD } }));
    expect(res.status).toBe(200);
    expect(res.body.organizationId).toBe(o.org.id);
    expect(res.headers.get("set-cookie")).toContain("ops_session=");
  });

  it("rejects revoked and expired invitations", async () => {
    const o = await makeOrg();
    const revoked = await createInvitation(db(), o.ctx, { email: uniqueEmail("rev"), role: "viewer" });
    await revokeInvitation(db(), o.ctx, revoked.invitation.id);
    await expectAppError(acceptInvitation(db(), { token: revoked.token, name: "R", password: TEST_PASSWORD }, null, {}), 404);

    const expired = await createInvitation(db(), o.ctx, { email: uniqueEmail("exp"), role: "viewer" });
    await db().update(schema.invitations).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(schema.invitations.id, expired.invitation.id));
    await expectAppError(acceptInvitation(db(), { token: expired.token, name: "E", password: TEST_PASSWORD }, null, {}), 404);
    expect(await count(db(), schema.memberships, eq(schema.memberships.orgId, o.org.id))).toBe(1);
  });

  it("a signed-in user can accept only an invitation addressed to their email", async () => {
    const inviter = await makeOrg("Inviter");
    const other = await makeOrg("Other");
    const otherSession = (await resolveSession(db(), other.token))!;

    const wrong = await createInvitation(db(), inviter.ctx, { email: uniqueEmail("someone-else"), role: "admin" });
    await expectAppError(acceptInvitation(db(), { token: wrong.token }, otherSession, {}), 403);
    expect(await count(db(), schema.memberships, and(eq(schema.memberships.orgId, inviter.org.id), eq(schema.memberships.userId, other.user.id)))).toBe(0);

    const right = await createInvitation(db(), inviter.ctx, { email: other.email.toUpperCase(), role: "admin" });
    const r = await acceptInvitation(db(), { token: right.token }, otherSession, {});
    expect(r.session).toBeNull();
    const s = (await resolveSession(db(), other.token))!;
    expect(s.org?.id).toBe(inviter.org.id);
    expect(s.role).toBe("admin");
    expect(s.memberships).toHaveLength(2);
  });

  it("anonymous accept requires name+password and refuses existing accounts", async () => {
    const o = await makeOrg();
    const fresh = await createInvitation(db(), o.ctx, { email: uniqueEmail("np"), role: "viewer" });
    await expectAppError(acceptInvitation(db(), { token: fresh.token }, null, {}), 400, "validation_error");

    const existing = await makeOrg("Existing");
    const inv = await createInvitation(db(), o.ctx, { email: existing.email, role: "viewer" });
    await expectAppError(acceptInvitation(db(), { token: inv.token, name: "X", password: TEST_PASSWORD }, null, {}), 409);
  });
});
