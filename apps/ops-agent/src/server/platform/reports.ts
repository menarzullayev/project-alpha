import { sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { listPlatformAudit } from "./audit";

export const REPORT_TYPES = ["organizations", "users", "growth", "audit"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
}

export async function buildReport(db: DbOrTx, type: ReportType, days = 30): Promise<{ filename: string; rows: Record<string, unknown>[] }> {
  const stamp = new Date().toISOString().slice(0, 10);
  switch (type) {
    case "organizations": {
      const rows = await db.execute<Record<string, unknown>>(sql`
        select o.id, o.name, o.slug, o.plan, o.status, o.created_at,
          (select count(*) from ops_agent.memberships m where m.org_id = o.id) as members,
          (select count(*) from ops_agent.leads l where l.org_id = o.id and l.created_at > now() - make_interval(days => ${days})) as leads,
          (select count(*) from ops_agent.bookings b where b.org_id = o.id and b.created_at > now() - make_interval(days => ${days})) as bookings,
          (select count(*) from ops_agent.messages x where x.org_id = o.id and x.created_at > now() - make_interval(days => ${days})) as messages,
          (select count(*) from ops_agent.messages x where x.org_id = o.id and x.sender_type = 'agent' and x.created_at > now() - make_interval(days => ${days})) as ai_replies
        from ops_agent.organizations o order by o.created_at`);
      return { filename: `organizations-${stamp}.csv`, rows: [...rows] };
    }
    case "users": {
      const rows = await db.execute<Record<string, unknown>>(sql`
        select u.id, u.email, u.name, u.platform_role, u.status, u.created_at, u.last_login_at,
          (u.totp_enabled_at is not null) as mfa_enabled,
          (select count(*) from ops_agent.memberships m where m.user_id = u.id) as workspaces
        from ops_agent.users u order by u.created_at`);
      return { filename: `users-${stamp}.csv`, rows: [...rows] };
    }
    case "growth": {
      const rows = await db.execute<Record<string, unknown>>(sql`
        with days as (select generate_series(current_date - (${days}::int - 1), current_date, interval '1 day')::date as day)
        select to_char(d.day, 'YYYY-MM-DD') as day,
          (select count(*) from ops_agent.users u where u.created_at::date = d.day) as new_users,
          (select count(*) from ops_agent.organizations o where o.created_at::date = d.day) as new_organizations,
          (select count(*) from ops_agent.messages m where m.created_at::date = d.day) as messages,
          (select count(*) from ops_agent.leads l where l.created_at::date = d.day) as leads,
          (select count(*) from ops_agent.bookings b where b.created_at::date = d.day) as bookings
        from days d order by d.day`);
      return { filename: `growth-${days}d-${stamp}.csv`, rows: [...rows] };
    }
    case "audit": {
      const rows = await listPlatformAudit(db, { since: new Date(Date.now() - days * 86400_000), limit: 5000 });
      return {
        filename: `platform-audit-${stamp}.csv`,
        rows: rows.map((r) => ({ created_at: r.createdAt, actor: r.actorEmail, action: r.action, target_type: r.targetType, target_id: r.targetId, ip: r.ip, metadata: r.metadata })),
      };
    }
  }
}
