import Link from "next/link";
import { AddUserButton } from "@/components/root/forms";
import { fmtDate, Pager, PlatformRoleBadge, StatusBadge } from "@/components/root/bits";
import { Badge, Card, EmptyState, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { getRootT } from "@/server/http/prefs";
import { requireRoot } from "@/server/http/root-page";
import { listOrganizations } from "@/server/platform/organizations";
import { canPlatform } from "@/server/platform/rbac";
import { listUsers, userListQuery } from "@/server/platform/users";

export const metadata = { title: "Users" };

export default async function RootUsers({ searchParams }: PageProps<"/root/users">) {
  const { root } = await requireRoot("users:read");
  const { t, locale } = await getRootT();
  const sp = await searchParams;
  const parsed = userListQuery.safeParse(sp);
  const q = parsed.success ? parsed.data : userListQuery.parse({});
  const db = getDb();
  const canWrite = canPlatform(root.role, "users:write");
  const [{ users, total }, orgs] = await Promise.all([listUsers(db, q), canWrite ? listOrganizations(db, { limit: 200, offset: 0 }) : Promise.resolve({ organizations: [] })]);

  return (
    <div>
      <PageHeader
        title={t.users.title}
        description={t.users.subtitle}
        actions={canWrite && <AddUserButton t={t} orgs={orgs.organizations.map((o) => ({ id: o.id, name: o.name }))} canAssignRoles={canPlatform(root.role, "platform_roles:assign")} />}
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_10rem_auto]" action="/root/users">
        <Input name="q" defaultValue={q.q} placeholder={`${t.common.search}: ${t.common.email}, ${t.common.name}`} aria-label={t.common.search} />
        <Select name="role" defaultValue={q.role ?? ""} aria-label={t.users.filterRole}>
          <option value="">{t.users.filterRole}: {t.common.all}</option>
          <option value="superadmin">{t.roles.superadmin}</option>
          <option value="admin">{t.roles.admin}</option>
          <option value="support">{t.roles.support}</option>
          <option value="none">{t.roles.none}</option>
        </Select>
        <Select name="status" defaultValue={q.status ?? ""} aria-label={t.common.status}>
          <option value="">{t.common.status}: {t.common.all}</option>
          <option value="active">{t.status.active}</option>
          <option value="suspended">{t.status.suspended}</option>
        </Select>
        <button type="submit" className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white dark:bg-indigo-500">{t.common.search}</button>
      </form>
      <Card>
        {users.length === 0 ? (
          <EmptyState title={t.common.noResults} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t.common.name}</Th>
                  <Th>{t.users.platformRole}</Th>
                  <Th>{t.common.status}</Th>
                  <Th className="hidden md:table-cell">{t.users.workspaces}</Th>
                  <Th className="hidden md:table-cell">{t.users.mfa}</Th>
                  <Th className="hidden lg:table-cell">{t.common.lastLogin}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <Td>
                      <Link href={`/root/users/${u.id}`} className="font-medium text-slate-900 hover:underline dark:text-slate-100">{u.name}</Link>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{u.email}</div>
                    </Td>
                    <Td><PlatformRoleBadge role={u.platformRole} t={t} /></Td>
                    <Td><StatusBadge status={u.status} t={t} /></Td>
                    <Td className="hidden tabular-nums md:table-cell">{u.workspaces}</Td>
                    <Td className="hidden md:table-cell">{u.totpEnabled ? <Badge tone="green">{t.common.yes}</Badge> : <span className="text-slate-400">—</span>}</Td>
                    <Td className="hidden whitespace-nowrap text-slate-500 lg:table-cell">{u.lastLoginAt ? fmtDate(u.lastLoginAt, locale) : t.common.never}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager base="/root/users" params={{ q: q.q, role: q.role, status: q.status }} total={total} limit={q.limit} offset={q.offset} t={t} />
          </>
        )}
      </Card>
    </div>
  );
}
