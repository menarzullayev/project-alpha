import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate, PlanBadge, Stat, StatusBadge } from "@/components/root/bits";
import { ReactivateButton, SuspendButton } from "@/components/root/forms";
import { ApiForm } from "@/components/ui/interactive";
import { Alert, Badge, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/lib/errors";
import { getRootT } from "@/server/http/prefs";
import { requireRoot } from "@/server/http/root-page";
import { getOrganizationDetail, PLANS } from "@/server/platform/organizations";
import { canPlatform } from "@/server/platform/rbac";
import { CalendarCheck, MessageSquare, Target, Users } from "lucide-react";

export default async function RootOrganizationDetail({ params }: PageProps<"/root/organizations/[id]">) {
  const { root } = await requireRoot("orgs:read");
  const { t, locale } = await getRootT();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getOrganizationDetail(getDb(), id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const { organization: org, stats, members, telegram } = detail;
  const canWrite = canPlatform(root.role, "orgs:write");
  const canSuspend = canPlatform(root.role, "orgs:suspend");

  return (
    <div className="space-y-6">
      <Link href="/root/organizations" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> {t.orgs.title}
      </Link>
      <PageHeader
        title={org.name}
        description={`${org.slug} · ${t.common.created} ${fmtDate(org.createdAt, locale)}`}
        actions={
          <>
            <PlanBadge plan={org.plan} t={t} />
            <StatusBadge status={org.status} t={t} />
          </>
        }
      />
      {org.status === "suspended" && (
        <Alert tone="red">
          {t.users.suspendedBecause} {fmtDate(org.suspendedAt, locale)}{org.suspendedReason ? ` — ${org.suspendedReason}` : ""}
        </Alert>
      )}

      <section aria-label={t.orgs.usage} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.common.members} value={stats.members} icon={Users} />
        <Stat label={t.orgs.leads} value={stats.leads} icon={Target} />
        <Stat label={t.orgs.bookings} value={stats.bookings} icon={CalendarCheck} />
        <Stat label={t.orgs.messages30d} value={stats.messages30d} hint={`${t.orgs.lastActivity}: ${fmtDate(stats.lastActivityAt, locale)}`} icon={MessageSquare} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t.orgs.changePlan} />
          <div className="p-5">
            <ApiForm action={`/api/root/organizations/${org.id}`} method="PATCH" successMessage={t.common.saved} fields={{ name: "string", plan: "string" }}>
              <fieldset disabled={!canWrite} className="grid gap-4 sm:grid-cols-2">
                <Field label={t.common.name} htmlFor="o-name"><Input id="o-name" name="name" defaultValue={org.name} required minLength={2} /></Field>
                <Field label={t.common.plan} htmlFor="o-plan">
                  <Select id="o-plan" name="plan" defaultValue={org.plan}>
                    {PLANS.map((p) => <option key={p} value={p}>{t.plans[p]}</option>)}
                  </Select>
                </Field>
              </fieldset>
            </ApiForm>
          </div>
        </Card>

        <Card>
          <CardHeader title={t.orgs.telegram} />
          <div className="space-y-2 p-5 text-sm">
            {telegram ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge tone={telegram.status === "active" ? "green" : telegram.status === "error" ? "red" : "slate"}>{telegram.status}</Badge>
                  <span className="text-slate-500 dark:text-slate-400">{telegram.mode}</span>
                </div>
                <p className="font-medium">{telegram.name}</p>
                {telegram.lastError && <p className="text-xs text-red-600 dark:text-red-400">{telegram.lastError}</p>}
              </>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">{t.orgs.notConnected}</p>
            )}
          </div>
          {canSuspend && (
            <div className="border-t border-slate-100 p-5 dark:border-slate-800">
              {org.status === "active" ? (
                <SuspendButton action={`/api/root/organizations/${org.id}/status`} title={t.orgs.suspend} hint={t.orgs.suspendHint} label={t.orgs.suspend} t={t} />
              ) : (
                <ReactivateButton action={`/api/root/organizations/${org.id}/status`} label={t.orgs.reactivate} />
              )}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title={t.common.members} />
        {members.length === 0 ? (
          <EmptyState title={t.common.none} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span>
                  {canPlatform(root.role, "users:read") ? (
                    <Link href={`/root/users/${m.userId}`} className="font-medium hover:underline">{m.name}</Link>
                  ) : (
                    <span className="font-medium">{m.name}</span>
                  )}
                  <span className="ml-2 text-slate-500 dark:text-slate-400">{m.email}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge>{t.orgRoles[m.role]}</Badge>
                  {m.status === "suspended" && <StatusBadge status="suspended" t={t} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
