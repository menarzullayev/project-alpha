import type { Permission } from "@/server/rbac";

export type NavItem = { href: string; label: string; icon: string; permission: Permission };

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Operate",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", permission: "dashboard:read" },
      { href: "/conversations", label: "Conversations", icon: "MessagesSquare", permission: "crm:read" },
      { href: "/leads", label: "Leads", icon: "Target", permission: "crm:read" },
      { href: "/customers", label: "Customers", icon: "Users", permission: "crm:read" },
      { href: "/bookings", label: "Bookings", icon: "CalendarCheck", permission: "crm:read" },
    ],
  },
  {
    section: "Configure",
    items: [
      { href: "/courses", label: "Courses & slots", icon: "GraduationCap", permission: "crm:read" },
      { href: "/knowledge", label: "Knowledge base", icon: "BookOpen", permission: "crm:read" },
      { href: "/agent", label: "AI agent", icon: "Bot", permission: "crm:read" },
      { href: "/integrations", label: "Telegram", icon: "Send", permission: "crm:read" },
    ],
  },
  {
    section: "Workspace",
    items: [
      { href: "/team", label: "Team", icon: "UserCog", permission: "team:read" },
      { href: "/audit", label: "Audit log", icon: "ScrollText", permission: "audit:read" },
      { href: "/settings", label: "Settings", icon: "Settings", permission: "dashboard:read" },
    ],
  },
];
