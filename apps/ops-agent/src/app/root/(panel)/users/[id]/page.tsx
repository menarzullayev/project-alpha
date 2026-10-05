import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate, PlatformRoleBadge, StatusBadge } from "@/components/root/bits";
import { AddMembershipForm, ReactivateButton, ResetPasswordButton, SimpleAction, SuspendButton } from "@/components/root/forms";
import { ActionButton, ApiForm } from "@/components/ui/interactive";
import { Alert, Badge, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/lib/errors";
import { getRootT } from "@/server/http/prefs";
import { requireRoot } from "@/server/http/root-page";
import { listOrganizations } from "@/server/platform/organizations";
import { canPlatform } from "@/server/platform/rbac";
import { getUserDetail } from "@/server/platform/users";

export default async function RootUserDetail({ params }: PageProps<"/root/users/[id]">) {
  const { root } = await requireRoot("users:read");
  const { t, locale } = await getRootT();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getDb();
  const detail = await getUserDetail(db, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const { user, memberships, activeSessions } = detail;
  const self = user.id === root.userId;
  const isSuper = canPlatform(root.role, "platform_roles:assign");
  // Mirrors users.ts: only a superadmin manages other platform-operator accounts.
  const canManage = !user.platformRole || isSuper || self;
  const canWrite = canPlatform(root.role, "users:write") && canManage;
  const canSuspend = canPlatform(root.role, "users:suspend") && canManage && !self;
  const orgs = canWrite ? (await listOrganizations(db, { limit: 200, offset: 0 })).organizations : [];

  return (
    <div className="space-y-6">
      <Link href="/root/users" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> {t.users.title}
      </Link>
      <PageHeader
        title={user.name}
        description={user.email}
        actions={
          <>
            <PlatformRoleBadge role={user.platformRole} t={t} />
            <StatusBadge status={user.status} t={t} />
          </>
        }
      />
      {user.status === "suspended" && (
        <Alert tone="red">
          {t.users.suspendedBecause} {fmtDate(user.suspendedAt, locale)}{user.suspendedReason ? ` — ${user.suspendedReason}` : ""}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t.users.profile} />
          <div className="p-5">
            <ApiForm
              action={`/api/root/users/${user.id}`}
              method="PATCH"
              successMessage={t.common.saved}
              fields={isSuper && !self ? { name: "string", email: "string", platformRole: "nullable" } : { name: "string", email: "string" }}
            >
              <fieldset disabled={!canWrite} className="grid gap-4 sm:grid-cols-2">
                <Field label={t.common.name} htmlFor="u-name"><Input id="u-name" name="name" defaultValue={user.name} required /></Field>
                <Field label={t.common.email} htmlFor="u-email"><Input id="u-email" name="email" type="email" defaultValue={user.email} required /></Field>
                {isSuper && !self && (
                  <Field label={t.users.platformRole} htmlFor="u-role">
                    <Select id="u-role" name="platformRole" defaultValue={user.platformRole ?? ""}>
                      <option value="">{t.roles.none}</option>
                      <option value="support">{t.roles.support}</option>
                      <option value="admin">{t.roles.admin}</option>
                      <option value="superadmin">{t.roles.superadmin}</option>
                    </Select>
                  </Field>
                )}
              </fieldset>
            </ApiForm>
          </div>
        </Card>

        <Card>
          <CardHeader title={t.users.security} />
          <dl className="space-y-2 p-5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">{t.common.created}</dt><dd>{fmtDate(user.createdAt, locale)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">{t.common.lastLogin}</dt><dd>{user.lastLoginAt ? fmtDate(user.lastLoginAt, locale) : t.common.never}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">{t.users.activeSessions}</dt><dd className="tabular-nums">{activeSessions}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">{t.users.mfa}</dt><dd>{user.totpEnabledAt ? <Badge tone="green">{t.common.yes}</Badge> : t.common.no}</dd></div>
            {user.mustChangePassword && <div><Badge tone="amber">{t.users.mustChange}</Badge></div>}
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 p-5 dark:border-slate-800">
            {canSuspend && user.status === "active" && (
              <SuspendButton action={`/api/root/users/${user.id}/status`} title={t.users.suspendTitle} hint={t.users.suspendHint} label={t.users.suspend} t={t} />
            )}
            {canSuspend && user.status === "suspended" && <ReactivateButton action={`/api/root/users/${user.id}/status`} label={t.users.reactivate} />}
            {canWrite && !self && <ResetPasswordButton userId={user.id} t={t} />}
            {canPlatform(root.role, "users:suspend") && canManage && activeSessions > 0 && (
              <SimpleAction action={`/api/root/users/${user.id}/sessions`} method="DELETE" label={t.users.revokeSessions} icon="logout" confirm={`${t.users.revokeSessions}?`} />
            )}
            {isSuper && user.totpEnabledAt && !self && (
              <SimpleAction action={`/api/root/users/${user.id}/mfa`} method="DELETE" label={t.users.resetMfa} icon="shield" confirm={`${t.users.resetMfa}?`} variant="danger" />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t.users.memberships} />
        {memberships.length === 0 ? (
          <EmptyState title={t.common.none} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {memberships.map((m) => (
              <li key={m.organizationId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="flex items-center gap-2">
                  <Link href={`/root/organizations/${m.organizationId}`} className="font-medium hover:underline">{m.organizationName}</Link>
                  <Badge>{t.orgRoles[m.role]}</Badge>
                  {m.organizationStatus === "suspended" && <StatusBadge status="suspended" t={t} />}
                </span>
                {canWrite && (
                  <ActionButton action={`/api/root/users/${user.id}/memberships/${m.organizationId}`} method="DELETE" variant="ghost" confirm={`${t.users.remove}?`}>
                    {t.users.remove}
                  </ActionButton>
                )}
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <div className="border-t border-slate-100 p-5 dark:border-slate-800">
            <AddMembershipForm userId={user.id} orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} t={t} />
          </div>
        )}
      </Card>
    </div>
  );
}
