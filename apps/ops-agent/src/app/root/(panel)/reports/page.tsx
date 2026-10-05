import { Building2, Download, ScrollText, TrendingUp, Users } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/primitives";
import { getRootT } from "@/server/http/prefs";
import { requireRoot } from "@/server/http/root-page";
import { canPlatform } from "@/server/platform/rbac";
import type { ReportType } from "@/server/platform/reports";

export const metadata = { title: "Reports" };

const ICONS = { organizations: Building2, users: Users, growth: TrendingUp, audit: ScrollText } as const;
const PERIODS = [7, 30, 90, 365];

export default async function RootReports() {
  const { root } = await requireRoot("reports:read");
  const { t } = await getRootT();
  const types: ReportType[] = ["organizations", "users", "growth", ...(canPlatform(root.role, "audit:read") ? (["audit"] as const) : [])];

  return (
    <div>
      <PageHeader title={t.reports.title} description={t.reports.subtitle} />
      <div className="grid gap-4 md:grid-cols-2">
        {types.map((type) => {
          const Icon = ICONS[type];
          return (
            <Card key={type} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Icon className="h-5 w-5" aria-hidden /></span>
                <div>
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t.reports[type].title}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.reports[type].desc}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">{t.reports.period}:</span>
                {(type === "users" ? [30] : PERIODS).map((d) => (
                  <a
                    key={d}
                    href={`/api/root/reports?type=${type}&days=${d}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    data-testid={`report-${type}-${d}`}
                  >
                    <Download className="h-3.5 w-3.5" /> {type === "users" ? t.common.download : `${d} ${t.reports.days}`}
                  </a>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
