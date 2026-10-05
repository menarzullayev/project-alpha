import { changeMemberRole, changeRoleSchema, removeMember } from "@/server/domains/team";
import { errors } from "@/server/lib/errors";
import { parseId, route } from "@/server/http/api";
import { can } from "@/server/rbac";

export const PATCH = route<{ id: string }>({ permission: "team:manage" }, async ({ db, tenant, params, body }) => {
  await changeMemberRole(db, tenant, parseId(params), (await body(changeRoleSchema)).role);
  return { ok: true };
});

/** Admins remove others; any member may leave (remove themselves). */
export const DELETE = route<{ id: string }>({ permission: "team:read" }, async ({ db, tenant, params }) => {
  const userId = parseId(params);
  if (userId !== tenant.userId && !can(tenant.role, "team:manage")) throw errors.forbidden();
  await removeMember(db, tenant, userId);
  return { ok: true };
});
