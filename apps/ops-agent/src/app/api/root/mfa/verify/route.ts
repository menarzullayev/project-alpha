import { z } from "zod";
import { rootRoute } from "@/server/http/root-api";
import { verifyMfa } from "@/server/platform/mfa";

export const POST = rootRoute({ permission: "platform:read", mfa: "skip", rateLimit: { limit: 10, windowSec: 600 } }, async ({ db, root, body }) => {
  const { code } = await body(z.object({ code: z.string().trim().min(6).max(8) }));
  await verifyMfa(db, root, root.sessionId, code);
  return { ok: true };
});
