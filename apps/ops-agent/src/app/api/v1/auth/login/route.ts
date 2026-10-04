import { login, loginSchema } from "@/server/domains/auth";
import { json, route, sessionCookie } from "@/server/http/api";
import { enforceRateLimit } from "@/server/lib/rate-limit";

export const POST = route({ rateLimit: { key: "login-ip", limit: 20, windowSec: 600 } }, async ({ db, body, ip, req }) => {
  const input = await body(loginSchema);
  // Per-account limit slows credential stuffing against a single email.
  await enforceRateLimit(db, `login-email:${input.email}`, 10, 600);
  const r = await login(db, input, { ip, userAgent: req.headers.get("user-agent") });
  return json({ user: { id: r.user.id, email: r.user.email, name: r.user.name } }, { headers: { "set-cookie": sessionCookie(r.token, r.expiresAt) } });
});
