import { fmtDate } from "@/components/root/bits";
import { NewAnnouncementButton } from "@/components/root/forms";
import { ActionButton } from "@/components/ui/interactive";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { getRootT } from "@/server/http/prefs";
import { requireRoot } from "@/server/http/root-page";
import { listAnnouncements } from "@/server/platform/announcements";
import { canPlatform } from "@/server/platform/rbac";

export const metadata = { title: "Announcements" };

const SEVERITY_TONE = { info: "blue", warning: "amber", critical: "red" } as const;

export default async function RootAnnouncements() {
  const { root } = await requireRoot("platform:read");
  const { t, locale } = await getRootT();
  const items = await listAnnouncements(getDb());
  const canWrite = canPlatform(root.role, "announcements:write");
  const now = new Date();
  const state = (a: (typeof items)[number]) => (a.endsAt && a.endsAt <= now ? "ended" : a.startsAt > now ? "scheduled" : "live");

  return (
    <div>
      <PageHeader title={t.announcements.title} description={t.announcements.subtitle} actions={canWrite && <NewAnnouncementButton t={t} />} />
      <Card>
        {items.length === 0 ? (
          <EmptyState title={t.announcements.empty} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((a) => {
              const s = state(a);
              return (
                <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={SEVERITY_TONE[a.severity]}>{t.announcements.severities[a.severity]}</Badge>
                      <Badge tone={s === "live" ? "green" : s === "scheduled" ? "indigo" : "slate"}>{t.announcements[s]}</Badge>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {a.audience === "owners" ? t.announcements.audienceOwners : t.announcements.audienceAll}
                      </span>
                    </div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{a.title}</p>
                    {a.body && <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">{a.body}</p>}
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {fmtDate(a.startsAt, locale)} → {a.endsAt ? fmtDate(a.endsAt, locale) : "∞"}
                    </p>
                  </div>
                  {canWrite && s !== "ended" && (
                    <ActionButton action={`/api/root/announcements/${a.id}`} method="DELETE" variant="secondary" confirm={`${t.announcements.end}?`}>
                      {t.announcements.end}
                    </ActionButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
