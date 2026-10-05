import type { Metadata } from "next";
import { ThemeScope } from "@/components/root/preferences";
import { getPrefs } from "@/server/http/prefs";

export const metadata: Metadata = { title: { default: "Root", template: "%s · OpsAgent Root" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RootPanelLayout({ children }: { children: React.ReactNode }) {
  const { theme } = await getPrefs();
  return (
    <ThemeScope initial={theme} className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {children}
    </ThemeScope>
  );
}
