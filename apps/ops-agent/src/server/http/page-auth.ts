import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db/client";
import { resolveSession, SESSION_COOKIE, type SessionInfo } from "../domains/auth";
import { can, type Permission } from "../rbac";
import type { TenantContext } from "../tenancy";

export async function getPageSession(): Promise<SessionInfo | null> {
  const store = await cookies();
  return resolveSession(getDb(), store.get(SESSION_COOKIE)?.value);
}

/** For server components: redirects to /login, or to /dashboard when the role lacks the permission. */
export async function requirePage(permission: Permission = "dashboard:read"): Promise<{ session: SessionInfo; tenant: TenantContext }> {
  const session = await getPageSession();
  if (!session) redirect("/login");
  if (!session.org || !session.role) redirect("/onboarding");
  if (!can(session.role, permission)) redirect("/dashboard?denied=1");
  return {
    session,
    tenant: { orgId: session.org.id, userId: session.user.id, role: session.role, actorType: "user" },
  };
}
