import { rootRoute } from "@/server/http/root-api";
import { getPlatformOverview } from "@/server/platform/overview";

export const GET = rootRoute({ permission: "platform:read" }, async ({ db }) => ({ overview: await getPlatformOverview(db) }));
