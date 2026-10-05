import { parseId } from "@/server/http/api";
import { rootRoute } from "@/server/http/root-api";
import { getOrganizationDetail, updateOrganizationAsRoot, updateOrgSchema } from "@/server/platform/organizations";

export const GET = rootRoute<{ id: string }>({ permission: "orgs:read" }, async ({ db, params }) => getOrganizationDetail(db, parseId(params)));

export const PATCH = rootRoute<{ id: string }>({ permission: "orgs:write" }, async ({ db, root, params, body }) => ({
  organization: await updateOrganizationAsRoot(db, root, parseId(params), await body(updateOrgSchema)),
}));
