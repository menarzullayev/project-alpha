import "server-only";
import { notFound, redirect } from "next/navigation";
import { getDb } from "../db/client";
import type { SessionInfo } from "../domains/auth";
import type { RootContext } from "../platform/context";
import { canPlatform, type PlatformPermission } from "../platform/rbac";
import { getPlatformSettings } from "../platform/settings";
import { getPageSession } from "./page-auth";
import { mfaState } from "./root-api";

/**
 * Server-component guard for /root pages. Non-operators get a 404 so the
 * panel's existence is not advertised.
 */
export async function requireRoot(
  permission: PlatformPermission = "platform:read",
  opts: { allowMfaPending?: boolean } = {},
): Promise<{ session: SessionInfo; root: RootContext }> {
  const session = await getPageSession();
  if (!session) redirect("/login?next=/root");
  const role = session.user.platformRole;
  if (!role) notFound();
  if (session.user.mustChangePassword) redirect("/account/password");
  if (!opts.allowMfaPending) {
    const state = mfaState(session, await getPlatformSettings(getDb()));
    if (state === "setup_required") redirect("/root/mfa/setup");
    if (state === "verify_required") redirect("/root/mfa");
  }
  if (!canPlatform(role, permission)) redirect("/root?denied=1");
  return { session, root: { userId: session.user.id, email: session.user.email, role, sessionId: session.sessionId } };
}
