"use client";

import { useState } from "react";

/** Single-series daily bar chart with hover tooltip and an accessible table fallback. */
export function DailyBars({ data, label }: { data: { day: string; value: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <figure className="relative">
      <div className="flex h-40 items-end gap-1 border-b border-slate-200" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <button
            type="button"
            key={d.day}
            className="group relative flex h-full flex-1 items-end focus:outline-none"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${fmt(d.day)}: ${d.value} ${label}`}
          >
            <span
              className={`w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-brand-700" : "bg-brand-500"}`}
              style={{ height: `${d.value === 0 ? 2 : Math.max(4, (d.value / max) * 100)}%`, opacity: d.value === 0 ? 0.25 : 1 }}
            />
          </button>
        ))}
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow"
          style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          role="status"
        >
          <span className="font-medium">{data[hover].value}</span> {label} · {fmt(data[hover].day)}
        </div>
      )}
      <div className="mt-1.5 flex justify-between text-xs text-slate-400">
        <span>{data[0] && fmt(data[0].day)}</span>
        <span>{data.at(-1) && fmt(data.at(-1)!.day)}</span>
      </div>
      <table className="sr-only">
        <caption>{label} per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Horizontal funnel: one hue, counts as text in ink colours. */
export function FunnelBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="text-sm" title={`${r.label}: ${r.value}`}>
          <div className="mb-1 flex justify-between">
            <span className="text-slate-600">{r.label}</span>
            <span className="font-medium tabular-nums text-slate-900">{r.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${r.value ? Math.max(3, (r.value / max) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
