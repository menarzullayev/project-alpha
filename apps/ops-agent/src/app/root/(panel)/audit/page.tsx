import { Download } from "lucide-react";
import { fmtDate } from "@/components/root/bits";
import { Badge, Card, EmptyState, Input, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { getRootT } from "@/server/http/prefs";
import { requireRoot } from "@/server/http/root-page";
import { listPlatformAudit } from "@/server/platform/audit";

export const metadata = { title: "Audit log" };

function tone(action: string) {
  if (/suspend|mfa_failed|removed|reset|revoked/.test(action)) return "red" as const;
  if (/created|reactivated|enabled|added/.test(action)) return "green" as const;
  if (/settings|role|plan/.test(action)) return "violet" as const;
  return "slate" as const;
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400_000);
}

export default async function RootAudit({ searchParams }: PageProps<"/root/audit">) {
  await requireRoot("audit:read");
  const { t, locale } = await getRootT();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const days = typeof sp.days === "string" && /^\d{1,3}$/.test(sp.days) ? Number(sp.days) : 30;
  const since = daysAgo(days);
  const entries = await listPlatformAudit(getDb(), { q: q || undefined, since, limit: 300 });
  const csv = `/api/root/audit?${new URLSearchParams({ format: "csv", since: since.toISOString(), ...(q ? { q } : {}) }).toString()}`;

  return (
    <div>
      <PageHeader
        title={t.audit.title}
        description={t.audit.subtitle}
        actions={
          <a href={csv} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
            <Download className="h-4 w-4" /> {t.common.download}
          </a>
        }
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_9rem_auto]" action="/root/audit">
        <Input name="q" defaultValue={q} placeholder={t.audit.filterPlaceholder} aria-label={t.common.search} />
        <select name="days" defaultValue={String(days)} aria-label={t.reports.period} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
          {[1, 7, 30, 90, 365].map((d) => <option key={d} value={d}>{d} {t.reports.days}</option>)}
        </select>
        <button type="submit" className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white dark:bg-indigo-500">{t.common.search}</button>
      </form>
      <Card>
        {entries.length === 0 ? (
          <EmptyState title={t.common.noResults} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.audit.time}</Th>
                <Th>{t.audit.actor}</Th>
                <Th>{t.audit.action}</Th>
                <Th className="hidden md:table-cell">{t.audit.target}</Th>
                <Th className="hidden lg:table-cell">{t.audit.details}</Th>
                <Th className="hidden xl:table-cell">{t.audit.ip}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((e) => (
                <tr key={e.id} className="align-top">
                  <Td className="whitespace-nowrap text-slate-500 dark:text-slate-400">{fmtDate(e.createdAt, locale)}</Td>
                  <Td className="max-w-[14rem] truncate">{e.actorEmail ?? "system"}</Td>
                  <Td><Badge tone={tone(e.action)}>{e.action}</Badge></Td>
                  <Td className="hidden font-mono text-xs md:table-cell">
                    {e.targetType}
                    {e.targetId && <div className="text-slate-500 dark:text-slate-400">{e.targetId.slice(0, 8)}…</div>}
                  </Td>
                  <Td className="hidden max-w-md lg:table-cell">
                    {e.metadata && Object.keys(e.metadata as object).length > 0 && (
                      <code className="line-clamp-3 break-all text-xs text-slate-600 dark:text-slate-400">{JSON.stringify(e.metadata)}</code>
                    )}
                  </Td>
                  <Td className="hidden font-mono text-xs text-slate-500 xl:table-cell">{e.ip ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
