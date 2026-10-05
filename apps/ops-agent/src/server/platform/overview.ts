import { sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";

export type PlatformOverview = {
  organizations: { total: number; active: number; suspended: number; new30d: number; byPlan: { plan: string; count: number }[] };
  users: { total: number; suspended: number; new30d: number; activeToday: number; operators: number };
  activity: { messages24h: number; messages30d: number; leads30d: number; bookings30d: number; handoffsOpen: number; automationRate30d: number };
  health: { webhookFailures24h: number; deliveryFailures24h: number; telegramErrors: number };
  growth: { day: string; users: number; organizations: number; messages: number }[];
  topOrganizations: { id: string; name: string; plan: string; messages30d: number; leads30d: number }[];
};

const n = (v: unknown) => Number(v ?? 0);

export async function getPlatformOverview(db: DbOrTx): Promise<PlatformOverview> {
  const [k] = await db.execute<Record<string, number>>(sql`
    select
      (select count(*) from ops_agent.organizations) as orgs_total,
      (select count(*) from ops_agent.organizations where status = 'active') as orgs_active,
      (select count(*) from ops_agent.organizations where status = 'suspended') as orgs_suspended,
      (select count(*) from ops_agent.organizations where created_at > now() - interval '30 days') as orgs_new30d,
      (select count(*) from ops_agent.users) as users_total,
      (select count(*) from ops_agent.users where status = 'suspended') as users_suspended,
      (select count(*) from ops_agent.users where created_at > now() - interval '30 days') as users_new30d,
      (select count(*) from ops_agent.users where last_login_at > now() - interval '1 day') as users_today,
      (select count(*) from ops_agent.users where platform_role is not null) as operators,
      (select count(*) from ops_agent.messages where created_at > now() - interval '1 day') as msgs24h,
      (select count(*) from ops_agent.messages where created_at > now() - interval '30 days') as msgs30d,
      (select count(*) from ops_agent.messages where direction = 'inbound' and created_at > now() - interval '30 days') as inbound30d,
      (select count(*) from ops_agent.messages where sender_type = 'agent' and created_at > now() - interval '30 days') as agent30d,
      (select count(*) from ops_agent.leads where created_at > now() - interval '30 days') as leads30d,
      (select count(*) from ops_agent.bookings where created_at > now() - interval '30 days') as bookings30d,
      (select count(*) from ops_agent.conversations where status = 'handoff') as handoffs,
      (select count(*) from ops_agent.webhook_events where status = 'failed' and received_at > now() - interval '1 day') as wh_fail,
      (select count(*) from ops_agent.messages where delivery_status = 'failed' and created_at > now() - interval '1 day') as dl_fail,
      (select count(*) from ops_agent.integrations where status = 'error') as tg_err
  `);
  const byPlan = await db.execute<{ plan: string; count: number }>(sql`
    select plan, count(*)::int as count from ops_agent.organizations group by plan order by plan
  `);
  const growth = await db.execute<{ day: string; users: number; organizations: number; messages: number }>(sql`
    with days as (select generate_series(current_date - 29, current_date, interval '1 day')::date as day)
    select to_char(d.day, 'YYYY-MM-DD') as day,
      (select count(*)::int from ops_agent.users u where u.created_at::date = d.day) as users,
      (select count(*)::int from ops_agent.organizations o where o.created_at::date = d.day) as organizations,
      (select count(*)::int from ops_agent.messages m where m.created_at::date = d.day) as messages
    from days d order by d.day
  `);
  const top = await db.execute<{ id: string; name: string; plan: string; messages30d: number; leads30d: number }>(sql`
    select o.id, o.name, o.plan,
      (select count(*)::int from ops_agent.messages m where m.org_id = o.id and m.created_at > now() - interval '30 days') as "messages30d",
      (select count(*)::int from ops_agent.leads l where l.org_id = o.id and l.created_at > now() - interval '30 days') as "leads30d"
    from ops_agent.organizations o
    order by 4 desc, o.created_at desc limit 5
  `);
  return {
    organizations: {
      total: n(k.orgs_total),
      active: n(k.orgs_active),
      suspended: n(k.orgs_suspended),
      new30d: n(k.orgs_new30d),
      byPlan: byPlan.map((p) => ({ plan: p.plan, count: n(p.count) })),
    },
    users: { total: n(k.users_total), suspended: n(k.users_suspended), new30d: n(k.users_new30d), activeToday: n(k.users_today), operators: n(k.operators) },
    activity: {
      messages24h: n(k.msgs24h),
      messages30d: n(k.msgs30d),
      leads30d: n(k.leads30d),
      bookings30d: n(k.bookings30d),
      handoffsOpen: n(k.handoffs),
      automationRate30d: n(k.inbound30d) ? Math.min(1, n(k.agent30d) / n(k.inbound30d)) : 0,
    },
    health: { webhookFailures24h: n(k.wh_fail), deliveryFailures24h: n(k.dl_fail), telegramErrors: n(k.tg_err) },
    growth: growth.map((g) => ({ day: g.day, users: n(g.users), organizations: n(g.organizations), messages: n(g.messages) })),
    topOrganizations: top.map((t) => ({ id: t.id, name: t.name, plan: t.plan, messages30d: n(t.messages30d), leads30d: n(t.leads30d) })),
  };
}
