import { parseId } from "@/server/http/api";
import { rootRoute } from "@/server/http/root-api";
import { resetUserPassword } from "@/server/platform/users";

export const POST = rootRoute<{ id: string }>({ permission: "users:write", rateLimit: { limit: 20, windowSec: 600 } }, async ({ db, root, params }) =>
  resetUserPassword(db, root, parseId(params)),
);
