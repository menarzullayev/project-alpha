import { revokeInvitation } from "@/server/domains/team";
import { parseId, route } from "@/server/http/api";

export const DELETE = route<{ id: string }>({ permission: "team:manage" }, async ({ db, tenant, params }) => {
  await revokeInvitation(db, tenant, parseId(params));
  return { ok: true };
});
