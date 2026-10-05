import { z } from "zod";
import { rootRoute } from "@/server/http/root-api";
import { listPlatformAudit } from "@/server/platform/audit";
import { toCsv } from "@/server/platform/reports";

const query = z.object({
  q: z.string().max(100).optional(),
  action: z.string().max(80).optional(),
  since: z.coerce.date().optional(),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export const GET = rootRoute({ permission: "audit:read" }, async ({ db, query: q }) => {
  const { format, ...opts } = q(query);
  const entries = await listPlatformAudit(db, opts);
  if (format === "csv") {
    const csv = toCsv(entries.map((e) => ({ created_at: e.createdAt, actor: e.actorEmail, action: e.action, target_type: e.targetType, target_id: e.targetId, ip: e.ip, metadata: e.metadata })));
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="platform-audit.csv"` } });
  }
  return { entries };
});
