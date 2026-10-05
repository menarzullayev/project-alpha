import { parseId } from "@/server/http/api";
import { rootRoute } from "@/server/http/root-api";
import { resetUserMfa } from "@/server/platform/users";

export const DELETE = rootRoute<{ id: string }>({ permission: "platform_roles:assign" }, async ({ db, root, params }) => {
  await resetUserMfa(db, root, parseId(params));
  return { ok: true };
});
