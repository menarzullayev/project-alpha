import { type RootNavItem, RootShell } from "@/components/root/root-shell";
import { getRootT } from "@/server/http/prefs";
import { requireRoot } from "@/server/http/root-page";
import { canPlatform, type PlatformPermission } from "@/server/platform/rbac";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { session, root } = await requireRoot("platform:read");
  const { t, locale } = await getRootT();
  const item = (href: string, label: string, icon: RootNavItem["icon"], perm: PlatformPermission) =>
    canPlatform(root.role, perm) ? [{ href, label, icon }] : [];
  const nav = [
    { section: t.nav.sections.monitor, items: [...item("/root", t.nav.overview, "LayoutDashboard", "platform:read"), ...item("/root/reports", t.nav.reports, "FileDown", "reports:read")] },
    {
      section: t.nav.sections.manage,
      items: [
        ...item("/root/users", t.nav.users, "Users", "users:read"),
        ...item("/root/organizations", t.nav.organizations, "Building2", "orgs:read"),
        ...item("/root/announcements", t.nav.announcements, "Megaphone", "platform:read"),
      ],
    },
    { section: t.nav.sections.govern, items: [...item("/root/audit", t.nav.audit, "ScrollText", "audit:read"), ...item("/root/settings", t.nav.settings, "Settings2", "platform:read")] },
  ].filter((g) => g.items.length);
  return (
    <RootShell nav={nav} t={t} locale={locale} user={{ name: session.user.name, email: session.user.email, role: t.roles[root.role] }}>
      {children}
    </RootShell>
  );
}
