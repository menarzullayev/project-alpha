import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Badge, Card, type Tone } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { RootDict } from "@/lib/i18n/root-dict";

export function Stat({ label, value, hint, icon: Icon, tone }: { label: string; value: string | number; hint?: string; icon: LucideIcon; tone?: "warn" | "ok" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <Icon className={cn("h-4 w-4", tone === "warn" ? "text-amber-500" : "text-slate-400 dark:text-slate-500")} aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </Card>
  );
}

export function StatusBadge({ status, t }: { status: string; t: RootDict }) {
  return <Badge tone={status === "active" ? "green" : "red"}>{t.status[status as "active" | "suspended"] ?? status}</Badge>;
}

const ROLE_TONE: Record<string, Tone> = { superadmin: "violet", admin: "indigo", support: "blue" };
export function PlatformRoleBadge({ role, t }: { role: string | null; t: RootDict }) {
  if (!role) return <span className="text-sm text-slate-400 dark:text-slate-500">{t.roles.none}</span>;
  return <Badge tone={ROLE_TONE[role] ?? "slate"}>{t.roles[role as "superadmin"] ?? role}</Badge>;
}

const PLAN_TONE: Record<string, Tone> = { free: "slate", pro: "blue", enterprise: "violet" };
export function PlanBadge({ plan, t }: { plan: string; t: RootDict }) {
  return <Badge tone={PLAN_TONE[plan] ?? "slate"}>{t.plans[plan as "free"] ?? plan}</Badge>;
}

export function Pager({ base, params, total, limit, offset, t }: { base: string; params: Record<string, string | undefined>; total: number; limit: number; offset: number; t: RootDict }) {
  const href = (o: number) => {
    const q = new URLSearchParams(Object.entries({ ...params, offset: String(o) }).filter(([, v]) => v) as [string, string][]);
    return `${base}?${q.toString()}`;
  };
  const end = Math.min(total, offset + limit);
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">
        {t.common.showing} {total ? offset + 1 : 0}–{end} {t.common.of} {total}
      </span>
      <div className="flex gap-2">
        {offset > 0 && (
          <Link href={href(Math.max(0, offset - limit))} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            {t.common.previous}
          </Link>
        )}
        {end < total && (
          <Link href={href(offset + limit)} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            {t.common.next}
          </Link>
        )}
      </div>
    </div>
  );
}

export function fmtDate(v: Date | string | null | undefined, locale: string) {
  if (!v) return "—";
  return new Intl.DateTimeFormat(locale === "uz" ? "uz-Latn" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tashkent" }).format(new Date(v));
}
