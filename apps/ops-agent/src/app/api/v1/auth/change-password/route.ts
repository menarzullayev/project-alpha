import { changePassword, changePasswordSchema } from "@/server/domains/auth";
import { route } from "@/server/http/api";

export const POST = route({ auth: "required", rateLimit: { key: "change-password", limit: 10, windowSec: 600 } }, async ({ db, session, body }) => {
  await changePassword(db, session!, await body(changePasswordSchema));
  return { ok: true };
});
