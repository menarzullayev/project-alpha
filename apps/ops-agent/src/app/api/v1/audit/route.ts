import { z } from "zod";
import { listAudit } from "@/server/domains/audit";
import { route } from "@/server/http/api";

export const GET = route({ permission: "audit:read" }, async ({ db, tenant, query }) => {
  const q = query(z.object({ limit: z.coerce.number().int().min(1).max(500).optional(), before: z.coerce.date().optional() }));
  return { entries: await listAudit(db, tenant, q) };
});
