"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CircleDot,
  Boxes,
  Wrench,
  AlertTriangle,
  BarChart3,
  ShieldCheck,
  CheckCircle2,
  Clock,
  TrendingDown,
  Calendar,
  Gauge,
  Filter,
  Search,
  X,
  Check,
  ArrowRight,
} from "lucide-react";
import { tyreApi, trucksApi, maintenanceApi } from "@/lib/api";
import { showError } from "@/lib/swal";
import { CurrentTripsCard } from "./CurrentTripsCard";
import { StatCard } from "./StatCard";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { getMaintenanceStatus } from "@/lib/truck-maintenance-data";
import { getAirFilterAlerts } from "@/lib/air-filter-alerts";
import { formatDate } from "@/lib/format-date";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { Truck as TruckType } from "@/types/truck";
import type { MaintenanceRecord, MaintenanceStatusItem, AirFilterRecord } from "@/types/truck-maintenance";


const QUICK_LINKS = [
  { label: "Tyre Management",   href: "/maintenance/tyre-management",  icon: CircleDot, color: "bg-blue-50 text-blue-600 border-blue-200" },
  { label: "Tyre Inventory",    href: "/maintenance/tyre-inventory",   icon: Boxes,     color: "bg-violet-50 text-violet-600 border-violet-200" },
  { label: "Truck Maintenance", href: "/maintenance/trucks",           icon: Wrench,    color: "bg-amber-50 text-amber-600 border-amber-200" },
];

const PANEL_TONE = {
  purple: { border: "border-purple-200/70", head: "from-purple-50/70", chip: "bg-purple-100 text-purple-600" },
  emerald: { border: "border-emerald-200/70", head: "from-emerald-50/70", chip: "bg-emerald-100 text-emerald-600" },
  blue: { border: "border-blue-200/70", head: "from-blue-50/70", chip: "bg-blue-100 text-blue-600" },
  red: { border: "border-red-200/70", head: "from-red-50/70", chip: "bg-red-100 text-red-600" },
  amber: { border: "border-amber-200/70", head: "from-amber-50/70", chip: "bg-amber-100 text-amber-600" },
} as const;

const HEADER_LINK =
  "group flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md";

