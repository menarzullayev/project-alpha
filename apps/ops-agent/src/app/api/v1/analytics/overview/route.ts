import { getOverview } from "@/server/domains/analytics";
import { route } from "@/server/http/api";

export const GET = route({ permission: "dashboard:read" }, async ({ db, tenant, session }) => ({
  overview: await getOverview(db, tenant, session!.org!.timezone),
}));
