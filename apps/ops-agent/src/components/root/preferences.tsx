"use client";

import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { LOCALE_COOKIE, LOCALE_LABELS, LOCALES, type Locale, type Theme, THEME_COOKIE } from "@/lib/i18n/locales";
import { cn } from "@/lib/cn";

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function subscribeDark(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: "system", setTheme: () => {} });

/** Applies the `dark` class to its own subtree only (the root panel). */
export function ThemeScope({ initial, children, className }: { initial: Theme; children: ReactNode; className?: string }) {
  const [theme, setThemeState] = useState<Theme>(initial);
  const systemDark = useSyncExternalStore(subscribeDark, () => window.matchMedia("(prefers-color-scheme: dark)").matches, () => false);
  const dark = theme === "dark" || (theme === "system" && systemDark);
  useEffect(() => {
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    return () => {
      document.documentElement.style.colorScheme = "";
    };
  }, [dark]);
  const setTheme = (t: Theme) => {
    setCookie(THEME_COOKIE, t);
    setThemeState(t);
  };
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className={cn(dark && "dark", className)} data-testid="theme-scope">
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function ThemeToggle({ labels }: { labels: { light: string; dark: string; system: string; theme: string } }) {
  const { theme, setTheme } = useContext(ThemeContext);
  const opts: { v: Theme; icon: typeof Sun; label: string }[] = [
    { v: "light", icon: Sun, label: labels.light },
    { v: "dark", icon: Moon, label: labels.dark },
    { v: "system", icon: Monitor, label: labels.system },
  ];
  return (
    <div role="radiogroup" aria-label={labels.theme} className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
      {opts.map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={theme === v}
          title={label}
          onClick={() => setTheme(v)}
          className={cn(
            "rounded-md p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
            theme === v && "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function LanguageSelect({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  return (
    <label className="relative inline-flex items-center">
      <Languages className="pointer-events-none absolute left-2 h-4 w-4 text-slate-400" aria-hidden />
      <select
        aria-label={label}
        value={locale}
        onChange={(e) => {
          setCookie(LOCALE_COOKIE, e.target.value);
          router.refresh();
        }}
        className="h-8 appearance-none rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
