import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { GET as announcementsGet, POST as announcementsPost } from "@/app/api/root/announcements/route";
import { DELETE as announcementEnd } from "@/app/api/root/announcements/[id]/route";
import { GET as auditGet } from "@/app/api/root/audit/route";
import { POST as mfaEnable } from "@/app/api/root/mfa/enable/route";
import { POST as mfaSetup } from "@/app/api/root/mfa/setup/route";
import { POST as mfaVerify } from "@/app/api/root/mfa/verify/route";
import { GET as orgGet, PATCH as orgPatch } from "@/app/api/root/organizations/[id]/route";
import { POST as orgStatus } from "@/app/api/root/organizations/[id]/status/route";
import { GET as orgsList } from "@/app/api/root/organizations/route";
import { GET as overviewGet } from "@/app/api/root/overview/route";
import { GET as reportsGet } from "@/app/api/root/reports/route";
import { GET as settingsGet, PATCH as settingsPatch } from "@/app/api/root/settings/route";
import { POST as membershipAdd } from "@/app/api/root/users/[id]/memberships/route";
import { DELETE as membershipRemove } from "@/app/api/root/users/[id]/memberships/[orgId]/route";
import { DELETE as userMfaReset } from "@/app/api/root/users/[id]/mfa/route";
import { POST as passwordReset } from "@/app/api/root/users/[id]/password-reset/route";
import { GET as userGet, PATCH as userPatch } from "@/app/api/root/users/[id]/route";
import { DELETE as sessionsDelete } from "@/app/api/root/users/[id]/sessions/route";
import { POST as userStatus } from "@/app/api/root/users/[id]/status/route";
import { GET as usersList, POST as usersPost } from "@/app/api/root/users/route";
import { POST as changePasswordRoute } from "@/app/api/v1/auth/change-password/route";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { POST as signupRoute } from "@/app/api/v1/auth/signup/route";
import { GET as leadsList } from "@/app/api/v1/leads/route";
import { POST as webhook } from "@/app/api/telegram/webhook/[id]/route";
import { getDb } from "@/server/db/client";
import { createSandboxIntegration } from "@/server/domains/integrations";
import { decryptSecret } from "@/server/lib/crypto";
import { totpCode } from "@/server/lib/totp";
import { activeAnnouncementsFor } from "@/server/platform/announcements";
import type { PlatformRole } from "@/server/platform/rbac";
import { DEFAULT_SETTINGS, updatePlatformSettings } from "@/server/platform/settings";
import { apiRequest, call, count, makeMember, makeOrg, schema, TEST_PASSWORD, tgUpdate, uniqueEmail } from "../helpers";

const db = getDb();

afterAll(async () => {
  await updatePlatformSettings(db, DEFAULT_SETTINGS, null);
});

async function login(email: string, password = TEST_PASSWORD) {
  return call(loginRoute, apiRequest("POST", "/api/v1/auth/login", { body: { email, password } }));
}

