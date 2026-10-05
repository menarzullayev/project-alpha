import { rootRoute } from "@/server/http/root-api";
import { listOrganizations, orgListQuery } from "@/server/platform/organizations";

export const GET = rootRoute({ permission: "orgs:read" }, async ({ db, query }) => listOrganizations(db, query(orgListQuery)));
