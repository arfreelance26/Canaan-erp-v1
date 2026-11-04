"use client";

import { useEffect, useState, useTransition } from "react";
import { RiCloseLine as X, type RemixiconComponentType as LucideIcon } from "@remixicon/react";
import { DatePickerInput } from "@/components/ui/DatePickerInput";

type Tone = "emerald" | "blue";
type BadgeTone = "blue" | "amber" | "emerald";

// Tailwind only generates classes it can see as literal strings, so every
// tone lives in a lookup table rather than being built at runtime.
const TONES: Record<Tone, { card: string; chip: string; count: string; tabActive: string; tabCount: string }> = {
  emerald: {
    card: "border-success-border/70",
    chip: "bg-success-surface-strong text-success-text",
    count: "bg-success-surface-strong text-success-text",
    tabActive: "text-success-text",
    tabCount: "bg-success-surface-strong text-success-text",
  },
  blue: {
    card: "border-accent-border/70",
    chip: "bg-accent-surface-strong text-accent-text",
    count: "bg-accent-surface-strong text-accent-text",
    tabActive: "text-accent-text",
    tabCount: "bg-accent-surface-strong text-accent-text",
  },
};

const BADGES: Record<BadgeTone, string> = {
  blue: "bg-accent-surface text-accent-text",
  amber: "bg-warning-surface text-warning-text",
  emerald: "bg-success-surface text-success-text",
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
    <div className={`flex flex-col gap-3 rounded-2xl border bg-background-primary-default p-4 shadow-sm ${t.card}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${t.chip}`}>
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="truncate text-body-semibold text-text-primary">{title}</h3>
        </div>
        <span className={`rounded-full px-3 py-0.5 text-body-semibold tabular-nums ${t.count}`}>{total}</span>
      </div>

      {/* Status tabs — segmented control */}
      <div className="seg-track flex w-fit max-w-full flex-wrap gap-0.5 rounded-lg p-0.5">
        {tabs.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => selectTab(item.key)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-caption-1-medium transition-colors duration-150 ${
                active ? `seg-thumb ${t.tabActive}` : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {item.label}
              <span className={`rounded-full px-1.5 text-caption-2-semibold tabular-nums ${active ? t.tabCount : "bg-fill-3 text-text-secondary"}`}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Date filters — compact pills holding the app's date picker in its frameless "bare" form */}
      <div className="flex flex-wrap items-center gap-2">
        {dates.map((d) => (
          <div
            key={d.label}
            className="flex h-8 items-center gap-1 rounded-full border border-separator-border bg-background-primary-default pl-3 pr-1.5 shadow-xs transition-colors hover:border-border-button-hover"
          >
            <span className="whitespace-nowrap text-caption-2-semibold text-text-secondary">{d.label}</span>
            <div className="w-[104px] [&_button>span]:text-caption-1-medium">
              <DatePickerInput
                variant="bare"
                value={d.value}
                onChange={d.onChange}
                placeholder="Any date"
                aria-label={d.label}
                dateFormat="dd MMM yyyy"
                clearable={false}
              />
            </div>
            {d.value && (
              <button
                type="button"
                onClick={() => d.onChange("")}
                aria-label={`Clear ${d.label} date`}
                className="rounded-full p-0.5 text-text-tertiary transition-colors hover:bg-fill-3 hover:text-text-secondary"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {dateFilterActive && (
          <span className={`rounded-full px-2 py-0.5 text-caption-2-semibold tabular-nums ${t.count}`}>
            {visibleCount} match{visibleCount === 1 ? "" : "es"}
          </span>
        )}
      </div>

      {/* Rows */}
      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-tertiary">No trips in this filter.</p>
      ) : (
        <ul className="custom-scrollbar flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-xl border border-separator-border bg-background-primary-default px-3 py-2 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-separator-border"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-baseline gap-2.5">
                  <span className="shrink-0 font-semibold text-text-primary">{it.tripId}</span>
                  {it.reference && <span className="truncate font-mono text-[11px] text-text-secondary">{it.reference}</span>}
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-caption-2-semibold ${BADGES[it.badge.tone]}`}>
                  <span className="h-1 w-1 rounded-full bg-current" />
                  {it.badge.label}
                </span>
              </div>
              {it.meta.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-text-secondary">
                  {it.meta.map((m) => (
                    <span key={m.label}>
                      {m.label} <span className="text-text-secondary">{m.value}</span>
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
