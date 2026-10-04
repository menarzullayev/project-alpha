import Link from "next/link";
import { cn } from "@/lib/cn";

export function FilterTabs({ base, param, current, options }: { base: string; param: string; current?: string; options: { value?: string; label: string }[] }) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
      {options.map((o) => {
        const active = (current ?? "") === (o.value ?? "");
        const href = o.value ? `${base}?${param}=${o.value}` : base;
        return (
          <Link
            key={o.label}
            href={href}
            role="tab"
            aria-selected={active}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium",
              active ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
