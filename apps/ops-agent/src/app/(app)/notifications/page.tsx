import { Bell } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/ui/interactive";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getDb } from "@/server/db/client";
import { listNotifications } from "@/server/domains/notifications";
import { requirePage } from "@/server/http/page-auth";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Notifications" };

const TYPE: Record<string, [string, "blue" | "green" | "red" | "amber" | "violet"]> = {
  "lead.created": ["Lead", "blue"],
  "booking.created": ["Booking", "green"],
  "conversation.handoff": ["Handoff", "red"],
  "message.delivery_failed": ["Delivery", "amber"],
  daily_report: ["Report", "violet"],
};

export default async function NotificationsPage() {
  const { tenant } = await requirePage("dashboard:read");
  const items = await listNotifications(getDb(), tenant, 100);
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifications"
        actions={
          items.some((n) => !n.readAt) && (
            <ActionButton action="/api/v1/notifications/read" size="md">
              Mark all as read
            </ActionButton>
          )
        }
      />
      <Card>
        {items.length === 0 ? (
          <EmptyState icon={<Bell className="h-5 w-5" />} title="You're all caught up" description="New leads, bookings and handoffs will appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => {
              const [label, tone] = TYPE[n.type] ?? [n.type, "blue"];
              const body = (
                <div className="flex gap-3 px-5 py-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-500"}`} aria-label={n.readAt ? undefined : "Unread"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={tone}>{label}</Badge>
                      <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    </div>
                    {n.body && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{n.body}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                </div>
              );
              return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-slate-50">{body}</Link> : body}</li>;
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
