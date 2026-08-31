"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Wrench, ChevronDown, Truck as TruckIcon, ClipboardList, IndianRupee, CalendarClock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { trucksApi, maintenanceApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { formatDate } from "@/lib/format-date";

const ALLOWED_ROLES = ["Auditor"];

const n = (v: string | number | undefined | null) => {
  const num = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(num) ? num : 0;
};
const fmtCur = (v: string | number) =>
  `₹${n(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCurCompact = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// Consistent color per maintenance type so the same kind of work reads the
// same way across every truck's history at a glance.
const TYPE_PALETTE = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
];
function typeBadgeClass(type: string): string {
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = (hash * 31 + type.charCodeAt(i)) >>> 0;
  return TYPE_PALETTE[hash % TYPE_PALETTE.length];
}

function DetailChip({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <span className={`truncate text-sm font-medium text-gray-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof TruckIcon; label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 px-4 py-3.5 shadow-sm backdrop-blur-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="truncate text-lg font-bold leading-tight text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function TruckMaintenanceRecordPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = !user || ALLOWED_ROLES.includes(user.softwareDesignation);

  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.softwareDesignation)) {
      router.replace("/");
    }
  }, [user, router]);

  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAllowed) return;
    Promise.all([trucksApi.list(), maintenanceApi.listRecords()])
      .then(([t, r]) => { setTrucks(t); setRecords(r); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey, isAllowed]);

  useAutoRefresh(() => setRefreshKey((k) => k + 1), 10000);
  useWebSocketEvent("maintenance_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("truck_updated", () => setRefreshKey((k) => k + 1));

  const recordsByTruck = useMemo(() => {
    const map = new Map<string, MaintenanceRecord[]>();
    for (const r of records) {
      const list = map.get(r.truckId) ?? [];
      list.push(r);
      map.set(r.truckId, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    return map;
  }, [records]);

  const totalCost = useMemo(() => records.reduce((sum, r) => sum + n(r.cost), 0), [records]);

  function toggle(truckId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(truckId)) next.delete(truckId);
      else next.add(truckId);
      return next;
    });
  }

  const q = search.trim().toLowerCase();

  function truckDetailsMatch(t: Truck): boolean {
    return (
      t.registrationNumber.toLowerCase().includes(q) ||
      t.manufacturer.toLowerCase().includes(q) ||
      t.modelName.toLowerCase().includes(q)
    );
  }

  // A truck matches if its own details match, or any of its records do — a
  // record-only match auto-expands the card so the matching entry is visible
  // right away instead of making the auditor open it themselves.
  const visibleTrucks = useMemo(() => {
    if (!q) return [...trucks].sort((a, b) => a.registrationNumber.localeCompare(b.registrationNumber));
    return trucks
      .filter((t) => {
        const recordMatch = (recordsByTruck.get(t.id) ?? []).some(
          (r) =>
            r.maintenanceType.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q) ||
            (r.enteredByName ?? "").toLowerCase().includes(q)
        );
        return truckDetailsMatch(t) || recordMatch;
      })
      .sort((a, b) => a.registrationNumber.localeCompare(b.registrationNumber));
  }, [trucks, q, recordsByTruck]);

  useEffect(() => {
    if (!q) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const t of visibleTrucks) {
        if (!truckDetailsMatch(t)) next.add(t.id);
      }
      return next;
    });
  }, [q]);

  if (!isAllowed) return null;
  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Truck Maintenance Record</h1>
            <p className="mt-0.5 text-sm text-gray-500">Read-only audit view of every maintenance record across the fleet</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={TruckIcon} label="Trucks" value={String(trucks.length)} accent="bg-blue-50 text-blue-600" />
        <StatCard icon={ClipboardList} label="Total Records" value={String(records.length)} accent="bg-violet-50 text-violet-600" />
        <StatCard icon={IndianRupee} label="Total Maintenance Cost" value={fmtCurCompact(totalCost)} accent="bg-emerald-50 text-emerald-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/80 bg-white/40 px-4 py-3 shadow-sm backdrop-blur-sm">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by truck, type, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Export Range</span>
          <input
            type="date"
            value={exportFrom}
            onChange={(e) => setExportFrom(e.target.value)}
            className="uppercase rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            title="Report from date"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={exportTo}
            onChange={(e) => setExportTo(e.target.value)}
            className="uppercase rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            title="Report to date"
          />
          <DownloadExcelButton
            path="/exports/maintenance-records"
            filename="maintenance_records.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      {/* Truck cards */}
      {visibleTrucks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/80 bg-white/40 py-16 text-center shadow-sm backdrop-blur-sm">
          <Wrench className="h-8 w-8 text-gray-200" />
          <p className="text-sm font-medium text-gray-500">
            {trucks.length === 0 ? "No trucks yet." : "No trucks or records match this search."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleTrucks.map((truck) => {
            const truckRecords = recordsByTruck.get(truck.id) ?? [];
            const isOpen = expanded.has(truck.id);
            const truckCost = truckRecords.reduce((sum, r) => sum + n(r.cost), 0);
            const lastService = truckRecords[0]?.date;

            return (
              <div
                key={truck.id}
                className={`overflow-hidden rounded-xl border bg-white/60 shadow-sm backdrop-blur-sm transition-all ${
                  isOpen ? "border-blue-200 ring-1 ring-blue-100" : "border-white/80 hover:border-blue-100"
                }`}
              >
                {/* Horizontal truck detail card — click anywhere to expand/collapse */}
                <button
                  type="button"
                  onClick={() => toggle(truck.id)}
                  className="flex w-full items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-white/70"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600">
                    <TruckIcon className="h-5 w-5" />
                  </span>

                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-7">
                    <DetailChip label="Reg No" value={truck.registrationNumber} mono />
                    <DetailChip label="Manufacturer" value={truck.manufacturer} />
                    <DetailChip label="Model" value={truck.modelName} />
                    <DetailChip label="Truck Type" value={truck.truckType} />
                    <DetailChip label="Tyre Layout" value={truck.tyreLayout} />
                    <DetailChip label="Branch" value={truck.branchRegisteredTo} />
                    <DetailChip label="Odometer" value={truck.odometer ? `${Number(truck.odometer).toLocaleString("en-IN")} km` : ""} />
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-4">
                    {truckRecords.length > 0 && (
                      <div className="hidden flex-col items-end gap-0.5 sm:flex">
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <CalendarClock className="h-3 w-3" /> Last service {lastService ? formatDate(lastService) : "—"}
                        </span>
                        <span className="text-xs font-semibold text-emerald-700">{fmtCurCompact(truckCost)} spent</span>
                      </div>
                    )}
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                      truckRecords.length > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                    }`}>
                      {truckRecords.length} record{truckRecords.length !== 1 ? "s" : ""}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {/* Maintenance records — wrapped underneath, shown when expanded */}
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gradient-to-b from-gray-50/60 to-white/80">
                    {truckRecords.length === 0 ? (
                      <p className="px-5 py-6 text-center text-sm text-gray-400">No maintenance records for this truck.</p>
                    ) : (
                      <div className="overflow-x-auto px-3 pb-3 pt-1">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead>
                            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2">Maintenance Type</th>
                              <th className="px-3 py-2">Description</th>
                              <th className="px-3 py-2 text-right">Odometer</th>
                              <th className="px-3 py-2 text-right">Cost</th>
                              <th className="px-3 py-2">Entered By</th>
                              <th className="px-3 py-2">Source</th>
                            </tr>
                          </thead>
                          <tbody>
                            {truckRecords.map((r, i) => (
                              <tr
                                key={r.id}
                                className={`rounded-lg transition-colors hover:bg-blue-50/50 ${i % 2 === 1 ? "bg-white/70" : "bg-white/40"}`}
                              >
                                <td className="rounded-l-lg px-3 py-2.5 text-gray-600">{r.date ? formatDate(r.date) : "—"}</td>
                                <td className="px-3 py-2.5">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeBadgeClass(r.maintenanceType)}`}>
                                    {r.maintenanceType}
                                  </span>
                                </td>
                                <td className="max-w-[280px] truncate px-3 py-2.5 text-gray-600" title={r.description}>
                                  {r.description || "—"}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{Number(r.odometer).toLocaleString("en-IN")} km</td>
                                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">{fmtCur(r.cost)}</td>
                                <td className="px-3 py-2.5 text-gray-600">{r.enteredByName ?? "—"}</td>
                                <td className="rounded-r-lg px-3 py-2.5 text-gray-500">{r.source ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