function tokenOf(res: { headers: Headers }) {
  const m = /ops_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

/** A user with a platform role. With `mfa`, enrolls TOTP through the real API and returns the secret. */
async function makeOperator(role: PlatformRole, opts: { mfa?: boolean } = { mfa: true }) {
  const o = await makeOrg("Operator Home");
  await db.update(schema.users).set({ platformRole: role }).where(eq(schema.users.id, o.user.id));
  let secret: string | null = null;
  if (opts.mfa !== false) {
    const setup = await call(mfaSetup, apiRequest("POST", "/api/root/mfa/setup", { token: o.token }));
    expect(setup.status).toBe(200);
    secret = setup.body.secret as string;
    expect(setup.body.qrSvg).toContain("<svg");
    const en = await call(mfaEnable, apiRequest("POST", "/api/root/mfa/enable", { token: o.token, body: { code: totpCode(secret) } }));
    expect(en.status).toBe(200);
  }
  return { ...o, secret, id: o.user.id };
}

const get = (h: any, path: string, token: string, params: Record<string, string> = {}) => call(h, apiRequest("GET", path, { token }), params);
const send = (h: any, method: string, path: string, token: string, body?: unknown, params: Record<string, string> = {}) =>
  call(h, apiRequest(method, path, { token, body }), params);

async function auditCount(action: string, targetId: string) {
  return count(db, schema.platformAuditLogs, and(eq(schema.platformAuditLogs.action, action), eq(schema.platformAuditLogs.targetId, targetId)));
}

describe("root access control", () => {
  it("rejects anonymous callers and customers without a platform role", async () => {
    expect((await call(overviewGet, apiRequest("GET", "/api/root/overview"))).status).toBe(401);
    const customer = await makeOrg();
    const res = await get(overviewGet, "/api/root/overview", customer.token);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
    // Customers cannot even start MFA enrollment.
    expect((await send(mfaSetup, "POST", "/api/root/mfa/setup", customer.token)).status).toBe(403);
  });

  it("requires TOTP enrollment, then a fresh TOTP challenge on every new session", async () => {
    const op = await makeOperator("support", { mfa: false });
    const first = await get(overviewGet, "/api/root/overview", op.token);
    expect(first.status).toBe(403);
    expect(first.body.error.code).toBe("mfa_setup_required");

    const setup = await send(mfaSetup, "POST", "/api/root/mfa/setup", op.token);
    const secret = setup.body.secret as string;
    const [stored] = await db.select().from(schema.users).where(eq(schema.users.id, op.id));
    expect(stored.totpSecretEncrypted).not.toContain(secret); // encrypted at rest
    expect(decryptSecret(stored.totpSecretEncrypted!)).toBe(secret);

    expect((await send(mfaEnable, "POST", "/api/root/mfa/enable", op.token, { code: "000000" })).status).toBe(400);
    expect((await send(mfaEnable, "POST", "/api/root/mfa/enable", op.token, { code: totpCode(secret) })).status).toBe(200);
    expect((await get(overviewGet, "/api/root/overview", op.token)).status).toBe(200);
    // Enrollment cannot be silently replaced once active.
    expect((await send(mfaSetup, "POST", "/api/root/mfa/setup", op.token)).status).toBe(409);

    const second = tokenOf(await login(op.email))!;
    const r2 = await get(overviewGet, "/api/root/overview", second);
    expect(r2.body.error.code).toBe("mfa_required");
    expect((await send(mfaVerify, "POST", "/api/root/mfa/verify", second, { code: "123456" })).status).toBe(400);
    expect(await auditCount("mfa.challenge_failed", op.id)).toBe(1);
    expect((await send(mfaVerify, "POST", "/api/root/mfa/verify", second, { code: totpCode(secret) })).status).toBe(200);
    expect((await get(overviewGet, "/api/root/overview", second)).status).toBe(200);
  });

  it("support is read-only", async () => {
    const support = await makeOperator("support");
    const target = await makeOrg();
    expect((await get(usersList, "/api/root/users", support.token)).status).toBe(200);
    expect((await get(orgsList, "/api/root/organizations", support.token)).status).toBe(200);
    expect((await get(settingsGet, "/api/root/settings", support.token)).status).toBe(200);
    const writes = await Promise.all([
      send(usersPost, "POST", "/api/root/users", support.token, { email: uniqueEmail(), name: "New Person" }),
      send(userStatus, "POST", `/api/root/users/${target.user.id}/status`, support.token, { status: "suspended", reason: "spam" }, { id: target.user.id }),
      send(orgPatch, "PATCH", `/api/root/organizations/${target.org.id}`, support.token, { plan: "pro" }, { id: target.org.id }),
      send(orgStatus, "POST", `/api/root/organizations/${target.org.id}/status`, support.token, { status: "suspended", reason: "spam" }, { id: target.org.id }),
      send(settingsPatch, "PATCH", "/api/root/settings", support.token, { signupEnabled: false }),
      send(announcementsPost, "POST", "/api/root/announcements", support.token, { title: "Hello all" }),
      get(auditGet, "/api/root/audit", support.token),
    ]);
    for (const r of writes) expect(r.status).toBe(403);
    expect((await call(reportsGet, apiRequest("GET", "/api/root/reports?type=audit", { token: support.token }))).status).toBe(403);
  });

  it("rejects mutations without a same-origin Origin header", async () => {
    const admin = await makeOperator("admin");
    const res = await call(usersPost, apiRequest("POST", "/api/root/users", { token: admin.token, origin: "https://evil.example", body: { email: uniqueEmail(), name: "X Y" } }));
    expect(res.status).toBe(403);
  });
});

describe("user management", () => {
  it("creates a user with a one-time password that must be changed before use", async () => {
    const admin = await makeOperator("admin");
    const home = await makeOrg();
    const email = uniqueEmail("created");
    const created = await send(usersPost, "POST", "/api/root/users", admin.token, { email, name: "Created User", organizationId: home.org.id, organizationRole: "operator" });
    expect(created.status).toBe(201);
    const temp = created.body.temporaryPassword as string;
    expect(temp.length).toBeGreaterThanOrEqual(14);
    expect(await auditCount("user.created", created.body.user.id)).toBe(1);

    const loginRes = await login(email, temp);
    expect(loginRes.status).toBe(200);
    const token = tokenOf(loginRes)!;
    const blocked = await get(leadsList, "/api/v1/leads", token);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("password_change_required");

    expect((await send(changePasswordRoute, "POST", "/api/v1/auth/change-password", token, { currentPassword: "wrong-password-1", newPassword: "brand-new-pass-77" })).status).toBe(400);
    expect((await send(changePasswordRoute, "POST", "/api/v1/auth/change-password", token, { currentPassword: temp, newPassword: "brand-new-pass-77" })).status).toBe(200);
    expect((await get(leadsList, "/api/v1/leads", token)).status).toBe(200);
    expect((await login(email, temp)).status).toBe(401);
    expect((await login(email, "brand-new-pass-77")).status).toBe(200);
  });

  it("only a superadmin assigns platform roles; nobody changes their own", async () => {
    const admin = await makeOperator("admin");
    const sup = await makeOperator("superadmin");
    const target = await makeOrg();
    const p = { id: target.user.id };
    expect((await send(usersPost, "POST", "/api/root/users", admin.token, { email: uniqueEmail(), name: "Wannabe", platformRole: "support" })).status).toBe(403);
    expect((await send(userPatch, "PATCH", "/x", admin.token, { platformRole: "admin" }, p)).status).toBe(403);
    expect((await send(userPatch, "PATCH", "/x", sup.token, { platformRole: "support" }, p)).status).toBe(200);
    expect(await auditCount("user.platform_role_changed", target.user.id)).toBe(1);
    expect((await send(userPatch, "PATCH", "/x", sup.token, { platformRole: null }, { id: sup.id })).status).toBe(403);
  });

  it("admins cannot manage platform-operator accounts (no lateral or upward moves)", async () => {
    const admin = await makeOperator("admin");
    const otherAdmin = await makeOperator("admin");
    const sup = await makeOperator("superadmin");
    for (const victim of [otherAdmin, sup]) {
      const p = { id: victim.id };
      expect((await send(userPatch, "PATCH", "/x", admin.token, { email: uniqueEmail("hijack") }, p)).status).toBe(403);
      expect((await send(userStatus, "POST", "/x", admin.token, { status: "suspended", reason: "takeover" }, p)).status).toBe(403);
      expect((await send(passwordReset, "POST", "/x", admin.token, {}, p)).status).toBe(403);
      expect((await send(sessionsDelete, "DELETE", "/x", admin.token, undefined, p)).status).toBe(403);
      expect((await send(userMfaReset, "DELETE", "/x", admin.token, undefined, p)).status).toBe(403);
    }
  });

  it("suspending a user revokes sessions and blocks sign-in until reactivated", async () => {
    const admin = await makeOperator("admin");
    const victim = await makeOrg();
    const p = { id: victim.user.id };
    expect((await send(userStatus, "POST", "/x", admin.token, { status: "suspended", reason: "Abuse report #42" }, p)).status).toBe(200);
    expect(await count(db, schema.sessions, eq(schema.sessions.userId, victim.user.id))).toBe(0);
    expect((await get(leadsList, "/api/v1/leads", victim.token)).status).toBe(401);
    const denied = await login(victim.email);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("account_suspended");
    const detail = await get(userGet, "/x", admin.token, p);
    expect(detail.body.user.status).toBe("suspended");
    expect(detail.body.user.suspendedReason).toBe("Abuse report #42");
    expect(detail.body.user.passwordHash).toBeUndefined();
    expect(detail.body.user.totpSecretEncrypted).toBeUndefined();

    expect((await send(userStatus, "POST", "/x", admin.token, { status: "active" }, p)).status).toBe(200);
    expect((await login(victim.email)).status).toBe(200);
    expect(await auditCount("user.suspended", victim.user.id)).toBe(1);
    expect(await auditCount("user.reactivated", victim.user.id)).toBe(1);
    // Nobody can suspend themselves.
    expect((await send(userStatus, "POST", "/x", admin.token, { status: "suspended", reason: "oops!" }, { id: admin.id })).status).toBe(403);
  });

  it("password reset issues a new temporary password and signs the user out", async () => {
    const admin = await makeOperator("admin");
    const victim = await makeOrg();
    const res = await send(passwordReset, "POST", "/x", admin.token, {}, { id: victim.user.id });
    expect(res.status).toBe(200);
    expect((await get(leadsList, "/api/v1/leads", victim.token)).status).toBe(401);
    expect((await login(victim.email)).status).toBe(401);
    expect((await login(victim.email, res.body.temporaryPassword)).status).toBe(200);
  });

  it("superadmin can reset another operator's 2FA", async () => {
    const sup = await makeOperator("superadmin");
    const support = await makeOperator("support");
    expect((await send(userMfaReset, "DELETE", "/x", sup.token, undefined, { id: support.id })).status).toBe(200);
    expect((await get(overviewGet, "/api/root/overview", support.token)).body.error.code).toBe("mfa_setup_required");
  });

  it("manages workspace memberships and keeps at least one owner", async () => {
    const admin = await makeOperator("admin");
    const org = await makeOrg();
    const other = await makeOrg();
    const p = { id: other.user.id };
    expect((await send(membershipAdd, "POST", "/x", admin.token, { organizationId: org.org.id, role: "viewer" }, p)).status).toBe(200);
    expect(await count(db, schema.memberships, and(eq(schema.memberships.orgId, org.org.id), eq(schema.memberships.userId, other.user.id)))).toBe(1);
    expect((await send(membershipRemove, "DELETE", "/x", admin.token, undefined, { id: other.user.id, orgId: org.org.id })).status).toBe(200);
    const last = await send(membershipRemove, "DELETE", "/x", admin.token, undefined, { id: org.user.id, orgId: org.org.id });
    expect(last.status).toBe(409);
  });
});

describe("organizations", () => {
  it("changes plans and suspends a workspace (dashboard API + Telegram agent stop)", async () => {
    const admin = await makeOperator("admin");
    const org = await makeOrg();
    const operator = await makeMember(org, "operator");
    const integration = (await createSandboxIntegration(db, org.ctx))!;
    const p = { id: org.org.id };

    const plan = await send(orgPatch, "PATCH", "/x", admin.token, { plan: "pro" }, p);
    expect(plan.status).toBe(200);
    expect(await auditCount("organization.plan_changed", org.org.id)).toBe(1);

    expect((await send(orgStatus, "POST", "/x", admin.token, { status: "suspended", reason: "Unpaid invoice" }, p)).status).toBe(200);
    for (const token of [org.token, operator.token]) {
      const r = await get(leadsList, "/api/v1/leads", token);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe("organization_suspended");
    }
    const update = tgUpdate({ text: "Salom" });
    const hook = await call(
      webhook,
      new Request(`http://localhost:3000/api/telegram/webhook/${integration.id}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": integration.webhookSecret! },
        body: JSON.stringify(update),
      }),
      { id: integration.id },
    );
    expect(hook.status).toBe(200);
    expect(hook.body.status).toBe("ignored");
    expect(await count(db, schema.messages, eq(schema.messages.orgId, org.org.id))).toBe(0);

    const detail = await get(orgGet, "/x", admin.token, p);
    expect(detail.body.organization.status).toBe("suspended");
    expect(detail.body.members).toHaveLength(2);

    expect((await send(orgStatus, "POST", "/x", admin.token, { status: "active" }, p)).status).toBe(200);
    expect((await get(leadsList, "/api/v1/leads", operator.token)).status).toBe(200);
  });
});

describe("settings, announcements, audit and reports", () => {
  it("only a superadmin changes settings; changes take effect and are audited", async () => {
    const admin = await makeOperator("admin");
    const sup = await makeOperator("superadmin");
    expect((await send(settingsPatch, "PATCH", "/api/root/settings", admin.token, { signupEnabled: false })).status).toBe(403);
    expect((await send(settingsPatch, "PATCH", "/api/root/settings", sup.token, { maxOrganizationsPerUser: 0 })).status).toBe(400);
    const res = await send(settingsPatch, "PATCH", "/api/root/settings", sup.token, { signupEnabled: false, maintenanceMessage: "Upgrade tonight" });
    expect(res.status).toBe(200);
    expect(res.body.settings.signupEnabled).toBe(false);
    try {
      const signup = await call(signupRoute, apiRequest("POST", "/api/v1/auth/signup", { body: { name: "New Owner", email: uniqueEmail(), password: TEST_PASSWORD, organizationName: "Blocked Centre" } }));
      expect(signup.status).toBe(403);
      const [row] = await db
        .select()
        .from(schema.platformAuditLogs)
        .where(and(eq(schema.platformAuditLogs.action, "settings.updated"), eq(schema.platformAuditLogs.actorUserId, sup.id)));
      expect(row.metadata).toMatchObject({ signupEnabled: { from: true, to: false } });
    } finally {
      await send(settingsPatch, "PATCH", "/api/root/settings", sup.token, { signupEnabled: true, maintenanceMessage: "" });
    }
  });

  it("publishes announcements to the right audience and ends them", async () => {
    const admin = await makeOperator("admin");
    const owners = await send(announcementsPost, "POST", "/api/root/announcements", admin.token, { title: `Owners only ${Date.now()}`, audience: "owners", severity: "warning" });
    expect(owners.status).toBe(201);
    const id = owners.body.announcement.id;
    expect((await activeAnnouncementsFor(db, "owner")).some((a) => a.id === id)).toBe(true);
    expect((await activeAnnouncementsFor(db, "viewer")).some((a) => a.id === id)).toBe(false);
    const future = await send(announcementsPost, "POST", "/api/root/announcements", admin.token, { title: "Later", startsAt: new Date(Date.now() + 86400_000).toISOString() });
    expect((await activeAnnouncementsFor(db, "owner")).some((a) => a.id === future.body.announcement.id)).toBe(false);
    expect((await send(announcementsPost, "POST", "/api/root/announcements", admin.token, { title: "Bad", startsAt: new Date().toISOString(), endsAt: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);

    expect((await send(announcementEnd, "DELETE", "/x", admin.token, undefined, { id })).status).toBe(200);
    expect((await activeAnnouncementsFor(db, "owner")).some((a) => a.id === id)).toBe(false);
    expect((await get(announcementsGet, "/api/root/announcements", admin.token)).body.announcements.some((a: { id: string }) => a.id === id)).toBe(true);
    await send(announcementEnd, "DELETE", "/x", admin.token, undefined, { id: future.body.announcement.id });
  });

  it("exports CSV reports and the audit trail, auditing each export", async () => {
    const admin = await makeOperator("admin");
    const org = await makeOrg("Reported Centre");
    for (const type of ["organizations", "users", "growth", "audit"]) {
      const res = await call(reportsGet, apiRequest("GET", `/api/root/reports?type=${type}&days=7`, { token: admin.token }));
      expect(res.status, type).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.csv"/);
      expect(await auditCount("report.exported", type)).toBeGreaterThanOrEqual(1);
    }
    const orgs = await call(reportsGet, apiRequest("GET", "/api/root/reports?type=organizations", { token: admin.token }));
    expect(orgs.body.split("\n")[0]).toBe("id,name,slug,plan,status,created_at,members,leads,bookings,messages,ai_replies");
    expect(orgs.body).toContain(org.org.id);
    expect((await call(reportsGet, apiRequest("GET", "/api/root/reports?type=bogus", { token: admin.token }))).status).toBe(400);

    const audit = await call(auditGet, apiRequest("GET", `/api/root/audit?format=csv&q=${encodeURIComponent(admin.email)}`, { token: admin.token }));
    expect(audit.status).toBe(200);
    expect(audit.body.split("\n")[0]).toBe("created_at,actor,action,target_type,target_id,ip,metadata");
    expect(audit.body).toContain("report.exported");
    const json = await get(auditGet, "/api/root/audit?action=report.exported", admin.token);
    expect(json.body.entries.every((e: { action: string }) => e.action === "report.exported")).toBe(true);
  });

  it("overview aggregates platform metrics", async () => {
    const sup = await makeOperator("superadmin");
    const res = await get(overviewGet, "/api/root/overview", sup.token);
    expect(res.status).toBe(200);
    const o = res.body.overview;
    expect(o.organizations.total).toBeGreaterThan(0);
    expect(o.users.operators).toBeGreaterThan(0);
    expect(o.activity.automationRate30d).toBeGreaterThanOrEqual(0);
    expect(o.activity.automationRate30d).toBeLessThanOrEqual(1);
    expect(o.growth.length).toBeGreaterThanOrEqual(30);
  });
});
