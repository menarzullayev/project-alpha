import { sql } from "drizzle-orm";
import type { Db, DbOrTx } from "../db/client";
import { organizations } from "../db/schema";
import { logger } from "../lib/logger";
import type { TenantContext } from "../tenancy";
import { notify } from "./notifications";

export type Overview = {
  leads30d: number;
  leadsToday: number;
  openHandoffs: number;
  upcomingBookings: number;
  bookings30d: number;
  conversion30d: number;
  automationRate30d: number;
  conversations30d: number;
  funnel: { status: string; count: number }[];
  leadsByDay: { day: string; leads: number; bookings: number }[];
  topCourses: { name: string; leads: number }[];
};

export async function getOverview(db: DbOrTx, ctx: TenantContext, timezone = "Asia/Tashkent"): Promise<Overview> {
  const org = ctx.orgId;
  const [kpi] = await db.execute<{
    leads30d: number;
    leadstoday: number;
    openhandoffs: number;
    upcomingbookings: number;
    bookings30d: number;
    booked_leads30d: number;
    inbound30d: number;
    agent30d: number;
    conversations30d: number;
  }>(sql`
    select
      (select count(*)::int from ops_agent.leads where org_id = ${org} and created_at > now() - interval '30 days') as leads30d,
      (select count(*)::int from ops_agent.leads where org_id = ${org}
         and (created_at at time zone ${timezone})::date = (now() at time zone ${timezone})::date) as leadstoday,
      (select count(*)::int from ops_agent.conversations where org_id = ${org} and status = 'handoff') as openhandoffs,
      (select count(*)::int from ops_agent.bookings b join ops_agent.course_slots s on s.id = b.slot_id
         where b.org_id = ${org} and b.status in ('pending','confirmed') and s.starts_at > now()) as upcomingbookings,
      (select count(*)::int from ops_agent.bookings where org_id = ${org} and created_at > now() - interval '30 days') as bookings30d,
      (select count(distinct l.id)::int from ops_agent.leads l join ops_agent.bookings b on b.lead_id = l.id
         where l.org_id = ${org} and l.created_at > now() - interval '30 days') as booked_leads30d,
      (select count(*)::int from ops_agent.messages where org_id = ${org} and direction = 'inbound' and created_at > now() - interval '30 days') as inbound30d,
      (select count(*)::int from ops_agent.messages where org_id = ${org} and sender_type = 'agent' and created_at > now() - interval '30 days') as agent30d,
      (select count(*)::int from ops_agent.conversations where org_id = ${org} and last_message_at > now() - interval '30 days') as conversations30d
  `);

  const funnel = await db.execute<{ status: string; count: number }>(sql`
    select status::text, count(*)::int as count from ops_agent.leads where org_id = ${org} group by status
  `);

  const byDay = await db.execute<{ day: string; leads: number; bookings: number }>(sql`
    with days as (
      select generate_series((now() at time zone ${timezone})::date - 13, (now() at time zone ${timezone})::date, interval '1 day')::date as day
    )
    select to_char(d.day, 'YYYY-MM-DD') as day,
      (select count(*)::int from ops_agent.leads l where l.org_id = ${org} and (l.created_at at time zone ${timezone})::date = d.day) as leads,
      (select count(*)::int from ops_agent.bookings b where b.org_id = ${org} and (b.created_at at time zone ${timezone})::date = d.day) as bookings
    from days d order by d.day
  `);

  const top = await db.execute<{ name: string; leads: number }>(sql`
    select c.name, count(l.id)::int as leads from ops_agent.leads l
    join ops_agent.courses c on c.id = l.interested_course_id
    where l.org_id = ${org} and l.created_at > now() - interval '30 days'
    group by c.name order by leads desc limit 5
  `);

  const order = ["new", "contacted", "qualified", "trial_booked", "won", "lost"];
  const fm = new Map(funnel.map((f) => [f.status, Number(f.count)]));
  return {
    leads30d: Number(kpi.leads30d),
    leadsToday: Number(kpi.leadstoday),
    openHandoffs: Number(kpi.openhandoffs),
    upcomingBookings: Number(kpi.upcomingbookings),
    bookings30d: Number(kpi.bookings30d),
    conversion30d: kpi.leads30d ? Number(kpi.booked_leads30d) / Number(kpi.leads30d) : 0,
    automationRate30d: kpi.inbound30d ? Math.min(1, Number(kpi.agent30d) / Number(kpi.inbound30d)) : 0,
    conversations30d: Number(kpi.conversations30d),
    funnel: order.map((s) => ({ status: s, count: fm.get(s) ?? 0 })),
    leadsByDay: byDay.map((d) => ({ day: d.day, leads: Number(d.leads), bookings: Number(d.bookings) })),
    topCourses: top.map((t) => ({ name: t.name, leads: Number(t.leads) })),
  };
}

export async function buildDailyReport(db: DbOrTx, orgId: string, timezone: string) {
  const [r] = await db.execute<{ leads: number; bookings: number; handoffs: number; inbound: number; agent: number }>(sql`
    with bounds as (
      select ((now() at time zone ${timezone})::date - 1) as day
    )
    select
      (select count(*)::int from ops_agent.leads, bounds where org_id = ${orgId} and (created_at at time zone ${timezone})::date = bounds.day) as leads,
      (select count(*)::int from ops_agent.bookings, bounds where org_id = ${orgId} and (created_at at time zone ${timezone})::date = bounds.day) as bookings,
      (select count(*)::int from ops_agent.audit_logs, bounds where org_id = ${orgId} and action = 'conversation.handoff' and (created_at at time zone ${timezone})::date = bounds.day) as handoffs,
      (select count(*)::int from ops_agent.messages, bounds where org_id = ${orgId} and direction = 'inbound' and (created_at at time zone ${timezone})::date = bounds.day) as inbound,
      (select count(*)::int from ops_agent.messages, bounds where org_id = ${orgId} and sender_type = 'agent' and (created_at at time zone ${timezone})::date = bounds.day) as agent
  `);
  return {
    leads: Number(r.leads),
    bookings: Number(r.bookings),
    handoffs: Number(r.handoffs),
    inbound: Number(r.inbound),
    agentReplies: Number(r.agent),
  };
}

/** Sends yesterday's summary to every organization (dashboard + manager Telegram chat). */
export async function sendDailyReports(db: Db) {
  const orgs = await db.select({ id: organizations.id, name: organizations.name, timezone: organizations.timezone }).from(organizations);
  let sent = 0;
  for (const org of orgs) {
    try {
      const r = await buildDailyReport(db, org.id, org.timezone);
      if (!r.inbound && !r.leads && !r.bookings) continue;
      await notify(db, org.id, {
        type: "daily_report",
        title: `Daily report — ${org.name}`,
        body: `Leads: ${r.leads}\nTrial bookings: ${r.bookings}\nMessages received: ${r.inbound}\nAutomated replies: ${r.agentReplies}\nHandoffs to staff: ${r.handoffs}`,
        link: "/dashboard",
      });
      sent++;
    } catch (err) {
      logger.error("daily report failed", { orgId: org.id, err: (err as Error).message });
    }
  }
  return { organizations: orgs.length, sent };
}
