"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  FileWarning,
  Navigation,
  ArrowRight,
  Activity,
} from "lucide-react";
import { dashboardApi, type TripsOverview, type TripOverviewRow } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { cn } from "@/lib/utils";

/* ── Status badges — same pill pattern used across the app ─────────────────── */
const STATUS_PILL: Record<string, string> = {
  Assigned:     "bg-sky-100 text-sky-700",
  Started:      "bg-blue-100 text-blue-700",
  Loaded:       "bg-indigo-100 text-indigo-700",
  "On-Transit": "bg-violet-100 text-violet-700",
  Reached:      "bg-teal-100 text-teal-700",
  Unloaded:     "bg-cyan-100 text-cyan-700",
  Completed:    "bg-emerald-100 text-emerald-700",
};

const STATUS_DOT: Record<string, string> = {
  Assigned:     "bg-sky-400",
  Started:      "bg-blue-500",
  Loaded:       "bg-indigo-500",
  "On-Transit": "bg-violet-500",
  Reached:      "bg-teal-500",
  Unloaded:     "bg-cyan-500",
  Completed:    "bg-emerald-500",
};

/* ── Section config — mirrors StatCard variants ────────────────────────────── */
const SECTIONS = [
  {
    key:      "currentTrips"        as const,
    icon:     Navigation,
    label:    "Current Trips",
    sublabel: "trips on road",
    /* StatCard "blue" variant */
    card:     "border-blue-200 bg-blue-50",
    iconCls:  "text-blue-500",
    titleCls: "text-blue-500",
    valueCls: "text-blue-800",
    capCls:   "text-blue-600/80",
    /* section header in table */
    headCls:  "text-blue-600",
  },
  {
    key:      "completedTrips"      as const,
    icon:     CheckCircle2,
    label:    "Completed",
    sublabel: "total finished",
    /* StatCard "emerald" variant */
    card:     "border-emerald-200 bg-emerald-50",
    iconCls:  "text-emerald-500",
    titleCls: "text-emerald-600",
    valueCls: "text-emerald-800",
    capCls:   "text-emerald-600/80",
    headCls:  "text-emerald-600",
  },
  {
    key:      "pendingInvoiceTrips" as const,
    icon:     FileWarning,
    label:    "Pending Invoice",
    sublabel: "awaiting billing",
    /* StatCard "amber" variant */
    card:     "border-amber-200 bg-amber-50",
    iconCls:  "text-amber-500",
    titleCls: "text-amber-600",
    valueCls: "text-amber-800",
    capCls:   "text-amber-600/80",
    headCls:  "text-amber-600",
  },
] as const;

function fmtDate(d?: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/* ── Stat tile (matches StatCard layout exactly) ───────────────────────────── */
function StatTile({
  icon: Icon, label, sublabel, value, card, iconCls, titleCls, valueCls, capCls,
}: {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  value: number | string;
  card: string;
  iconCls: string;
  titleCls: string;
  valueCls: string;
  capCls: string;
}) {
  return (
    <div className={cn("rounded-xl border p-5", card)}>
      <div className="flex items-center justify-between">
        <p className={cn("text-xs font-semibold uppercase tracking-wider", titleCls)}>{label}</p>
        <Icon className={cn("h-5 w-5", iconCls)} />
      </div>
      <p className={cn("mt-2 text-3xl font-bold", valueCls)}>{value}</p>
      <p className={cn("mt-1 text-sm", capCls)}>{sublabel}</p>
    </div>
  );
}

/* ── Section header row inside table ───────────────────────────────────────── */
function SectionHeader({ icon: Icon, label, count, headCls }: {
  icon: React.ElementType; label: string; count: number; headCls: string;
}) {
  return (
    <tr>
      <td colSpan={5} className="px-5 pt-5 pb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-3.5 w-3.5", headCls)} />
          <span className={cn("text-[11px] font-bold uppercase tracking-widest", headCls)}>{label}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold leading-none", headCls, "bg-current/10")}>
            {count}
          </span>
          <div className="ml-1 flex-1 border-t border-gray-200" />
        </div>
      </td>
    </tr>
  );
}

/* ── Trip row ──────────────────────────────────────────────────────────────── */
function TripRow({ row }: { row: TripOverviewRow }) {
  return (
    <tr className="transition-colors hover:bg-gray-50">
      <td className="px-5 py-3">
        <span className="text-xs font-bold text-gray-800">{row.tripId}</span>
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="max-w-[100px] truncate">{row.origin || "—"}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-gray-300" />
          <span className="max-w-[100px] truncate">{row.destination || "—"}</span>
        </div>
      </td>
      <td className="px-5 py-3">
        <p className="text-xs font-medium text-gray-700">{row.truckRegistration || "—"}</p>
        <p className="text-[10px] text-gray-400">{row.driverName || ""}</p>
      </td>
      <td className="px-5 py-3">
        <span className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
          STATUS_PILL[row.status] ?? "bg-gray-100 text-gray-600",
        )}>
          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[row.status] ?? "bg-gray-400")} />
          {row.status}
        </span>
      </td>
      <td className="px-5 py-3 text-[11px] text-gray-400 whitespace-nowrap">
        {fmtDate(row.scheduledDate)}
      </td>
    </tr>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={5} className="px-5 py-3 text-center text-xs text-gray-400">No trips</td>
    </tr>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 p-5">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
          <div className="h-4 flex-1 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

/* ── Main widget ───────────────────────────────────────────────────────────── */
export function TripSummaryWidget() {
  const [data, setData] = useState<TripsOverview | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    dashboardApi.tripsOverview().then(setData).catch(() => {});
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey((k) => k + 1), 30000);
  useWebSocketEvent("trip_created", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_closed",  () => setRefreshKey((k) => k + 1));

  return (
    <div className="flex flex-col gap-4">

      {/* ── Widget title ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5">
        <Activity className="h-5 w-5 text-gray-400" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Live Dashboard</p>
          <h2 className="text-base font-bold leading-tight text-gray-900">Trip Status Overview</h2>
        </div>
      </div>

      {/* ── Stat tiles — same layout as dashboard StatCards ─────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SECTIONS.map((sec) => (
          <StatTile
            key={sec.key}
            icon={sec.icon}
            label={sec.label}
            sublabel={sec.sublabel}
            value={data ? (data[sec.key] as TripOverviewRow[]).length : "—"}
            card={sec.card}
            iconCls={sec.iconCls}
            titleCls={sec.titleCls}
            valueCls={sec.valueCls}
            capCls={sec.capCls}
          />
        ))}
      </div>

      {/* ── Table card ──────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {!data ? (
          <Skeleton />
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-200 bg-gray-50">
                  {["Trip ID", "Route", "Vehicle / Driver", "Status", "Date"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {SECTIONS.map((sec) => {
                  const rows = data[sec.key] as TripOverviewRow[];
                  return (
                    <SectionGroup
                      key={sec.key}
                      icon={sec.icon}
                      label={sec.label}
                      headCls={sec.headCls}
                      rows={rows}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionGroup({ icon, label, headCls, rows }: {
  icon: React.ElementType; label: string; headCls: string; rows: TripOverviewRow[];
}) {
  return (
    <>
      <SectionHeader icon={icon} label={label} count={rows.length} headCls={headCls} />
      {rows.length === 0 ? <EmptyRow /> : rows.map((r) => <TripRow key={r.tripId} row={r} />)}
    </>
  );
}
