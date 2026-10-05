"use client";

import {
  ArrowLeft,
  BarChart3,
  Building2,
  FileDown,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  ScrollText,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import type { Locale } from "@/lib/i18n/locales";
import type { RootDict } from "@/lib/i18n/root-dict";
import { LanguageSelect, ThemeToggle } from "./preferences";

const ICONS = { LayoutDashboard, Users, Building2, Megaphone, FileDown, ScrollText, Settings2, BarChart3 };

export type RootNavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function RootShell({
  nav,
  t,
  locale,
  user,
  children,
}: {
  nav: { section: string; items: RootNavItem[] }[];
  t: RootDict;
  locale: Locale;
  user: { name: string; email: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  const logout = async () => {
    await api("/api/v1/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.replace("/login");
    router.refresh();
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-indigo-500">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
        <span className="font-semibold text-slate-900 dark:text-slate-50">{t.brand}</span>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Root">
        {nav.map((g) => (
          <div key={g.section}>
            <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{g.section}</p>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = item.href === "/root" ? pathname === "/root" : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpenOn(null)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium",
                        active
                          ? "bg-slate-900 text-white dark:bg-indigo-500/20 dark:text-indigo-200"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t.nav.backToApp}
        </Link>
        <div className="flex items-center gap-2 px-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{user.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.role}</p>
          </div>
          <button onClick={logout} title={t.nav.signOut} aria-label={t.nav.signOut} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpenOn(null)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl dark:bg-slate-900">
            <button onClick={() => setOpenOn(null)} className="absolute right-2 top-4 rounded-lg p-2 text-slate-500" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpenOn(pathname)} className="-ml-2 rounded-lg p-2 text-slate-600 lg:hidden dark:text-slate-300" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="hidden text-sm text-slate-500 sm:inline dark:text-slate-400">{user.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelect locale={locale} label={t.common.language} />
            <ThemeToggle labels={{ light: t.common.light, dark: t.common.dark, system: t.common.system, theme: t.common.theme }} />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
