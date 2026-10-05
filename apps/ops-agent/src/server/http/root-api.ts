import type { SessionInfo } from "../domains/auth";
import { AppError, errors } from "../lib/errors";
import { enforceRateLimit } from "../lib/rate-limit";
import type { RootContext } from "../platform/context";
import { canPlatform, type PlatformPermission } from "../platform/rbac";
import { getPlatformSettings } from "../platform/settings";
import { type ApiContext, route } from "./api";

export type MfaState = "ok" | "setup_required" | "verify_required";

/** Whether this session may use the root panel right now, given MFA policy. */
export function mfaState(session: SessionInfo, settings: { rootMfaRequired: boolean; rootSessionMfaHours: number }): MfaState {
  if (!settings.rootMfaRequired) return "ok";
  if (!session.user.totpEnabled) return "setup_required";
  const verified = session.mfaVerifiedAt?.getTime() ?? 0;
  return Date.now() - verified < settings.rootSessionMfaHours * 3600_000 ? "ok" : "verify_required";
}

type RootHandler<P> = (ctx: ApiContext<P> & { root: RootContext }) => Promise<Response | unknown>;

/**
 * Root-panel API route: signed-in user with a platform role holding the
 * permission, active account, and (by default) a fresh TOTP verification.
 */
export function rootRoute<P = Record<string, string>>(
  opts: { permission: PlatformPermission; mfa?: "required" | "skip"; rateLimit?: { limit: number; windowSec: number } },
  handler: RootHandler<P>,
) {
  return route<P>({ auth: "required" }, async (ctx) => {
    const session = ctx.session!;
    const role = session.user.platformRole;
    if (!role) throw errors.forbidden("Platform operators only");
    if (session.user.mustChangePassword) throw new AppError("password_change_required", "Change your temporary password first", 403);
    if (opts.mfa !== "skip") {
      const state = mfaState(session, await getPlatformSettings(ctx.db));
      if (state === "setup_required") throw new AppError("mfa_setup_required", "Set up two-factor authentication to use the root panel", 403);
      if (state === "verify_required") throw new AppError("mfa_required", "Two-factor verification required", 403);
    }
    if (!canPlatform(role, opts.permission)) throw errors.forbidden();
    const rl = opts.rateLimit ?? { limit: 300, windowSec: 60 };
    await enforceRateLimit(ctx.db, `root:${opts.mfa === "skip" ? "mfa" : "api"}:${session.user.id}`, rl.limit, rl.windowSec);
    const root: RootContext = {
      userId: session.user.id,
      email: session.user.email,
      role,
      sessionId: session.sessionId,
      ip: ctx.ip,
      userAgent: ctx.req.headers.get("user-agent"),
    };
    return handler({ ...ctx, root });
  });
}
