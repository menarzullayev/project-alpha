import { seedDemoData } from "@/server/domains/demo";
import { errors } from "@/server/lib/errors";
import { route } from "@/server/http/api";

export const maxDuration = 60;

export const POST = route({ permission: "org:manage", rateLimit: { key: "demo-data", limit: 3, windowSec: 3600 } }, async ({ db, tenant }) => {
  const r = await seedDemoData(db, tenant);
  if (r.skipped) throw errors.conflict("This workspace already has courses; demo data is only loaded into an empty workspace.");
  return r;
});
