import { logout, SESSION_COOKIE } from "@/server/domains/auth";
import { clearSessionCookie, json, readCookie, route } from "@/server/http/api";

export const POST = route({ auth: "optional" }, async ({ db, req }) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await logout(db, token);
  return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
});
