import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, isTheme, LOCALE_COOKIE, type Locale, type Theme, THEME_COOKIE } from "@/lib/i18n/locales";
import { ROOT_DICTS } from "@/lib/i18n/root-dict";

/** Locale: cookie, then Accept-Language, then default (uz). */
export async function getPrefs(): Promise<{ locale: Locale; theme: Theme }> {
  const store = await cookies();
  const c = store.get(LOCALE_COOKIE)?.value;
  let locale: Locale = DEFAULT_LOCALE;
  if (isLocale(c)) locale = c;
  else {
    const accept = ((await headers()).get("accept-language") ?? "").toLowerCase();
    const hit = accept.split(",").map((p) => p.trim().slice(0, 2)).find(isLocale);
    if (hit) locale = hit;
  }
  const t = store.get(THEME_COOKIE)?.value;
  return { locale, theme: isTheme(t) ? t : "system" };
}

export async function getRootT() {
  const prefs = await getPrefs();
  return { ...prefs, t: ROOT_DICTS[prefs.locale] };
}
