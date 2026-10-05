import { z } from "zod";
import { rootRoute } from "@/server/http/root-api";
import { recordPlatformAudit } from "@/server/platform/audit";
import { buildReport, REPORT_TYPES, toCsv } from "@/server/platform/reports";
import { canPlatform } from "@/server/platform/rbac";
import { errors } from "@/server/lib/errors";

const query = z.object({ type: z.enum(REPORT_TYPES), days: z.coerce.number().int().min(1).max(365).default(30) });

export const GET = rootRoute({ permission: "reports:read", rateLimit: { limit: 30, windowSec: 60 } }, async ({ db, root, query: q }) => {
  const { type, days } = q(query);
  if (type === "audit" && !canPlatform(root.role, "audit:read")) throw errors.forbidden();
  const report = await buildReport(db, type, days);
  await recordPlatformAudit(db, root, { action: "report.exported", targetType: "report", targetId: type, metadata: { days, rows: report.rows.length } });
  return new Response(toCsv(report.rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${report.filename}"` },
  });
});
