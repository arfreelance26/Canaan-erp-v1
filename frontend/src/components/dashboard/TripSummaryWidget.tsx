"use client";

import { useEffect, useState } from "react";
import { Truck, CheckCircle2, FileWarning, Navigation } from "lucide-react";
import { dashboardApi, type TripsOverview, type TripOverviewRow } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

const STATUS_BADGE: Record<string, string> = {
  Assigned:     "bg-sky-100 text-sky-700",
  Started:      "bg-blue-100 text-blue-700",
  Loaded:       "bg-indigo-100 text-indigo-700",
  "On-Transit": "bg-violet-100 text-violet-700",
  Reached:      "bg-teal-100 text-teal-700",
  Unloaded:     "bg-cyan-100 text-cyan-700",
  Completed:    "bg-emerald-100 text-emerald-700",
};

const COLS = ["Trip ID", "Route", "Vehicle", "Driver", "Status", "Date"];

function fmtDate(d?: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

function SectionRows({ rows }: { rows: TripOverviewRow[] }) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-4 text-center text-xs text-indigo-300">
          No trips
        </td>
      </tr>
    );
  }
  return (
    <>
      {rows.map((row) => (
        <tr key={row.tripId} className="transition-colors hover:bg-indigo-50/50">
          <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{row.tripId}</td>
          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
            {row.origin || "—"} <span className="text-indigo-300">→</span> {row.destination || "—"}
          </td>
          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{row.truckRegistration || "—"}</td>
          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{row.driverName || "—"}</td>
          <td className="px-4 py-2.5 whitespace-nowrap">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[row.status] ?? "bg-gray-100 text-gray-600"}`}>
              {row.status}
            </span>
          </td>
          <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{fmtDate(row.scheduledDate)}</td>
        </tr>
      ))}
    </>
  );
}

function SectionLabel({ icon: Icon, label, count, color }: {
  icon: React.ElementType; label: string; count: number; color: string;
}) {
  return (
    <tr>
      <td colSpan={6} className="px-4 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${color}`} />
          <span className={`text-[11px] font-bold uppercase tracking-wider ${color}`}>{label}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none bg-current/10 ${color}`}>{count}</span>
          <div className="flex-1 border-t border-gray-100 ml-1" />
        </div>
      </td>
    </tr>
  );
}

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
    <div className="rounded-2xl overflow-hidden border border-indigo-100 shadow-[0_8px_32px_rgba(99,102,241,0.13)]">

      {/* ── Gradient header ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 px-6 py-5">

        {/* Title row */}
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
            <Truck className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-200">Live Dashboard</p>
            <h2 className="text-base font-bold text-white leading-tight">Trip Status Overview</h2>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">Active</p>
            <p className="mt-0.5 text-2xl font-bold text-white">{data ? data.currentTrips.length : "—"}</p>
            <p className="text-[10px] text-indigo-300">trips on road</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">Completed</p>
            <p className="mt-0.5 text-2xl font-bold text-white">{data ? data.completedTrips.length : "—"}</p>
            <p className="text-[10px] text-indigo-300">total finished</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm border border-amber-400/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">Pending Invoice</p>
            <p className="mt-0.5 text-2xl font-bold text-amber-200">{data ? data.pendingInvoiceTrips.length : "—"}</p>
            <p className="text-[10px] text-amber-300/70">awaiting billing</p>
          </div>
        </div>
      </div>

      {/* ── Content area ────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-indigo-50/40 to-white">
        {!data ? (
          <div className="space-y-2.5 p-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded-lg bg-indigo-100/60" />
            ))}
          </div>
        ) : (
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full min-w-[540px] text-left text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-indigo-100/60 bg-indigo-50/80">
                  {COLS.map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-2.5 font-semibold uppercase tracking-wider text-indigo-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-indigo-50">
                <SectionLabel icon={Navigation}   label="Current Trips"   count={data.currentTrips.length}       color="text-blue-600" />
                <SectionRows rows={data.currentTrips} />
                <SectionLabel icon={CheckCircle2} label="Completed"        count={data.completedTrips.length}     color="text-emerald-600" />
                <SectionRows rows={data.completedTrips} />
                <SectionLabel icon={FileWarning}  label="Pending Invoice"  count={data.pendingInvoiceTrips.length} color="text-amber-600" />
                <SectionRows rows={data.pendingInvoiceTrips} />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
