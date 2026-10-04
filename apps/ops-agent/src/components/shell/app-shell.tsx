"use client";

import {
  Bell,
  BookOpen,
  Bot,
  CalendarCheck,
  ChevronsUpDown,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  ScrollText,
  Send,
  Settings,
  Target,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import type { NavItem } from "./nav";

const ICONS = { LayoutDashboard, MessagesSquare, Target, Users, CalendarCheck, GraduationCap, BookOpen, Bot, Send, UserCog, ScrollText, Settings };

type Props = {
  nav: { section: string; items: NavItem[] }[];
  user: { name: string; email: string };
  org: { id: string; name: string };
  role: string;
  memberships: { orgId: string; orgName: string; role: string }[];
  unread: number;
  children: React.ReactNode;
};

export function AppShell({ nav, user, org, role, memberships, unread, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  // The mobile drawer belongs to the page it was opened on: navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);

  const logout = async () => {
    await api("/api/v1/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.replace("/login");
    router.refresh();
  };
  const switchOrg = async (orgId: string) => {
    if (orgId === org.id) return;
    await api("/api/v1/auth/switch-org", { body: { orgId } });
    router.replace("/dashboard");
    router.refresh();
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Bot className="h-5 w-5" />
        </span>
        <span className="font-semibold text-slate-900">OpsAgent</span>
      </div>
      <div className="px-3">
        <label className="relative block">
          <span className="sr-only">Workspace</span>
          <select
            value={org.id}
            onChange={(e) => switchOrg(e.target.value)}
            className="h-10 w-full appearance-none truncate rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm font-medium text-slate-800"
            aria-label="Switch workspace"
          >
            {memberships.map((m) => (
              <option key={m.orgId} value={m.orgId}>
                {m.orgName}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-slate-400" />
        </label>
      </div>
      <nav className="mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Main">
        {nav.map((group) => (
          <div key={group.section}>
            <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-slate-400">{group.section}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon as keyof typeof ICONS] ?? LayoutDashboard;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium",
                        active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-2">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs capitalize text-slate-500">{role}</p>
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-2 top-4 rounded-lg p-2 text-slate-500" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button onClick={() => setOpen(true)} className="-ml-2 rounded-lg p-2 text-slate-600 lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="truncate text-sm font-medium text-slate-700">{org.name}</span>
          </div>
          <Link href="/notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications (${unread} unread)`}>
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
