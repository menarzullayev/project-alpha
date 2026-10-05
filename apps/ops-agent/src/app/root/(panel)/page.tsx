import { Activity, AlertTriangle, Bot, Building2, CalendarCheck, CheckCircle2, Headset, MessageSquare, Target, Users } from "lucide-react";
import Link from "next/link";
import { DailyBars, FunnelBars } from "@/components/dashboard/charts";
import { fmtDate, PlanBadge, Stat } from "@/components/root/bits";
import { Alert, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { getRootT } from "@/server/http/prefs";
import { requireRoot } from "@/server/http/root-page";
import { listPlatformAudit } from "@/server/platform/audit";
import { getPlatformOverview } from "@/server/platform/overview";
import { canPlatform } from "@/server/platform/rbac";

export const metadata = { title: "Overview" };

export default async function RootOverview({ searchParams }: PageProps<"/root">) {
  const { root } = await requireRoot("platform:read");
  const { t, locale } = await getRootT();
  const sp = await searchParams;
  const db = getDb();
  const [o, recent] = await Promise.all([getPlatformOverview(db), canPlatform(root.role, "audit:read") ? listPlatformAudit(db, { limit: 8 }) : Promise.resolve([])]);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const healthIssues = o.health.webhookFailures24h + o.health.deliveryFailures24h + o.health.telegramErrors;

  return (
    <div className="space-y-6">
      <PageHeader title={t.overview.title} description={t.overview.subtitle} />
      {sp.denied && <Alert tone="amber">{t.common.accessDenied}</Alert>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t.overview.organizations} value={o.organizations.total} hint={`${o.organizations.active} ${t.overview.activeOrgs} · ${o.organizations.suspended} ${t.overview.suspendedOrgs}`} icon={Building2} />
        <Stat label={t.overview.users} value={o.users.total} hint={`+${o.users.new30d} ${t.overview.newIn30} · ${o.users.activeToday} ${t.overview.activeToday}`} icon={Users} />
        <Stat label={t.overview.messages24h} value={o.activity.messages24h} hint={`${o.activity.messages30d} ${t.overview.messages30d}`} icon={MessageSquare} />
        <Stat label={t.overview.automation} value={pct(o.activity.automationRate30d)} hint={t.overview.automationHint} icon={Bot} />
        <Stat label={t.overview.leads30d} value={o.activity.leads30d} icon={Target} />
        <Stat label={t.overview.bookings30d} value={o.activity.bookings30d} icon={CalendarCheck} />
        <Stat label={t.overview.handoffs} value={o.activity.handoffsOpen} icon={Headset} tone={o.activity.handoffsOpen > 20 ? "warn" : undefined} />
        <Stat label={t.overview.health} value={healthIssues === 0 ? "OK" : healthIssues} hint={healthIssues === 0 ? t.overview.allGood : undefined} icon={healthIssues ? AlertTriangle : CheckCircle2} tone={healthIssues ? "warn" : "ok"} />
      </div>

      {healthIssues > 0 && (
        <Card>
          <CardHeader title={t.overview.health} />
          <ul className="grid gap-3 p-5 text-sm sm:grid-cols-3">
            <li className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">{t.overview.webhookFailures}</span><span className="font-semibold tabular-nums">{o.health.webhookFailures24h}</span></li>
            <li className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">{t.overview.deliveryFailures}</span><span className="font-semibold tabular-nums">{o.health.deliveryFailures24h}</span></li>
            <li className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">{t.overview.telegramErrors}</span><span className="font-semibold tabular-nums">{o.health.telegramErrors}</span></li>
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.overview.newUsers} description={t.overview.growth} />
          <div className="p-5">
            <DailyBars data={o.growth.map((g) => ({ day: g.day, value: g.users }))} label={t.overview.newUsers.toLowerCase()} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t.overview.messagesSeries} description={t.overview.growth} />
          <div className="p-5">
            <DailyBars data={o.growth.map((g) => ({ day: g.day, value: g.messages }))} label={t.overview.messagesSeries.toLowerCase()} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t.overview.topOrgs} />
          {o.topOrganizations.length === 0 ? (
            <EmptyState title={t.common.noResults} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t.nav.organizations}</Th>
                  <Th>{t.common.plan}</Th>
                  <Th className="text-right">{t.orgs.messages30d}</Th>
                  <Th className="text-right">{t.overview.leads30d}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {o.topOrganizations.map((org) => (
                  <tr key={org.id}>
                    <Td>
                      <Link href={`/root/organizations/${org.id}`} className="font-medium text-slate-900 hover:underline dark:text-slate-100">
                        {org.name}
                      </Link>
                    </Td>
                    <Td><PlanBadge plan={org.plan} t={t} /></Td>
                    <Td className="text-right tabular-nums">{org.messages30d}</Td>
                    <Td className="text-right tabular-nums">{org.leads30d}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title={t.overview.byPlan} />
          <div className="p-5">
            <FunnelBars rows={o.organizations.byPlan.map((p) => ({ label: t.plans[p.plan as "free"] ?? p.plan, value: p.count }))} />
          </div>
        </Card>
      </div>

      {recent.length > 0 && (
        <Card>
          <CardHeader
            title={t.overview.recentActivity}
            action={
              <Link href="/root/audit" className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                {t.nav.audit}
              </Link>
            }
          />
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {recent.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                  <span className="font-mono text-xs">{e.action}</span>
                  <span className="text-slate-500 dark:text-slate-400">{e.actorEmail ?? "system"}</span>
                </span>
                <span className="text-xs text-slate-400">{fmtDate(e.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
