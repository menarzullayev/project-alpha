import { signup, signupSchema } from "@/server/domains/auth";
import { env } from "@/server/env";
import { errors } from "@/server/lib/errors";
import { json, route, sessionCookie } from "@/server/http/api";
import { enforceRateLimit } from "@/server/lib/rate-limit";
import { getSetting } from "@/server/platform/settings";

export const POST = route({}, async ({ db, body, ip, req }) => {
  if (!env().SIGNUP_ENABLED || !(await getSetting(db, "signupEnabled"))) throw errors.forbidden("Sign-up is disabled on this deployment");
  await enforceRateLimit(db, `signup:${ip ?? "unknown"}`, env().SIGNUP_RATE_LIMIT, 3600);
  const input = await body(signupSchema);
  const r = await signup(db, input, { ip, userAgent: req.headers.get("user-agent") });
  return json(
    { user: { id: r.user.id, email: r.user.email, name: r.user.name }, organization: { id: r.org.id, name: r.org.name } },
    { status: 201, headers: { "set-cookie": sessionCookie(r.token, r.expiresAt) } },
  );
});
