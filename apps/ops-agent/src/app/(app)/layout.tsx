import { AppShell } from "@/components/shell/app-shell";
import { PlatformBanners } from "@/components/shell/platform-banners";
import { NAV } from "@/components/shell/nav";
import { getDb } from "@/server/db/client";
import { unreadCount } from "@/server/domains/notifications";
import { requirePage } from "@/server/http/page-auth";
import { activeAnnouncementsFor } from "@/server/platform/announcements";
import { getSetting } from "@/server/platform/settings";
import { can } from "@/server/rbac";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, tenant } = await requirePage("dashboard:read");
  const nav = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(tenant.role, i.permission)) })).filter((g) => g.items.length);
  const db = getDb();
  const [unread, maintenance, announcements] = await Promise.all([
    unreadCount(db, tenant),
    getSetting(db, "maintenanceMessage"),
    activeAnnouncementsFor(db, tenant.role),
  ]);
  return (
    <AppShell
      nav={nav}
      user={{ name: session.user.name, email: session.user.email }}
      org={{ id: session.org!.id, name: session.org!.name }}
      role={session.role!}
      memberships={session.memberships}
      unread={unread}
    >
      <PlatformBanners maintenance={maintenance} announcements={announcements.map((a) => ({ id: a.id, title: a.title, body: a.body, severity: a.severity }))} />
      {children}
    </AppShell>
  );
}
