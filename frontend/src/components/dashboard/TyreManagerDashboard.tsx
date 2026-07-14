"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CircleDot,
  Boxes,
  Truck,
  AlertTriangle,
  Wrench,
  BarChart3,
  ShieldCheck,
  CheckCircle2,
  Clock,
  TrendingDown,
  Calendar,
  Gauge,
} from "lucide-react";
import { tyreApi, trucksApi, maintenanceApi } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { getMaintenanceStatus } from "@/lib/truck-maintenance-data";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { Truck as TruckType } from "@/types/truck";
import type { MaintenanceRecord, MaintenanceStatusItem } from "@/types/truck-maintenance";


const QUICK_LINKS = [
  { label: "Tyre Management",  href: "/maintenance/tyre-management",  icon: CircleDot, color: "bg-blue-50 text-blue-600 border-blue-200" },
  { label: "Tyre Inventory",   href: "/maintenance/tyre-inventory",   icon: Boxes,     color: "bg-violet-50 text-violet-600 border-violet-200" },
  { label: "Truck Maintenance", href: "/maintenance/trucks",           icon: Wrench,    color: "bg-amber-50 text-amber-600 border-amber-200" },
];

function StatCard({ icon: Icon, label, value, sub, color, alert }: {
  icon: React.ElementType; label: string; value: string | number; color: string; sub?: string; alert?: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 rounded-xl border bg-white px-5 py-4 shadow-sm ${alert ? "border-red-200 bg-red-50/40" : "border-gray-200"}`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className={`mt-0.5 text-2xl font-bold ${alert ? "text-red-600" : "text-gray-900"}`}>{value}</p>
        {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function Bar({ label, count, total, color, suffix }: { label: string; count: number; total: number; color: string; suffix?: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="font-semibold text-gray-900">{count}{suffix ?? ""} <span className="font-normal text-gray-400">({pct}%)</span></span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, badge, badgeColor }: {
  icon: React.ElementType; title: string; badge?: string | number; badgeColor?: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <Icon className="h-4 w-4 text-gray-400" />
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {badge !== undefined && badge !== 0 && (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeColor ?? "bg-gray-100 text-gray-600"}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

function LifeBadge({ pct }: { pct: number }) {
  if (pct <= 0)  return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700"><AlertTriangle className="h-2.5 w-2.5" /> Replace</span>;
  if (pct <= 20) return <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700"><TrendingDown className="h-2.5 w-2.5" /> Critical</span>;
  if (pct <= 50) return <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-700">Wear</span>;
  return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Good</span>;
}

function Skeleton() { return <div className="h-5 w-full animate-pulse rounded bg-gray-100" />; }

export function TyreManagerDashboard({ embedded = false }: { embedded?: boolean }) {
  const [inventory, setInventory]   = useState<TyreInventoryItem[]>([]);
  const [available, setAvailable]   = useState<TyreInventoryItem[]>([]);
  const [fitments, setFitments]     = useState<TyreFitmentRecord[]>([]);
  const [trucks, setTrucks]         = useState<TruckType[]>([]);
  const [records, setRecords]       = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    Promise.all([
      tyreApi.listInventory(),
      tyreApi.availableInventory(),
      tyreApi.listFitments(undefined, true),
      trucksApi.list(),
      maintenanceApi.listRecords(),
    ])
      .then(([inv, avail, fits, trks, recs]) => {
        setInventory(inv);
        setAvailable(avail);
        setFitments(fits);
        setTrucks(trks);
        setRecords(recs);
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

  // Maintenance alerts across all trucks
  const allAlerts = useMemo<MaintenanceStatusItem[]>(() => {
    return trucks.flatMap((t) => getMaintenanceStatus(t, records)).filter((s) => s.status === "attention");
  }, [trucks, records]);

  // Brand breakdown
  const topBrands = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of inventory) map.set(t.brand, (map.get(t.brand) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [inventory]);

  // Tyre life for fitted tyres
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

  // Recent maintenance (last 5 by date)
  const recentRecords = useMemo(() =>
    [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [records]
  );

  const criticalTyres = tyreLifeRows.filter((r) => r.lifePct !== null && r.lifePct <= 20).length;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      {embedded ? (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Tyre &amp; Maintenance</h2>
          {!loading && criticalTyres > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-xs font-semibold text-red-700">{criticalTyres} tyre{criticalTyres > 1 ? "s" : ""} need immediate replacement</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Maintenance Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">Fleet tyre health, fitment status, and maintenance overview</p>
          </div>
          {!loading && criticalTyres > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-xs font-semibold text-red-700">{criticalTyres} tyre{criticalTyres > 1 ? "s" : ""} need immediate replacement</span>
            </div>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={Boxes}        label="Total Tyres"       value={loading ? "—" : totalTyres}      color="bg-blue-100 text-blue-600" />
        <StatCard icon={CircleDot}    label="Fitted on Trucks"  value={loading ? "—" : fittedCount}     color="bg-violet-100 text-violet-600" sub={loading ? "" : `${trucks.length} trucks`} />
        <StatCard icon={CheckCircle2} label="In Stock"          value={loading ? "—" : availableCount}  color="bg-emerald-100 text-emerald-600" sub="Ready to fit" />
        <StatCard icon={Wrench}       label="Maint. Overdue"    value={loading ? "—" : allAlerts.length} color="bg-red-100 text-red-600" alert={allAlerts.length > 0} sub={allAlerts.length > 0 ? "Needs attention" : "All clear"} />
      </div>

      {/* Quick Access — only shown on standalone tyre manager view */}
      {!embedded && (
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
      )}

      {/* Tyre Life + Inventory Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Tyre Life Status — wide */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <SectionTitle icon={Gauge} title="Tyre Life Status" badge={fittedCount} badgeColor="bg-violet-100 text-violet-700" />
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map((i) => <Skeleton key={i} />)}</div>
          ) : tyreLifeRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No tyres currently fitted.</p>
          ) : (
            <div className="max-h-98 overflow-x-auto overflow-y-auto custom-scrollbar">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-gray-100">
                    {["Truck", "Position", "Tyre No.", "Brand", "Km Driven", "Remaining", "Status"].map((h) => (
                      <th key={h} className="pb-2 pr-4 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tyreLifeRows.map(({ f, tyre, truck, kmDriven, remaining, lifePct }) => (
                    <tr key={f.id} className="hover:bg-gray-50/60">
                      <td className="py-2 pr-4">
                        <p className="font-semibold text-gray-900">{truck.truckId}</p>
                        <p className="text-[10px] text-gray-400">{truck.registrationNumber}</p>
                      </td>
                      <td className="py-2 pr-4 font-medium text-gray-700">{f.position}</td>
                      <td className="py-2 pr-4 text-gray-600">{tyre.tyreNumber}</td>
                      <td className="py-2 pr-4 text-gray-600">{tyre.brand}</td>
                      <td className="py-2 pr-4 text-gray-700">{kmDriven.toLocaleString("en-IN")} km</td>
                      <td className="py-2 pr-4">
                        {remaining !== null
                          ? <span className={remaining <= 0 ? "font-bold text-red-600" : remaining <= 5000 ? "font-semibold text-orange-600" : "text-gray-700"}>
                              {remaining <= 0 ? "Overdue" : `${remaining.toLocaleString("en-IN")} km`}
                            </span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2">
                        {lifePct !== null ? <LifeBadge pct={lifePct} /> : <span className="text-gray-300 text-[10px]">N/A</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Inventory Breakdown — narrow */}
        <div className="flex flex-col gap-4">
          {/* Condition */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <SectionTitle icon={ShieldCheck} title="Tyre Condition" />
            {loading ? (
              <div className="space-y-3"><Skeleton /><Skeleton /></div>
            ) : totalTyres === 0 ? (
              <p className="text-sm text-gray-400">No tyres.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <Bar label="New"        count={newCount}     total={totalTyres} color="bg-emerald-500" />
                <Bar label="Rethreaded" count={retreadCount} total={totalTyres} color="bg-amber-400" />
                <div className="mt-2 flex items-center gap-4 border-t border-gray-100 pt-3 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-400" />{fittedCount} fitted</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />{availableCount} in stock</span>
                </div>
              </div>
            )}
          </div>

          {/* Top Brands */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <SectionTitle icon={BarChart3} title="Top Brands" />
            {loading ? (
              <div className="space-y-3"><Skeleton /><Skeleton /><Skeleton /></div>
            ) : topBrands.length === 0 ? (
              <p className="text-sm text-gray-400">No data.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {topBrands.map(([brand, count]) => (
                  <Bar key={brand} label={brand} count={count} total={totalTyres} color="bg-blue-500" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Maintenance Overdue + Recent Service */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Maintenance overdue */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionTitle icon={AlertTriangle} title="Maintenance Overdue" badge={allAlerts.length} badgeColor="bg-red-100 text-red-700" />
          {loading ? (
            <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} />)}</div>
          ) : allAlerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <ShieldCheck className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-gray-600">All maintenance up to date</p>
              <p className="text-xs text-gray-400">No overdue items across the fleet</p>
            </div>
          ) : (
            <ul className="max-h-64 divide-y divide-gray-50 overflow-y-auto custom-scrollbar pr-1">
              {allAlerts.map((a, i) => {
                const truck = truckByDbId.get(a.truckId);
                return (
                  <li key={i} className="flex items-start gap-3 py-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100">
                      <AlertTriangle className="h-3 w-3 text-red-600" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-900">{a.item}</p>
                      <p className="text-[11px] text-gray-500">
                        {truck ? `${truck.truckId} · ${truck.registrationNumber}` : a.truckId}
                        <span className="ml-2 font-medium text-red-600">{Math.abs(a.remainingKm).toLocaleString("en-IN")} km overdue</span>
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{a.category}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Recent maintenance */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionTitle icon={Clock} title="Recent Maintenance" />
          {loading ? (
            <div className="space-y-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} />)}</div>
          ) : recentRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Calendar className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-400">No maintenance records yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {recentRecords.map((r) => {
                const truck = truckByDbId.get(r.truckId);
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                      <Wrench className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-900">{r.maintenanceType}</p>
                      <p className="text-[11px] text-gray-500">
                        {truck ? `${truck.truckId} · ${truck.registrationNumber}` : r.truckId}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[11px] font-semibold text-gray-700">
                        {r.cost ? `₹${Number(r.cost).toLocaleString("en-IN")}` : "—"}
                      </p>
                      <p className="text-[10px] text-gray-400">{r.date}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

    </div>
  );
}
