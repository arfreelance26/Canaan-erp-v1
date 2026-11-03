"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RiRecordCircleLine as CircleDot, RiStackLine as Boxes, RiToolsLine as Wrench, RiAlertLine as AlertTriangle, RiBarChartBoxLine as BarChart3, RiShieldCheckLine as ShieldCheck, RiCheckboxCircleLine as CheckCircle2, RiTimeLine as Clock, RiArrowRightDownLine as TrendingDown, RiCalendarLine as Calendar, RiDashboard3Line as Gauge, RiSearchLine as Search, RiCloseLine as X, RiCheckLine as Check, RiArrowRightLine as ArrowRight } from "@remixicon/react";
import { tyreApi, trucksApi, maintenanceApi } from "@/lib/api";
import { showError } from "@/lib/feedback";
import { CurrentTripsCard } from "./CurrentTripsCard";
import { FleetStatusPanel } from "./FleetStatusPanel";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { formatDate } from "@/lib/format-date";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { Truck as TruckType } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";


import { EmptyState } from "@/components/ui/EmptyState";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { plural } from "@/lib/plural";
import { PagedTbody } from "@/components/ui/PagedTbody";
const QUICK_LINKS = [
  { label: "Tyre Management",   href: "/maintenance/tyre-management",  icon: CircleDot, color: "bg-accent-surface text-accent-text border-accent-border" },
  { label: "Tyre Inventory",    href: "/maintenance/tyre-inventory",   icon: Boxes,     color: "bg-purple-surface text-purple-text border-purple-border" },
  { label: "Truck Maintenance", href: "/maintenance/trucks",           icon: Wrench,    color: "bg-warning-surface text-warning-text border-warning-border" },
];

const PANEL_TONE = {
  purple: { border: "border-purple-border/70", head: "", chip: "bg-purple-surface-strong text-purple-text" },
  emerald: { border: "border-success-border/70", head: "", chip: "bg-success-surface-strong text-success-text" },
  blue: { border: "border-accent-border/70", head: "", chip: "bg-accent-surface-strong text-accent-text" },
  red: { border: "border-danger-border/70", head: "", chip: "bg-danger-surface-strong text-danger-text" },
  amber: { border: "border-warning-border/70", head: "", chip: "bg-warning-surface-strong text-warning-text" },
} as const;

const HEADER_LINK =
  "group flex h-8 items-center gap-1.5 rounded-full border border-separator-border bg-background-primary-default px-3.5 text-caption-1-semibold text-text-primary shadow-sm transition duration-300 hover:shadow-md";

function AllClear({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-surface-strong text-success-text ring-8 ring-success-border">
        <Check className="h-7 w-7" strokeWidth={2.5} />
      </span>
      <div>
        <p className="text-body-semibold text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary">{text}</p>
      </div>
    </div>
  );
}

