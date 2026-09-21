"use client";

import { useEffect, useState, useTransition } from "react";
import { X, type LucideIcon } from "lucide-react";
import { DatePickerInput } from "@/components/ui/DatePickerInput";

type Tone = "emerald" | "blue";
type BadgeTone = "blue" | "amber" | "emerald";

// Tailwind only generates classes it can see as literal strings, so every
// tone lives in a lookup table rather than being built at runtime.
const TONES: Record<Tone, { card: string; chip: string; count: string; tabActive: string; tabCount: string }> = {
  emerald: {
    card: "border-emerald-200/70 from-emerald-50/80",
    chip: "bg-emerald-100 text-emerald-600",
    count: "bg-emerald-100 text-emerald-700",
    tabActive: "text-emerald-700",
    tabCount: "bg-emerald-100 text-emerald-700",
  },
  blue: {
    card: "border-blue-200/70 from-blue-50/80",
    chip: "bg-blue-100 text-blue-600",
    count: "bg-blue-100 text-blue-700",
    tabActive: "text-blue-700",
    tabCount: "bg-blue-100 text-blue-700",
  },
};

const BADGES: Record<BadgeTone, string> = {
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-700",
  emerald: "bg-emerald-50 text-emerald-700",
};

export type SheetTrackingItem = {
  id: string | number;
  tripId: string;
  reference?: string | null;
  badge: { label: string; tone: BadgeTone };
  meta: { label: string; value: string }[];
};

type Props = {
  title: string;
  icon: LucideIcon;
  tone: Tone;
  total: number;
  tabs: { key: string; label: string; count: number }[];
  activeTab: string;
  onTabChange: (key: string) => void;
  dates: { label: string; value: string; onChange: (v: string) => void }[];
  /** Rows matching the current filters — shown next to an active date filter. */
  visibleCount: number;
  items: SheetTrackingItem[];
};

export function SheetTrackingCard({
  title, icon: Icon, tone, total, tabs, activeTab, onTabChange, dates, visibleCount, items,
}: Props) {
  const t = TONES[tone];
  // The selected tab is tracked locally so the control reacts on the very click;
  // the (heavier) list update in the parent runs as a low-priority transition
  // instead of blocking that paint.
  const [tab, setTab] = useState(activeTab);
  const [, startTransition] = useTransition();
  useEffect(() => { setTab(activeTab); }, [activeTab]);
  function selectTab(key: string) {
    setTab(key);
    startTransition(() => onTabChange(key));
  }
  const dateFilterActive = dates.some((d) => d.value);

  return (
    <div className={`dk-inset flex flex-col gap-3 rounded-2xl border bg-gradient-to-b to-white p-4 shadow-sm ${t.card}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${t.chip}`}>
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="truncate text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        <span className={`rounded-full px-3 py-0.5 text-sm font-bold tabular-nums ${t.count}`}>{total}</span>
      </div>

      {/* Status tabs — segmented control */}
      <div className="dk-seg flex w-fit max-w-full flex-wrap gap-0.5 rounded-full p-0.5">
        {tabs.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => selectTab(item.key)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-150 ${
                active ? `dk-seg-active shadow-sm ${t.tabActive}` : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {item.label}
              <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${active ? t.tabCount : "bg-gray-200/70 text-gray-500"}`}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Date filters — compact pills, the app's standard picker without the gold frame */}
      <div className="flex flex-wrap items-center gap-2">
        {dates.map((d) => (
          <div
            key={d.label}
            className="flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white pl-3 pr-2 shadow-sm transition-shadow hover:shadow-md [&_.border-brand-gold]:!border-0 [&_.border-brand-gold]:!bg-transparent [&_.border-brand-gold]:!px-1 [&_.border-brand-gold]:!py-1 [&_.border-brand-gold]:!shadow-none [&_.border-brand-gold_svg]:!text-gray-400 [&_input]:!text-xs [&_input]:!normal-case [&_input]:!font-medium [&_input]:!text-gray-700 [&_input::placeholder]:!font-normal [&_input::placeholder]:!text-gray-400"
          >
            <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-gray-500">{d.label}</span>
            <div className="w-[92px]">
              <DatePickerInput value={d.value} onChange={d.onChange} placeholder="" dateFormat="dd MMM yyyy" />
            </div>
            {d.value && (
              <button
                type="button"
                onClick={() => d.onChange("")}
                aria-label={`Clear ${d.label} date`}
                className="rounded-full p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {dateFilterActive && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${t.count}`}>
            {visibleCount} match{visibleCount === 1 ? "" : "es"}
          </span>
        )}
      </div>

      {/* Rows */}
      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-gray-400">No trips in this filter.</p>
      ) : (
        <ul className="custom-scrollbar flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-gray-200"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2.5">
                  <span className="shrink-0 font-semibold text-gray-900">{it.tripId}</span>
                  {it.reference && <span className="truncate font-mono text-[11px] text-gray-500">{it.reference}</span>}
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGES[it.badge.tone]}`}>
                  <span className="h-1 w-1 rounded-full bg-current" />
                  {it.badge.label}
                </span>
              </div>
              {it.meta.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-gray-500">
                  {it.meta.map((m) => (
                    <span key={m.label}>
                      {m.label} <span className="text-gray-600">{m.value}</span>
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
