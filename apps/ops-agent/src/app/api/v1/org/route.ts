import { orgUpdateSchema, updateOrganization } from "@/server/domains/team";
import { route } from "@/server/http/api";

export const PATCH = route({ permission: "org:manage" }, async ({ db, tenant, body }) => {
  return { organization: await updateOrganization(db, tenant, await body(orgUpdateSchema)) };
});