function AllClear({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
        <Check className="h-7 w-7" strokeWidth={2.5} />
      </span>
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{text}</p>
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
    <div className={`dk-inset flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm ${c.border} ${className}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r ${c.head} via-white to-white px-5 py-3.5`}>
        <div className="flex items-center gap-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${c.chip}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
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
  replace: { label: "Replace", pill: "bg-red-50 text-red-700", bar: "bg-red-500", chip: "bg-red-50 text-red-700", active: "bg-red-600 text-white" },
  critical: { label: "Critical", pill: "bg-orange-50 text-orange-700", bar: "bg-orange-500", chip: "bg-orange-50 text-orange-700", active: "bg-orange-500 text-white" },
  wear: { label: "Wear", pill: "bg-amber-50 text-amber-700", bar: "bg-amber-400", chip: "bg-amber-50 text-amber-700", active: "bg-amber-500 text-white" },
  good: { label: "Good", pill: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", active: "bg-emerald-600 text-white" },
};
const healthOf = (pct: number | null): Health | null =>
  pct === null ? null : pct <= 0 ? "replace" : pct <= 20 ? "critical" : pct <= 50 ? "wear" : "good";

export function TyreManagerDashboard() {
  const [inventory, setInventory]   = useState<TyreInventoryItem[]>([]);
  const [available, setAvailable]   = useState<TyreInventoryItem[]>([]);
  const [fitments, setFitments]     = useState<TyreFitmentRecord[]>([]);
  const [trucks, setTrucks]         = useState<TruckType[]>([]);
  const [records, setRecords]       = useState<MaintenanceRecord[]>([]);
  const [airFilterRecords, setAirFilterRecords] = useState<AirFilterRecord[]>([]);
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
      maintenanceApi.listAirFilterRecords(),
    ])
      .then(([inv, avail, fits, trks, recs, afRecs]) => {
        const failed: string[] = [];
        if (inv.status === "fulfilled") setInventory(inv.value); else failed.push("Tyre Inventory");
        if (avail.status === "fulfilled") setAvailable(avail.value); else failed.push("Available Inventory");
        if (fits.status === "fulfilled") setFitments(fits.value); else failed.push("Tyre Fitments");
        if (trks.status === "fulfilled") setTrucks(trks.value); else failed.push("Trucks");
        if (recs.status === "fulfilled") setRecords(recs.value); else failed.push("Maintenance Records");
        if (afRecs.status === "fulfilled") setAirFilterRecords(afRecs.value); else failed.push("Air Filter Records");
        if (failed.length > 0) {
          showError(`Couldn't refresh ${failed.join(", ")} — showing last known data.`);
        }
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useWebSocketEvent("tyre_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("maintenance_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("air_filter_updated", () => setRefreshKey(k => k + 1));

  const truckByDbId  = useMemo(() => new Map(trucks.map((t) => [t.id, t])),  [trucks]);
  const tyreByDbId   = useMemo(() => new Map(inventory.map((t) => [t.id, t])), [inventory]);

  const totalTyres     = inventory.length;
  const fittedCount    = fitments.length;
  const availableCount = available.length;
  const newCount       = inventory.filter((t) => t.condition === "New").length;
  const retreadCount   = inventory.filter((t) => t.condition === "Rethreaded").length;

  const allAlerts = useMemo<MaintenanceStatusItem[]>(() => {
    return trucks.flatMap((t) => getMaintenanceStatus(t, records)).filter((s) => s.status === "attention");
  }, [trucks, records]);

  // Air filter change alerts — latest log's next-change target vs. each
  // truck's live Current Odometer (updated after every trip).
  const airFilterAlerts = useMemo(
    () => getAirFilterAlerts(trucks, airFilterRecords),
    [trucks, airFilterRecords]
  );

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white text-orange-600 shadow-sm">
              <Wrench className="h-5 w-5" />
            </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Maintenance Dashboard</h1>
            <p className="mt-0.5 text-sm text-gray-500">Fleet tyre health, fitment status, and maintenance overview</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!loading && criticalTyres > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-xs font-semibold text-red-700">{criticalTyres} tyre{criticalTyres > 1 ? "s" : ""} need immediate replacement</span>
            </div>
          )}
        </div>
      </div>

      {/* Current Trips */}
      <CurrentTripsCard />

      <Separator />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Boxes}        label="Total Tyres"      value={loading ? "—" : totalTyres}       variant="blue"    />
        <StatCard icon={CircleDot}    label="Fitted on Trucks" value={loading ? "—" : fittedCount}      variant="purple"  caption={loading ? "" : `${trucks.length} trucks`} />
        <StatCard icon={CheckCircle2} label="In Stock"         value={loading ? "—" : availableCount}   variant="emerald" caption="Ready to fit" />
        <StatCard icon={Wrench}       label="Maint. Overdue"   value={loading ? "—" : allAlerts.length} variant={allAlerts.length > 0 ? "red" : "default"} caption={allAlerts.length > 0 ? "Needs attention" : "All clear"} />
      </div>

      {/* Quick Access */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Quick Access</h2>
        <div className="grid grid-cols-3 gap-3 sm:max-w-md">
          {QUICK_LINKS.map(({ label, href, icon: Icon, color }) => (
            <Link key={href} href={href}
              className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-center text-xs font-semibold transition-all hover:-translate-y-1 hover:shadow-md ${color}`}
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
              className={`flex h-8 cursor-text items-center overflow-hidden rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm transition-all duration-300 hover:border-gray-300 focus-within:border-purple-300 focus-within:ring-2 focus-within:ring-purple-100 ${
                tyreQuery ? "w-56" : "w-8 hover:w-56 focus-within:w-56"
              }`}
            >
              <Search className="ml-[9px] h-3.5 w-3.5 shrink-0" />
              <input
                value={tyreQuery}
                onChange={(e) => setTyreQuery(e.target.value)}
                placeholder="Search tyres…"
                aria-label="Search tyres"
                className="ml-2 min-w-0 flex-1 bg-transparent pr-2 text-xs text-gray-700 outline-none placeholder:text-gray-400"
              />
              {tyreQuery && (
                <button type="button" onClick={(e) => { e.preventDefault(); setTyreQuery(""); }} aria-label="Clear search" className="mr-2 shrink-0 text-gray-400 hover:text-gray-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </label>
          }
        >
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
          ) : tyreLifeRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No tyres currently fitted.</p>
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
                        className={`inline-flex items-center gap-2 rounded-full py-0.5 pl-3 pr-0.5 text-[11px] font-bold uppercase tracking-wide transition-colors duration-150 ${
                          active ? HEALTH_META[h].active : `${HEALTH_META[h].chip} hover:brightness-95`
                        }`}
                      >
                        {HEALTH_META[h].label}
                        <span className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-extrabold tabular-nums ${active ? "bg-white/25 text-white" : "bg-white/80"}`}>
                          {healthCounts[h]}
                        </span>
                      </button>
                    );
                  })}
                {healthFilter && (
                  <button type="button" onClick={() => setHealthFilter(null)} className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-100">
                <div className="custom-scrollbar max-h-[465px] overflow-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {["Truck", "Position", "Tyre No.", "Brand", "Km Driven", "Life left", "Status"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {visibleLifeRows.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-gray-400">No tyres match this filter.</td></tr>
                      ) : (
                        visibleLifeRows.map(({ f, tyre, truck, kmDriven, remaining, lifePct }) => {
                          const h = healthOf(lifePct);
                          return (
                            <tr key={f.id} className="transition-colors hover:bg-gray-50/70">
                              <td className="px-4 py-2.5">
                                <p className="font-semibold text-gray-900">{truck.truckId}</p>
                                <p className="text-[10px] text-gray-400">{truck.registrationNumber}</p>
                              </td>
                              <td className="px-4 py-2.5 font-medium text-gray-700">{f.position}</td>
                              <td className="px-4 py-2.5 font-mono text-[11px] text-gray-600">{tyre.tyreNumber}</td>
                              <td className="px-4 py-2.5 text-gray-600">{tyre.brand}</td>
                              <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-gray-700">{kmDriven.toLocaleString("en-IN")} km</td>
                              <td className="min-w-[130px] px-4 py-2.5">
                                {remaining !== null && lifePct !== null && h ? (
                                  <div className="flex flex-col gap-1">
                                    <span className={`tabular-nums ${remaining <= 0 ? "font-bold text-red-600" : remaining <= 5000 ? "font-semibold text-orange-600" : "text-gray-700"}`}>
                                      {remaining <= 0 ? "Overdue" : `${remaining.toLocaleString("en-IN")} km`}
                                    </span>
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200/70">
                                      <div className={`h-full rounded-full ${HEALTH_META[h].bar}`} style={{ width: `${Math.max(lifePct, remaining <= 0 ? 100 : 4)}%`, opacity: remaining <= 0 ? 0.35 : 1 }} />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                {h ? (
                                  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${HEALTH_META[h].pill}`}>
                                    {h === "replace" ? <AlertTriangle className="h-3 w-3" /> : h === "critical" ? <TrendingDown className="h-3 w-3" /> : <i className="h-1.5 w-1.5 rounded-full bg-current" />}
                                    {HEALTH_META[h].label}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-300">N/A</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Showing <span className="font-semibold tabular-nums text-gray-700">{visibleLifeRows.length}</span> of {tyreLifeRows.length} fitted tyres · shortest life first
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
              <p className="text-sm text-gray-400">No tyres.</p>
            ) : (
              <div className="flex flex-col gap-3.5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold tabular-nums text-gray-900">{totalTyres}</p>
                    <p className="text-xs text-gray-500">tyres in inventory</p>
                  </div>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-200/70">
                  <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${(newCount / totalTyres) * 100}%` }} />
                  <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: `${(retreadCount / totalTyres) * 100}%` }} />
                </div>
                <div className="flex flex-col gap-1.5">
                  {[
                    { label: "New", n: newCount, dot: "bg-emerald-500" },
                    { label: "Rethreaded", n: retreadCount, dot: "bg-amber-400" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-gray-600"><i className={`h-2 w-2 rounded-full ${r.dot}`} />{r.label}</span>
                      <span className="font-semibold tabular-nums text-gray-900">
                        {r.n} <span className="font-normal text-gray-400">({Math.round((r.n / totalTyres) * 100)}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Fitted</p>
                    <p className="text-lg font-bold tabular-nums text-gray-900">{fittedCount}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">In stock</p>
                    <p className="text-lg font-bold tabular-nums text-gray-900">{availableCount}</p>
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
              <p className="text-sm text-gray-400">No data.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {topBrands.map(([brand, count], i) => {
                  const pct = totalTyres > 0 ? Math.round((count / totalTyres) * 100) : 0;
                  return (
                    <div key={brand} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-medium text-gray-800">
                          <span className="w-3 text-[10px] font-bold tabular-nums text-gray-400">{i + 1}</span>
                          {brand}
                        </span>
                        <span className="font-semibold tabular-nums text-gray-900">
                          {count} <span className="font-normal text-gray-400">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200/70">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${i === 0 ? "from-blue-500 to-indigo-500" : "from-blue-400/80 to-indigo-400/80"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {otherBrandCount > 0 && (
                  <p className="text-[11px] text-gray-500">+ {otherBrandCount} tyres from other brands</p>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* Maintenance Overdue + Recent Service */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Maintenance overdue */}
        <Panel
          tone="red"
          icon={AlertTriangle}
          title="Maintenance Overdue"
          subtitle={loading ? "Loading…" : allAlerts.length === 0 ? "Nothing overdue" : `${allAlerts.length} ${allAlerts.length === 1 ? "item" : "items"} past due`}
          right={
            <Link href="/maintenance/trucks" className={HEADER_LINK}>
              Open <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          }
        >
          {loading ? (
            <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
          ) : allAlerts.length === 0 ? (
            <AllClear title="All maintenance up to date" text="No overdue items across the fleet." />
          ) : (
            <ul className="custom-scrollbar flex max-h-[300px] flex-col gap-1.5 overflow-y-auto pr-1">
              {allAlerts.map((a, i) => {
                const truck = truckByDbId.get(a.truckId);
                const km = Math.abs(a.remainingKm);
                return (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-red-200">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-900">{a.item}</p>
                      <p className="truncate text-[11px] text-gray-500">
                        {truck ? `${truck.truckId} · ${truck.registrationNumber}` : a.truckId}
                        <span className="ml-2 font-semibold text-red-600">
                          {km > 0 ? `${km.toLocaleString("en-IN")} km overdue` : "Overdue"}
                        </span>
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-semibold text-red-700">{a.category}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

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
              All records <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          }
        >
          {loading ? (
            <div className="space-y-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
          ) : recentRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400 ring-8 ring-gray-50">
                <Calendar className="h-6 w-6" />
              </span>
              <p className="text-sm text-gray-500">No maintenance records yet</p>
            </div>
          ) : (
            <ul className="custom-scrollbar flex max-h-[300px] flex-col gap-1.5 overflow-y-auto pr-1">
              {recentRecords.map((r) => {
                const truck = truckByDbId.get(r.truckId);
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-blue-200">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                      <Wrench className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-900">{r.maintenanceType}</p>
                      <p className="truncate text-[11px] text-gray-500">
                        {truck ? `${truck.truckId} · ${truck.registrationNumber}` : r.truckId}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold tabular-nums text-gray-900">
                        {r.cost ? `₹${Number(r.cost).toLocaleString("en-IN")}` : "—"}
                      </p>
                      <p className="text-[10px] tabular-nums text-gray-500">{formatDate(r.date)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Air Filter Change Alerts */}
      <Panel
        tone={airFilterAlerts.length > 0 ? "amber" : "emerald"}
        icon={Filter}
        title="Air Filter Change Alerts"
        subtitle={loading ? "Loading…" : airFilterAlerts.length === 0 ? "Every filter is within its interval" : `${airFilterAlerts.length} ${airFilterAlerts.length === 1 ? "truck" : "trucks"} due or overdue`}
        right={
          <Link href="/maintenance/air-filter-rr" className={HEADER_LINK}>
            Air filter R&amp;R <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        }
      >
        {loading ? (
          <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
        ) : airFilterAlerts.length === 0 ? (
          <AllClear title="All air filters up to date" text="No trucks due or overdue for a change." />
        ) : (
          <ul className="custom-scrollbar grid max-h-[300px] grid-cols-1 gap-1.5 overflow-y-auto pr-1 md:grid-cols-2">
            {airFilterAlerts.map((a) => {
              const overdue = a.status === "overdue";
              return (
                <li key={a.truck.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-amber-200">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${overdue ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-900">{a.truck.truckId} · {a.truck.registrationNumber}</p>
                    <p className="truncate text-[11px] tabular-nums text-gray-500">
                      {a.currentOdometer.toLocaleString("en-IN")} km now · change at {a.nextChangeOdometer.toLocaleString("en-IN")} km
                    </p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                    <i className="h-1 w-1 rounded-full bg-current" />
                    {overdue
                      ? `Overdue ${Math.abs(a.dueInKm).toLocaleString("en-IN")} km`
                      : `Due in ${a.dueInKm.toLocaleString("en-IN")} km`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

    </div>
  );
}
