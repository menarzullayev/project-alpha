import { AlertTriangle, Info, Megaphone, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/cn";

type Banner = { id: string; title: string; body: string; severity: "info" | "warning" | "critical" };

const STYLE = {
  info: { cls: "border-blue-200 bg-blue-50 text-blue-900", Icon: Info },
  warning: { cls: "border-amber-200 bg-amber-50 text-amber-900", Icon: AlertTriangle },
  critical: { cls: "border-red-200 bg-red-50 text-red-900", Icon: OctagonAlert },
} as const;

/** Platform-wide notices published from the root panel (maintenance banner + announcements). */
export function PlatformBanners({ maintenance, announcements }: { maintenance: string; announcements: Banner[] }) {
  if (!maintenance && announcements.length === 0) return null;
  return (
    <div className="mb-6 space-y-2" role="region" aria-label="Platform announcements">
      {maintenance && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="maintenance-banner">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{maintenance}</p>
        </div>
      )}
      {announcements.map((a) => {
        const { cls, Icon } = STYLE[a.severity];
        return (
          <div key={a.id} className={cn("flex items-start gap-2 rounded-lg border px-4 py-3 text-sm", cls)} data-testid="announcement-banner">
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">{a.title}</p>
              {a.body && <p className="mt-0.5 whitespace-pre-line opacity-90">{a.body}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