function Panel({ icon: Icon, title, subtitle, tone, right, className = "", children }: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  tone: keyof typeof PANEL_TONE;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const c = PANEL_TONE[tone];
  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl border bg-background-primary-default shadow-sm ${c.border} ${className}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-separator-border ${c.head} px-5 py-3.5`}>
        <div className="flex items-center gap-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${c.chip}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-body-semibold text-text-primary">{title}</h2>
            {subtitle && <p className="text-xs text-text-secondary">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="flex-1 p-4">{children}</div>
    </div>
  );
}

type Health = "replace" | "critical" | "wear" | "good";
const HEALTH_META: Record<Health, { label: string; pill: string; bar: string; chip: string; active: string }> = {
  replace: { label: "Replace", pill: "bg-danger-surface text-danger-text", bar: "bg-danger-solid", chip: "bg-danger-surface text-danger-text", active: "bg-danger-solid text-on-solid" },
  critical: { label: "Critical", pill: "bg-orange-surface text-orange-text", bar: "bg-orange-solid", chip: "bg-orange-surface text-orange-text", active: "bg-orange-solid text-on-solid" },
  wear: { label: "Wear", pill: "bg-warning-surface text-warning-text", bar: "bg-warning-solid", chip: "bg-warning-surface text-warning-text", active: "bg-warning-solid text-on-solid" },
  good: { label: "Good", pill: "bg-success-surface text-success-text", bar: "bg-success-solid", chip: "bg-success-surface text-success-text", active: "bg-success-solid text-on-solid" },
};
const healthOf = (pct: number | null): Health | null =>
  pct === null ? null : pct <= 0 ? "replace" : pct <= 20 ? "critical" : pct <= 50 ? "wear" : "good";

export function TyreManagerDashboard() {
  const [inventory, setInventory]   = useState<TyreInventoryItem[]>([]);
  const [available, setAvailable]   = useState<TyreInventoryItem[]>([]);
  const [fitments, setFitments]     = useState<TyreFitmentRecord[]>([]);
  const [trucks, setTrucks]         = useState<TruckType[]>([]);
  const [records, setRecords]       = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [healthFilter, setHealthFilter] = useState<Health | null>(null);
  const [tyreQuery, setTyreQuery] = useState("");

  useEffect(() => {
    // allSettled, not all — a failed call (e.g. right after relogin) must not
    // blank the whole dashboard; each section keeps its last-known-good state
    // and a toast names what didn't refresh.
    Promise.allSettled([
      tyreApi.listInventory(),
      tyreApi.availableInventory(),
      tyreApi.listFitments(undefined, true),
      trucksApi.list(),
      maintenanceApi.listRecords(),
    ])
      .then(([inv, avail, fits, trks, recs]) => {
        const failed: string[] = [];
        if (inv.status === "fulfilled") setInventory(inv.value); else failed.push("Tyre Inventory");
        if (avail.status === "fulfilled") setAvailable(avail.value); else failed.push("Available Inventory");
        if (fits.status === "fulfilled") setFitments(fits.value); else failed.push("Tyre Fitments");
        if (trks.status === "fulfilled") setTrucks(trks.value); else failed.push("Trucks");
        if (recs.status === "fulfilled") setRecords(recs.value); else failed.push("Maintenance Records");
        if (failed.length > 0) {
          showError(`Couldn't refresh ${failed.join(", ")} — showing last known data.`);
        }
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useWebSocketEvent("tyre_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("maintenance_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));

  const truckByDbId  = useMemo(() => new Map(trucks.map((t) => [t.id, t])),  [trucks]);
  const tyreByDbId   = useMemo(() => new Map(inventory.map((t) => [t.id, t])), [inventory]);

  const totalTyres     = inventory.length;
  const fittedCount    = fitments.length;
  const availableCount = available.length;
  const newCount       = inventory.filter((t) => t.condition === "New").length;
  const retreadCount   = inventory.filter((t) => t.condition === "Rethreaded").length;


  const topBrands = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of inventory) map.set(t.brand, (map.get(t.brand) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [inventory]);

  type LifeRow = { f: TyreFitmentRecord; tyre: TyreInventoryItem; truck: TruckType; kmDriven: number; remaining: number | null; lifePct: number | null };

  const tyreLifeRows = useMemo<LifeRow[]>(() => {
    return fitments
      .map((f): LifeRow | null => {
        const tyre  = tyreByDbId.get(f.tyreId);
        const truck = truckByDbId.get(f.truckId);
        if (!tyre || !truck) return null;
        const rangeKm   = Number(tyre.rangeKm) || 0;
        const kmDriven  = Math.max(0, Number(truck.odometer) - f.fittedOdometer);
        const remaining = rangeKm > 0 ? rangeKm - kmDriven : null;
        const lifePct   = rangeKm > 0 ? Math.max(0, Math.round(((rangeKm - kmDriven) / rangeKm) * 100)) : null;
        return { f, tyre, truck, kmDriven, remaining, lifePct };
      })
      .filter((r): r is LifeRow => r !== null)
      .sort((a, b) => (a.lifePct ?? 100) - (b.lifePct ?? 100));
  }, [fitments, tyreByDbId, truckByDbId]);

  const recentRecords = useMemo(() =>
    [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [records]
  );

  const criticalTyres = tyreLifeRows.filter((r) => r.lifePct !== null && r.lifePct <= 20).length;

  const healthCounts = useMemo(() => {
    const c: Record<Health, number> = { replace: 0, critical: 0, wear: 0, good: 0 };
    for (const r of tyreLifeRows) {
      const h = healthOf(r.lifePct);
      if (h) c[h] += 1;
    }
    return c;
  }, [tyreLifeRows]);

  const visibleLifeRows = useMemo(() => {
    const q = tyreQuery.trim().toLowerCase();
    return tyreLifeRows.filter((r) => {
      if (healthFilter && healthOf(r.lifePct) !== healthFilter) return false;
      if (!q) return true;
      return (
        r.truck.truckId.toLowerCase().includes(q) ||
        r.truck.registrationNumber.toLowerCase().includes(q) ||
        r.tyre.tyreNumber.toLowerCase().includes(q) ||
        r.tyre.brand.toLowerCase().includes(q) ||
        (r.f.position || "").toLowerCase().includes(q)
      );
    });
  }, [tyreLifeRows, healthFilter, tyreQuery]);

  const otherBrandCount = useMemo(() => {
    const shown = topBrands.reduce((a, [, n]) => a + n, 0);
    return Math.max(0, totalTyres - shown);
  }, [topBrands, totalTyres]);

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <DashboardHero
        role="Maintenance"
        description={
          loading
            ? "Loading tyres and maintenance…"
            : `${plural(totalTyres, "tyre")} · ${fittedCount} fitted · ${availableCount} in stock across ${plural(trucks.length, "truck")}`
        }
        actions={
          !loading && criticalTyres > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-danger-border bg-danger-surface px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-danger-text" />
              <span className="text-caption-1-semibold text-danger-text">{criticalTyres} tyre{criticalTyres > 1 ? "s" : ""} need immediate replacement</span>
            </div>
          )
        }
      />

      {/* Current Trips */}
      <CurrentTripsCard />

      <Separator />

      {/* Stat cards */}
      <FleetStatusPanel
        segments={[
          {
            key: "total-tyres", kind: "count",
            label: "Total tyres", icon: Boxes,
            value: loading ? "—" : String(totalTyres),
          },
          {
            key: "fitted-on-trucks", kind: "count",
            label: "Fitted on trucks", icon: CircleDot,
            value: loading ? "—" : String(fittedCount),
            caption: loading ? "" : `${trucks.length} trucks`,
          },
          {
            key: "in-stock", kind: "count",
            label: "In stock", icon: CheckCircle2,
            value: loading ? "—" : String(availableCount),
            tone: "good",
            caption: "Ready to fit",
          },
        ]}
      />

      {/* Quick Access */}
      <div>
        <h2 className="mb-3 text-body-semibold text-text-tertiary">Quick Access</h2>
        <div className="grid grid-cols-3 gap-3 sm:max-w-md">
          {QUICK_LINKS.map(({ label, href, icon: Icon, color }) => (
            <Link key={href} href={href}
              className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-center text-caption-1-semibold transition hover:shadow-md ${color}`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Tyre Life + Inventory Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Tyre Life Status — wide */}
        <Panel
          className="lg:col-span-2"
          tone="purple"
          icon={Gauge}
          title="Tyre Life Status"
          subtitle={
            loading
              ? "Loading…"
              : `${fittedCount} tyres fitted${healthCounts.replace + healthCounts.critical > 0 ? ` · ${healthCounts.replace + healthCounts.critical} need attention` : ""}`
          }
          right={
            <label
              className={`flex h-8 cursor-text items-center overflow-hidden rounded-full border border-separator-border bg-background-primary-default text-text-tertiary shadow-sm transition duration-300 hover:border-border-button-default focus-within:border-purple-border-strong focus-within:ring-2 focus-within:ring-purple-border ${
                tyreQuery ? "w-56" : "w-8 hover:w-56 focus-within:w-56"
              }`}
            >
              <Search className="ml-[9px] h-3.5 w-3.5 shrink-0" />
              <input
                value={tyreQuery}
                onChange={(e) => setTyreQuery(e.target.value)}
                placeholder="Search tyres…"
                aria-label="Search tyres"
                className="ml-2 min-w-0 flex-1 bg-transparent pr-2 text-xs text-text-primary outline-none placeholder:text-text-placeholder"
              />
              {tyreQuery && (
                <button type="button" onClick={(e) => { e.preventDefault(); setTyreQuery(""); }} aria-label="Clear search" className="mr-2 shrink-0 text-text-tertiary hover:text-text-secondary">
                  <X className="h-3 w-3" />
                </button>
              )}
            </label>
          }
        >
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
          ) : tyreLifeRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-tertiary">No tyres currently fitted.</p>
          ) : (
            <>
              {/* Health chips — click to filter, click again to clear */}
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {(Object.keys(HEALTH_META) as Health[])
                  .filter((h) => healthCounts[h] > 0)
                  .map((h) => {
                    const active = healthFilter === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setHealthFilter((prev) => (prev === h ? null : h))}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-2 rounded-full py-0.5 pl-3 pr-0.5 text-caption-2-semibold transition-colors duration-150 ${
                          active ? HEALTH_META[h].active : `${HEALTH_META[h].chip} hover:brightness-95`
                        }`}
                      >
                        {HEALTH_META[h].label}
                        <span className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-caption-2-semibold tabular-nums ${active ? "bg-on-solid/25 text-on-solid" : "bg-background-primary-default"}`}>
                          {healthCounts[h]}
                        </span>
                      </button>
                    );
                  })}
                {healthFilter && (
                  <button type="button" onClick={() => setHealthFilter(null)} className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold text-text-tertiary transition-colors hover:bg-fill-3 hover:text-text-secondary">
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-separator-border">
                <div className="custom-scrollbar max-h-[465px] overflow-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-separator-border bg-fill-1">
                        {["Truck", "Position", "Tyre No.", "Brand", "Km Driven", "Life left", "Status"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-caption-2-semibold text-text-secondary">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <PagedTbody className="divide-y divide-separator-border" items={visibleLifeRows} head={<>{visibleLifeRows.length === 0 ? (
                        <tr><td colSpan={7} className="p-0"><EmptyState size="compact" illustration="not-found" title="No tyres match this filter" /></td></tr>
                      ) : null}</>}>
                      {({ f, tyre, truck, kmDriven, remaining, lifePct }) => {
                          const h = healthOf(lifePct);
                          return (
                            <tr key={f.id} className="transition-colors hover:bg-fill-2">
                              <td className="px-4 py-2.5">
                                <p className="font-semibold text-text-primary">{truck.truckId}</p>
                                <p className="text-[10px] text-text-tertiary">{truck.registrationNumber}</p>
                              </td>
                              <td className="px-4 py-2.5 font-medium text-text-primary">{f.position}</td>
                              <td className="px-4 py-2.5 font-mono text-[11px] text-text-secondary">{tyre.tyreNumber}</td>
                              <td className="px-4 py-2.5 text-text-secondary">{tyre.brand}</td>
                              <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-text-primary">{kmDriven.toLocaleString("en-IN")} km</td>
                              <td className="min-w-[130px] px-4 py-2.5">
                                {remaining !== null && lifePct !== null && h ? (
                                  <div className="flex flex-col gap-1">
                                    <span className={`tabular-nums ${remaining <= 0 ? "font-semibold text-danger-text" : remaining <= 5000 ? "font-semibold text-orange-text" : "text-text-primary"}`}>
                                      {remaining <= 0 ? "Overdue" : `${remaining.toLocaleString("en-IN")} km`}
                                    </span>
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill-3">
                                      <div className={`h-full rounded-full ${HEALTH_META[h].bar}`} style={{ width: `${Math.max(lifePct, remaining <= 0 ? 100 : 4)}%`, opacity: remaining <= 0 ? 0.35 : 1 }} />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-text-tertiary">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                {h ? (
                                  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption-2-semibold ${HEALTH_META[h].pill}`}>
                                    {h === "replace" ? <AlertTriangle className="h-3 w-3" /> : h === "critical" ? <TrendingDown className="h-3 w-3" /> : <i className="h-1.5 w-1.5 rounded-full bg-current" />}
                                    {HEALTH_META[h].label}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-text-tertiary">N/A</span>
                                )}
                              </td>
                            </tr>
                          );
                        }}
                    </PagedTbody>
                  </table>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-text-secondary">
                Showing <span className="font-semibold tabular-nums text-text-primary">{visibleLifeRows.length}</span> of {tyreLifeRows.length} fitted tyres · shortest life first
              </p>
            </>
          )}
        </Panel>

        {/* Inventory Breakdown — narrow */}
        <div className="flex flex-col gap-4">
          {/* Condition */}
          <Panel tone="emerald" icon={ShieldCheck} title="Tyre Condition" subtitle="New vs rethreaded" className="flex-1">
            {loading ? (
              <div className="space-y-3"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-full" /></div>
            ) : totalTyres === 0 ? (
              <p className="text-sm text-text-tertiary">No tyres.</p>
            ) : (
              <div className="flex flex-col gap-3.5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-display-4-semibold tabular-nums text-text-primary">{totalTyres}</p>
                    <p className="text-xs text-text-secondary">tyres in inventory</p>
                  </div>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-fill-3">
                  <div className="h-full bg-success-solid transition duration-700" style={{ width: `${(newCount / totalTyres) * 100}%` }} />
                  <div className="h-full bg-warning-solid transition duration-700" style={{ width: `${(retreadCount / totalTyres) * 100}%` }} />
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    { label: "New", n: newCount, dot: "bg-success-solid" },
                    { label: "Rethreaded", n: retreadCount, dot: "bg-warning-solid" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-text-secondary"><i className={`h-2 w-2 rounded-full ${r.dot}`} />{r.label}</span>
                      <span className="font-semibold tabular-nums text-text-primary">
                        {r.n} <span className="font-normal text-text-tertiary">({Math.round((r.n / totalTyres) * 100)}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-purple-border bg-purple-surface px-3 py-2">
                    <p className="text-caption-2-semibold text-purple-text">Fitted</p>
                    <p className="text-title-3-semibold tabular-nums text-text-primary">{fittedCount}</p>
                  </div>
                  <div className="rounded-xl border border-success-border bg-success-surface px-3 py-2">
                    <p className="text-caption-2-semibold text-success-text">In stock</p>
                    <p className="text-title-3-semibold tabular-nums text-text-primary">{availableCount}</p>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          {/* Top Brands */}
          <Panel tone="blue" icon={BarChart3} title="Top Brands" subtitle="Share of all tyres" className="flex-1">
            {loading ? (
              <div className="space-y-3"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-full" /></div>
            ) : topBrands.length === 0 ? (
              <p className="text-sm text-text-tertiary">No data.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {topBrands.map(([brand, count], i) => {
                  const pct = totalTyres > 0 ? Math.round((count / totalTyres) * 100) : 0;
                  return (
                    <div key={brand} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-medium text-text-primary">
                          <span className="w-3 text-caption-2-semibold tabular-nums text-text-tertiary">{i + 1}</span>
                          {brand}
                        </span>
                        <span className="font-semibold tabular-nums text-text-primary">
                          {count} <span className="font-normal text-text-tertiary">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-fill-3">
                        <div
                          className={`h-full rounded-full bg-accent-solid transition duration-700 ${i === 0 ? " " : " "}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {otherBrandCount > 0 && (
                  <p className="text-[11px] text-text-secondary">+ {otherBrandCount} tyres from other brands</p>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Recent Service */}
      <div className="grid grid-cols-1 gap-4">

        {/* Recent maintenance */}
        <Panel
          tone="blue"
          icon={Clock}
          title="Recent Maintenance"
          subtitle={
            loading || recentRecords.length === 0
              ? "Latest service records"
              : `Last ${recentRecords.length} · ₹${recentRecords.reduce((a, r) => a + (Number(r.cost) || 0), 0).toLocaleString("en-IN")}`
          }
          right={
            <Link href="/maintenance/truck-records" className={HEADER_LINK}>
              All records <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300" />
            </Link>
          }
        >
          {loading ? (
            <div className="space-y-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
          ) : recentRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-fill-2 text-text-tertiary ring-8 ring-separator-border">
                <Calendar className="h-6 w-6" />
              </span>
              <p className="text-sm text-text-secondary">No maintenance records yet</p>
            </div>
          ) : (
            <ul className="custom-scrollbar flex max-h-[300px] flex-col gap-1.5 overflow-y-auto pr-1">
              {recentRecords.map((r) => {
                const truck = truckByDbId.get(r.truckId);
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl border border-separator-border bg-background-primary-default px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-accent-border">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-surface-strong text-accent-text">
                      <Wrench className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-caption-1-semibold text-text-primary">{r.maintenanceType}</p>
                      <p className="truncate text-[11px] text-text-secondary">
                        {truck ? `${truck.truckId} · ${truck.registrationNumber}` : r.truckId}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-caption-1-semibold tabular-nums text-text-primary">
                        {r.cost ? `₹${Number(r.cost).toLocaleString("en-IN")}` : "—"}
                      </p>
                      <p className="text-[10px] tabular-nums text-text-secondary">{formatDate(r.date)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

    </div>
  );
}
