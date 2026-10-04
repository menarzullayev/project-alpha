import { acceptInvitation, acceptInviteSchema } from "@/server/domains/auth";
import { json, route, sessionCookie } from "@/server/http/api";

export const POST = route(
  { auth: "optional", rateLimit: { key: "accept-invite", limit: 20, windowSec: 3600 } },
  async ({ db, body, session, ip, req }) => {
    const input = await body(acceptInviteSchema);
    const r = await acceptInvitation(db, input, session, { ip, userAgent: req.headers.get("user-agent") });
    const headers: Record<string, string> = {};
    if (r.session) headers["set-cookie"] = sessionCookie(r.session.token, r.session.expiresAt);
    return json({ organizationId: r.orgId }, { headers });
  },
);
