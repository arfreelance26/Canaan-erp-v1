"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RiSearchLine as Search, RiToolsLine as Wrench, RiArrowDownSLine as ChevronDown, RiTruckLine as TruckIcon, RiFileList3Line as ClipboardList, RiMoneyRupeeCircleLine as IndianRupee, RiCalendarScheduleLine as CalendarClock } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { trucksApi, maintenanceApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { formatDate, inDateRange } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PagedTbody } from "@/components/ui/PagedTbody";
const ALLOWED_ROLES = ["Auditor", "Admin"];

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
  "bg-accent-surface-strong text-accent-text",
  "bg-purple-surface-strong text-purple-text",
  "bg-warning-surface-strong text-warning-text",
  "bg-success-surface-strong text-success-text",
  "bg-danger-surface-strong text-danger-text",
  "bg-teal-surface-strong text-teal-text",
  "bg-orange-surface-strong text-orange-text",
];
function typeBadgeClass(type: string): string {
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = (hash * 31 + type.charCodeAt(i)) >>> 0;
  return TYPE_PALETTE[hash % TYPE_PALETTE.length];
}

function DetailChip({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-caption-2-semibold text-text-tertiary">{label}</span>
      <span className={`truncate text-body-medium text-text-primary ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof TruckIcon; label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-separator-border bg-background-primary-default px-4 py-3.5 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-caption-2-semibold text-text-tertiary">{label}</p>
        <p className="truncate text-title-3-semibold leading-tight text-text-primary"><AnimatedNumber value={value} /></p>
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

  const datedRecords = useMemo(
    () => records.filter((r) => inDateRange(r.date, exportFrom, exportTo)),
    [records, exportFrom, exportTo],
  );

  const recordsByTruck = useMemo(() => {
    const map = new Map<string, MaintenanceRecord[]>();
    for (const r of datedRecords) {
      const list = map.get(r.truckId) ?? [];
      list.push(r);
      map.set(r.truckId, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    return map;
  }, [datedRecords]);

  const totalCost = useMemo(() => datedRecords.reduce((sum, r) => sum + n(r.cost), 0), [datedRecords]);

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
    const inRange = exportFrom || exportTo ? trucks.filter((t) => recordsByTruck.has(t.id)) : trucks;
    if (!q) return [...inRange].sort((a, b) => a.registrationNumber.localeCompare(b.registrationNumber));
    return inRange
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
  }, [trucks, q, recordsByTruck, exportFrom, exportTo]);

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
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-border bg-orange-surface text-orange-text shadow-sm">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Truck Maintenance Record</h1>
            <p className="mt-0.5 text-sm text-text-secondary">Read-only audit view of every maintenance record across the fleet</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={TruckIcon} label="Trucks" value={String(trucks.length)} accent="bg-accent-surface text-accent-text" />
        <StatCard icon={ClipboardList} label="Total Records" value={String(records.length)} accent="bg-purple-surface text-purple-text" />
        <StatCard icon={IndianRupee} label="Total Maintenance Cost" value={fmtCurCompact(totalCost)} accent="bg-success-surface text-success-text" />
      </div>

      {/* Filters */}
      {/* Minimal pill controls — each one lifts/enlarges slightly on hover */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search: collapsed icon pill that expands on hover / focus / when it holds text */}
        <label
          className={`group flex h-10 cursor-text items-center gap-2 overflow-hidden rounded-full border border-separator-border bg-background-primary-default px-3 shadow-sm transition duration-300 hover:shadow-md focus-within:scale-105 focus-within:border-accent-border-strong focus-within:shadow-md ${
            search ? "w-72" : "w-10 hover:w-72 focus-within:w-72"
          }`}
        >
          <Search className="h-4 w-4 shrink-0 text-text-secondary" />
          <input
            type="text"
            placeholder="Search by truck, type, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-w-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-placeholder"
          />
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* Export date range — same pickers, restyled as one minimal pill */}
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />

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
        <EmptyState size="compact" illustration="not-found" title={trucks.length === 0 ? "No trucks yet" : "No trucks or records match these filters"} className="rounded-xl border border-separator-border bg-background-primary-default" />
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
                className={`overflow-hidden rounded-xl border bg-background-primary-default shadow-sm transition ${
                  isOpen ? "border-accent-border ring-1 ring-accent-border " : "border-separator-border hover:border-accent-border "
                }`}
              >
                {/* Horizontal truck detail card — click anywhere to expand/collapse */}
                <button
                  type="button"
                  onClick={() => toggle(truck.id)}
                  className="flex w-full items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-fill-2"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-surface text-accent-text">
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
                        <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
                          <CalendarClock className="h-3 w-3" /> Last service {lastService ? formatDate(lastService) : "—"}
                        </span>
                        <span className="text-caption-1-semibold text-success-text">{fmtCurCompact(truckCost)} spent</span>
                      </div>
                    )}
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-caption-1-semibold ${
                      truckRecords.length > 0 ? "bg-accent-surface-strong text-accent-text" : "bg-fill-2 text-text-secondary"
                    }`}>
                      {truckRecords.length} record{truckRecords.length !== 1 ? "s" : ""}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {/* Maintenance records — wrapped underneath, shown when expanded */}
                {isOpen && (
                  <div className="border-t border-separator-border bg-fill-1">
                    {truckRecords.length === 0 ? (
                      <p className="px-5 py-6 text-center text-sm text-text-tertiary">No maintenance records for this truck.</p>
                    ) : (
                      <div className="overflow-x-auto px-3 pb-3 pt-1">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead>
                            <tr className="text-left text-caption-2-semibold text-text-tertiary">
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2">Maintenance Type</th>
                              <th className="px-3 py-2">Description</th>
                              <th className="px-3 py-2 text-right">Odometer</th>
                              <th className="px-3 py-2 text-right">Cost</th>
                              <th className="px-3 py-2">Entered By</th>
                              <th className="px-3 py-2">Source</th>
                            </tr>
                          </thead>
                          <PagedTbody items={truckRecords}>
                            {(r, i) => (
                              <tr
                                key={r.id}
                                className={`rounded-lg transition-colors hover:bg-accent-surface-strong/50 ${i % 2 === 1 ? "bg-background-primary-default " : "bg-background-primary-default "}`}
                              >
                                <td className="rounded-l-lg px-3 py-2.5 text-text-secondary">{r.date ? formatDate(r.date) : "—"}</td>
                                <td className="px-3 py-2.5">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption-2-semibold ${typeBadgeClass(r.maintenanceType)}`}>
                                    {r.maintenanceType}
                                  </span>
                                </td>
                                <td className="max-w-[280px] truncate px-3 py-2.5 text-text-secondary" title={r.description}>
                                  {r.description || "—"}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{Number(r.odometer).toLocaleString("en-IN")} km</td>
                                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-text-primary">{fmtCur(r.cost)}</td>
                                <td className="px-3 py-2.5 text-text-secondary">{r.enteredByName ?? "—"}</td>
                                <td className="rounded-r-lg px-3 py-2.5 text-text-secondary">{r.source ?? "—"}</td>
                              </tr>
                            )}
                          </PagedTbody>
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
