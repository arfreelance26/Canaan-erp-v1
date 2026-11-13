"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RiTruckLine as TruckIcon, RiLayoutGridLine as GridIcon, RiListUnordered as ListIcon, type RemixiconComponentType } from "@remixicon/react";
import type { Truck } from "@/types/truck";
import { truckImageUrl } from "@/components/fleet/VehicleImages";
import { TruckThumb } from "@/components/fleet/TruckThumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

/**
 * One truck list, two layouts — Cards (a photo per truck, like Our Fleet but
 * shorter) or List (compact rows). Truck Maintenance and Truck's Fuel History
 * both use it; each page says what to show per truck (facts and buttons) once,
 * and both layouts draw from that. The choice is remembered per page, per
 * browser (useTruckView), and starts as Cards.
 */

export type TruckView = "cards" | "list";

/** The page's remembered layout. Storage can be blocked: then it's just Cards. */
export function useTruckView(page: string): [TruckView, (v: TruckView) => void] {
  const key = `truck-view:${page}`;
  const [view, setView] = useState<TruckView>("cards");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved === "cards" || saved === "list") setView(saved);
    } catch { /* storage blocked */ }
  }, [key]);
  const choose = (v: TruckView) => {
    setView(v);
    try { window.localStorage.setItem(key, v); } catch { /* storage blocked */ }
  };
  return [view, choose];
}

/** The Cards / List switch for the toolbar. */
export function TruckViewToggle({ view, onChange }: { view: TruckView; onChange: (v: TruckView) => void }) {
  const opts: [TruckView, string, RemixiconComponentType][] = [["cards", "Cards", GridIcon], ["list", "List", ListIcon]];
  return (
    <div role="radiogroup" aria-label="Layout" className="flex shrink-0 gap-0.5 rounded-full border border-separator-border bg-fill-2 p-0.5 shadow-inner">
      {opts.map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          title={`${label} view`}
          onClick={() => onChange(v)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full px-3 text-caption-1-semibold transition-colors",
            view === v ? "bg-background-primary-default text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export type TruckFact = { label: string; value: ReactNode; tone?: "warn" | "bad" | "good" | "muted" };
export type TruckAction = {
  label: string;
  icon: RemixiconComponentType;
  onClick: () => void;
  /** Button colours, e.g. "bg-accent-solid text-on-solid hover:bg-accent-solid-hover". */
  cls: string;
  badge?: number;
};
export type TruckTileContent = { facts: TruckFact[]; actions: TruckAction[] };

const TONE: Record<NonNullable<TruckFact["tone"]>, string> = {
  warn: "text-warning-text", bad: "text-danger-text", good: "text-success-text", muted: "text-text-tertiary",
};

/** "TATA MOTORS LTD nan" → "TATA MOTORS LTD": imported rows hold the text "nan" for no model. */
export function truckModel(truck: Truck): string {
  return [truck.manufacturer, truck.modelName].filter((v) => v && !["nan", "none", "null"].includes(v.trim().toLowerCase())).join(" ");
}

function ActionButton({ a, size }: { a: TruckAction; size: "card" | "row" }) {
  const Icon = a.icon;
  return (
    <button
      type="button"
      onClick={a.onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-full text-caption-1-semibold transition duration-200",
        size === "card" ? "h-9 w-full px-3" : "h-8 px-3",
        a.cls,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{a.label}</span>
      {(a.badge ?? 0) > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-background-primary-default/90 px-1.5 text-caption-2-semibold tabular-nums text-text-primary">
          {a.badge}
        </span>
      )}
    </button>
  );
}

/** Card hero: the Vehicle Identity Image (or a navy placeholder) with the registration over it. */
function CardPhoto({ truck }: { truck: Truck }) {
  const [broken, setBroken] = useState(false);
  const src = truck.truckPhotosFileName && !broken ? truckImageUrl(truck, "photo") : null;
  const model = truckModel(truck);
  return (
    <div className="relative h-72 overflow-hidden bg-accent-solid">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={truck.registrationNumber || truck.truckId} loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 pb-14 text-on-solid/25">
          <TruckIcon className="h-12 w-12" />
          <span className="text-caption-2-semibold">No vehicle image</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-scrim/80 px-4 pb-2.5 pt-8">
        <p className="truncate text-body-semibold leading-tight text-on-solid">{truck.registrationNumber || "—"}</p>
        <p className="truncate text-caption-2-regular text-on-solid/70">{truck.truckId}{model && <> · {model}</>}</p>
      </div>
    </div>
  );
}

export function TruckTiles({
  trucks,
  view,
  content,
  tile,
  emptyTitle,
  emptyDescription,
}: {
  trucks: Truck[];
  view: TruckView;
  /** What to show for each truck — the same in both layouts. */
  content: (truck: Truck) => TruckTileContent;
  /** The list view's no-photo tile colours (the page's own). */
  tile: string;
  emptyTitle: string;
  emptyDescription?: string;
}) {
  if (trucks.length === 0) {
    return <EmptyState size="compact" illustration="logistics" title={emptyTitle} description={emptyDescription} />;
  }

  if (view === "cards") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {trucks.map((truck) => {
          const { facts, actions } = content(truck);
          return (
            <div key={truck.id} className="flex flex-col overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm transition duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
              <CardPhoto truck={truck} />
              <div className="flex flex-1 flex-col gap-3 p-4">
                <dl className="flex flex-col gap-1.5 text-caption-1-regular">
                  {facts.map((f) => (
                    <div key={f.label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-text-tertiary">{f.label}</dt>
                      <dd className={cn("truncate text-right font-medium tabular-nums text-text-primary", f.tone && TONE[f.tone])}>{f.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className={cn("mt-auto grid gap-2", actions.length > 1 && "grid-cols-2")}>
                  {actions.map((a) => <ActionButton key={a.label} a={a} size="card" />)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {trucks.map((truck) => {
        const { facts, actions } = content(truck);
        const model = truckModel(truck);
        return (
          <div key={truck.id} className="flex flex-col gap-3 rounded-2xl border border-separator-border bg-background-primary-default px-4 py-3 shadow-sm transition duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] lg:flex-row lg:items-center lg:gap-5">
            <div className="flex min-w-0 items-center gap-3 lg:w-72 lg:shrink-0">
              <TruckThumb truck={truck} tile={tile} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-text-primary">{truck.registrationNumber}</p>
                <p className="truncate text-xs text-text-tertiary">{truck.truckId}{model && <> · {model}</>}</p>
              </div>
            </div>
            <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3">
              {facts.map((f) => (
                <div key={f.label} className="min-w-0">
                  <dt className="text-caption-2-medium text-text-tertiary">{f.label}</dt>
                  <dd className={cn("truncate text-caption-1-semibold tabular-nums text-text-primary", f.tone && TONE[f.tone])}>{f.value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
              {actions.map((a) => <ActionButton key={a.label} a={a} size="row" />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
