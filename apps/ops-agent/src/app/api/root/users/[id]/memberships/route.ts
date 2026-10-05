import { parseId } from "@/server/http/api";
import { rootRoute } from "@/server/http/root-api";
import { membershipSchema, setMembership } from "@/server/platform/users";

export const POST = rootRoute<{ id: string }>({ permission: "users:write" }, async ({ db, root, params, body }) => {
  await setMembership(db, root, parseId(params), await body(membershipSchema));
  return { ok: true };
});
