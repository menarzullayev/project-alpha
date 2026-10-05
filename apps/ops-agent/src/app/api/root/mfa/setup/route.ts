import { rootRoute } from "@/server/http/root-api";
import { startMfaSetup } from "@/server/platform/mfa";

export const POST = rootRoute({ permission: "platform:read", mfa: "skip", rateLimit: { limit: 10, windowSec: 600 } }, async ({ db, root }) =>
  startMfaSetup(db, root),
);
