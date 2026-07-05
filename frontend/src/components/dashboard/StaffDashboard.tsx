"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Building2,
  Handshake,
  Wrench,
  Fuel,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Gauge,
  IndianRupee,
  Droplets,
} from "lucide-react";
import { tripsApi, customersApi, vendorsApi, fuelLogsApi, maintenanceApi, trucksApi } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import type { Trip } from "@/types/trip";
import type { Customer } from "@/types/customer";
import type { Vendor } from "@/types/vendor";
import type { FuelLog } from "@/types/fuel-log";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { Truck } from "@/types/truck";

const QUICK_LINKS = [
  { label: "Reconciliation",   href: "/trips/reconciliation",    icon: ClipboardList, color: "bg-blue-50 text-blue-600 border-blue-200" },
  { label: "Our Customers",    href: "/resources/customers",     icon: Building2,     color: "bg-violet-50 text-violet-600 border-violet-200" },
  { label: "Our Vendors",      href: "/resources/vendors",       icon: Handshake,     color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  { label: "Truck Maintenance", href: "/maintenance/trucks",     icon: Wrench,        color: "bg-amber-50 text-amber-600 border-amber-200" },
  { label: "Fuel History",     href: "/maintenance/fuel-history", icon: Fuel,          color: "bg-teal-50 text-teal-600 border-teal-200" },
];

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function StatCard({ icon: Icon, label, value, sub, color, alert }: {
  icon: React.ElementType; label: string; value: string | number; color: string; sub?: string; alert?: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 rounded-xl border bg-white px-5 py-4 shadow-sm ${alert ? "border-amber-200 bg-amber-50/30" : "border-gray-200"}`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className={`mt-0.5 text-2xl font-bold ${alert ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
        {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
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
      {badge !== undefined && Number(badge) > 0 && (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeColor ?? "bg-gray-100 text-gray-600"}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

const Skeleton = () => <div className="h-5 w-full animate-pulse rounded bg-gray-100" />;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    verified:  "bg-emerald-100 text-emerald-700",
    flagged:   "bg-red-100 text-red-700",
    pending:   "bg-gray-100 text-gray-600",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

export function StaffDashboard() {
  const [trips, setTrips]         = useState<Trip[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vendors, setVendors]     = useState<Vendor[]>([]);
  const [fuelLogs, setFuelLogs]   = useState<FuelLog[]>([]);
  const [mRecords, setMRecords]   = useState<MaintenanceRecord[]>([]);
  const [trucks, setTrucks]       = useState<Truck[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    Promise.all([
      tripsApi.list(),
      customersApi.list(),
      vendorsApi.list(),
      fuelLogsApi.listFuelLogs(),
      maintenanceApi.listRecords(),
      trucksApi.list(),
    ])
      .then(([trps, custs, vends, fuel, maint, trks]) => {
        setTrips(trps);
        setCustomers(custs);
        setVendors(vends);
        setFuelLogs(fuel);
        setMRecords(maint);
        setTrucks(trks);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_collected", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_unmarked", () => setRefreshKey(k => k + 1));

  const truckByDbId = useMemo(() => new Map(trucks.map((t) => [t.id, t])), [trucks]);

  // Reconciliation queue: mirrors the reconciliation page filter exactly
  const reconciliationQueue = useMemo(() =>
    trips.filter((t) => t.tripSheetCollected === true),
    [trips]
  );

  // Recent fuel logs (last 6)
  const recentFuel = useMemo(() =>
    [...fuelLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
    [fuelLogs]
  );

  // Recent maintenance (last 5)
  const recentMaint = useMemo(() =>
    [...mRecords].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [mRecords]
  );


  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Staff Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Reconciliation pipeline, fleet fuel usage, and operational overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard icon={ClipboardList} label="Pending Reconciliation" value={loading ? "—" : reconciliationQueue.length} color="bg-blue-100 text-blue-600"    alert={reconciliationQueue.length > 0} sub="Awaiting invoice" />
        <StatCard icon={Building2}    label="Customers"              value={loading ? "—" : customers.length}            color="bg-violet-100 text-violet-600" sub="Registered" />
        <StatCard icon={Handshake}    label="Vendors"                value={loading ? "—" : vendors.length}              color="bg-emerald-100 text-emerald-600" sub="Registered" />
      </div>

      {/* Quick Access */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Quick Access</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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

      {/* Reconciliation queue + Fuel logs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Reconciliation Queue */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionTitle icon={ClipboardList} title="Reconciliation Queue" badge={reconciliationQueue.length} badgeColor="bg-blue-100 text-blue-700" />
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} />)}</div>
          ) : reconciliationQueue.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm font-medium text-gray-600">No trips pending reconciliation</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {reconciliationQueue.slice(0, 6).map((trip) => (
                <li key={trip.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                    <ClipboardList className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-900">{trip.tripId}</p>
                    <p className="truncate text-[11px] text-gray-500">{trip.origin} → {trip.destination}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(trip.verificationStatus)}`}>
                    {trip.verificationStatus}
                  </span>
                </li>
              ))}
              {reconciliationQueue.length > 6 && (
                <li className="pt-2 text-center">
                  <Link href="/trips/reconciliation" className="text-xs font-medium text-blue-600 hover:underline">
                    View all {reconciliationQueue.length} trips →
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Recent Fuel Logs */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <SectionTitle icon={Fuel} title="Recent Fuel Entries" />
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} />)}</div>
          ) : recentFuel.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Fuel className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-400">No fuel logs yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recentFuel.map((log) => {
                const truck = truckByDbId.get(log.truckId);
                const mileage = Number(log.mileage);
                const isGood = mileage >= 4;
                return (
                  <li key={log.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                      <Droplets className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900">
                        {truck ? `${truck.truckId} · ${truck.registrationNumber}` : log.truckId}
                      </p>
                      <p className="text-[11px] text-gray-500">{log.date} · {log.litres} L</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-gray-800">{fmt(Number(log.totalCost))}</p>
                      {mileage > 0 && (
                        <p className={`flex items-center justify-end gap-0.5 text-[10px] font-medium ${isGood ? "text-emerald-600" : "text-amber-600"}`}>
                          {isGood ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                          {mileage.toFixed(1)} km/L
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Recent Maintenance */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <SectionTitle icon={Wrench} title="Recent Maintenance" />
        {loading ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />)}
          </div>
        ) : recentMaint.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <Wrench className="h-7 w-7 text-gray-300" />
            <p className="text-sm text-gray-400">No maintenance records yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recentMaint.map((r) => {
              const truck = truckByDbId.get(r.truckId);
              return (
                <div key={r.id} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                    <Wrench className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-gray-900">{r.maintenanceType}</p>
                    <p className="text-[11px] text-gray-500">{truck ? `${truck.truckId} · ${truck.registrationNumber}` : r.truckId}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">{r.date}</span>
                      {r.cost && <span className="text-[10px] font-semibold text-gray-700">{fmt(Number(r.cost))}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
