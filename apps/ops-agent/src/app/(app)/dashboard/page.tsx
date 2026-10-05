import { ArrowRight, CalendarCheck, Headset, Target, Zap } from "lucide-react";
import Link from "next/link";
import { DailyBars, FunnelBars } from "@/components/dashboard/charts";
import { DemoDataButton } from "@/components/dashboard/demo-data-button";
import { LEAD_LABELS } from "@/components/status";
import { Alert, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { getOverview } from "@/server/domains/analytics";
import { listConversations } from "@/server/domains/conversations";
import { listCourses } from "@/server/domains/courses";
import { getTelegramIntegration } from "@/server/domains/integrations";
import { requirePage } from "@/server/http/page-auth";
import { can } from "@/server/rbac";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Dashboard" };

function Stat({ label, value, hint, icon: Icon }: { label: string; value: string | number; hint?: string; icon: typeof Target }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { session, tenant } = await requirePage("dashboard:read");
  const sp = await searchParams;
  const db = getDb();
  const [overview, courses, integration, handoffs] = await Promise.all([
    getOverview(db, tenant, session.org!.timezone),
    listCourses(db, tenant),
    getTelegramIntegration(db, tenant),
    listConversations(db, tenant, { status: "handoff", limit: 5 }),
  ]);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const isEmpty = courses.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${session.user.name.split(" ")[0]}`} description="How your AI agent is performing across Telegram conversations." />
      {sp.denied && <Alert tone="amber">Your role does not have access to that page.</Alert>}

      {isEmpty && (
        <Card>
          <EmptyState
            icon={<Zap className="h-5 w-5" />}
            title="Set up your AI agent"
            description="Add your courses and trial slots, approve a few FAQ answers and connect your Telegram bot. Or load a ready-made demo education centre to explore."
            action={
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                {can(tenant.role, "org:manage") && <DemoDataButton />}
                <Link href="/courses" className="text-sm font-medium text-brand-600 hover:underline">
                  Add courses manually →
                </Link>
              </div>
            }
          />
        </Card>
      )}

      {!isEmpty && !integration && (
        <Alert tone="blue">
          Your Telegram bot isn&apos;t connected yet.{" "}
          <Link href="/integrations" className="font-medium underline">
            Connect it
          </Link>{" "}
          to start receiving real conversations — meanwhile try the agent in the{" "}
          <Link href="/agent" className="font-medium underline">
            test chat
          </Link>
          .
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Leads (30 days)" value={overview.leads30d} hint={`${overview.leadsToday} today`} icon={Target} />
        <Stat label="Trial bookings (30 days)" value={overview.bookings30d} hint={`${overview.upcomingBookings} upcoming`} icon={CalendarCheck} />
        <Stat label="Lead → trial conversion" value={pct(overview.conversion30d)} hint="leads with a booking" icon={ArrowRight} />
        <Stat label="Needs a human" value={overview.openHandoffs} hint={`${pct(overview.automationRate30d)} of messages answered by AI`} icon={Headset} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="New leads per day" description="Last 14 days" />
          <div className="p-5">
            <DailyBars data={overview.leadsByDay.map((d) => ({ day: d.day, value: d.leads }))} label="leads" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Lead pipeline" description="All open and closed leads" />
          <div className="p-5">
            <FunnelBars rows={overview.funnel.map((f) => ({ label: LEAD_LABELS[f.status] ?? f.status, value: f.count }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Waiting for a human"
            description="Conversations the agent escalated"
            action={
              <Link href="/conversations?status=handoff" className="text-sm font-medium text-brand-600 hover:underline">
                View all
              </Link>
            }
          />
          {handoffs.length === 0 ? (
            <EmptyState title="All clear" description="No conversation is waiting for your team." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {handoffs.map((c) => (
                <li key={c.id}>
                  <Link href={`/conversations/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{c.customerName ?? c.telegramUsername ?? "Customer"}</p>
                      <p className="truncate text-sm text-slate-500">{c.lastMessage}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{timeAgo(c.lastMessageAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Most requested courses" description="By lead interest, last 30 days" />
          {overview.topCourses.length === 0 ? (
            <EmptyState title="No data yet" description="Course interest appears once customers start asking about courses." />
          ) : (
            <div className="p-5">
              <FunnelBars rows={overview.topCourses.map((t) => ({ label: t.name, value: t.leads }))} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
