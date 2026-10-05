import { AppShell } from "@/components/shell/app-shell";
import { NAV } from "@/components/shell/nav";
import { getDb } from "@/server/db/client";
import { unreadCount } from "@/server/domains/notifications";
import { requirePage } from "@/server/http/page-auth";
import { can } from "@/server/rbac";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, tenant } = await requirePage("dashboard:read");
  const nav = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(tenant.role, i.permission)) })).filter((g) => g.items.length);
  const unread = await unreadCount(getDb(), tenant);
  return (
    <AppShell
      nav={nav}
      user={{ name: session.user.name, email: session.user.email }}
      org={{ id: session.org!.id, name: session.org!.name }}
      role={session.role!}
      memberships={session.memberships}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
