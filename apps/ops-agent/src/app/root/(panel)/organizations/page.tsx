import Link from "next/link";
import { fmtDate, Pager, PlanBadge, StatusBadge } from "@/components/root/bits";
import { Card, EmptyState, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { getRootT } from "@/server/http/prefs";
import { requireRoot } from "@/server/http/root-page";
import { listOrganizations, orgListQuery, PLANS } from "@/server/platform/organizations";

export const metadata = { title: "Organizations" };

export default async function RootOrganizations({ searchParams }: PageProps<"/root/organizations">) {
  await requireRoot("orgs:read");
  const { t, locale } = await getRootT();
  const parsed = orgListQuery.safeParse(await searchParams);
  const q = parsed.success ? parsed.data : orgListQuery.parse({});
  const { organizations, total } = await listOrganizations(getDb(), q);

  return (
    <div>
      <PageHeader title={t.orgs.title} description={t.orgs.subtitle} />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_10rem_10rem_auto]" action="/root/organizations">
        <Input name="q" defaultValue={q.q} placeholder={`${t.common.search}…`} aria-label={t.common.search} />
        <Select name="plan" defaultValue={q.plan ?? ""} aria-label={t.common.plan}>
          <option value="">{t.common.plan}: {t.common.all}</option>
          {PLANS.map((p) => <option key={p} value={p}>{t.plans[p]}</option>)}
        </Select>
        <Select name="status" defaultValue={q.status ?? ""} aria-label={t.common.status}>
          <option value="">{t.common.status}: {t.common.all}</option>
          <option value="active">{t.status.active}</option>
          <option value="suspended">{t.status.suspended}</option>
        </Select>
        <button type="submit" className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white dark:bg-indigo-500">{t.common.search}</button>
      </form>
      <Card>
        {organizations.length === 0 ? (
          <EmptyState title={t.common.noResults} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t.common.name}</Th>
                  <Th>{t.common.plan}</Th>
                  <Th>{t.common.status}</Th>
                  <Th className="hidden text-right md:table-cell">{t.common.members}</Th>
                  <Th className="hidden text-right md:table-cell">{t.orgs.leads}</Th>
                  <Th className="hidden text-right lg:table-cell">{t.orgs.bookings}</Th>
                  <Th className="hidden text-right lg:table-cell">{t.orgs.messages30d}</Th>
                  <Th className="hidden xl:table-cell">{t.orgs.lastActivity}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {organizations.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <Td>
                      <Link href={`/root/organizations/${o.id}`} className="font-medium text-slate-900 hover:underline dark:text-slate-100">{o.name}</Link>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{o.slug} · {fmtDate(o.createdAt, locale)}</div>
                    </Td>
                    <Td><PlanBadge plan={o.plan} t={t} /></Td>
                    <Td><StatusBadge status={o.status} t={t} /></Td>
                    <Td className="hidden text-right tabular-nums md:table-cell">{o.members}</Td>
                    <Td className="hidden text-right tabular-nums md:table-cell">{o.leads}</Td>
                    <Td className="hidden text-right tabular-nums lg:table-cell">{o.bookings}</Td>
                    <Td className="hidden text-right tabular-nums lg:table-cell">{o.messages30d}</Td>
                    <Td className="hidden whitespace-nowrap text-slate-500 xl:table-cell">{fmtDate(o.lastActivityAt, locale)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pager base="/root/organizations" params={{ q: q.q, plan: q.plan, status: q.status }} total={total} limit={q.limit} offset={q.offset} t={t} />
          </>
        )}
      </Card>
    </div>
  );
}
