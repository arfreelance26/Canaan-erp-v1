"use client";

import { useMemo } from "react";
import { BarChart3, Gauge, CalendarDays, Route } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useTruckTripRuns, computeTruckRunStats } from "@/hooks/useTruckTripRuns";
import type { Truck } from "@/types/truck";
import { formatDate } from "@/lib/format-date";

type TruckBreakdownDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
};

function fmtKm(n: number): string {
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
}

function StatTile({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}

export function TruckBreakdownDialog({ open, onClose, truck }: TruckBreakdownDialogProps) {
  const { rows, loading } = useTruckTripRuns(truck, open);

  const stats = useMemo(() => computeTruckRunStats(rows), [rows]);

  if (!truck) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Run Breakdown — ${truck.registrationNumber}`}
      className="sm:max-w-2xl md:max-w-3xl"
    >
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <BarChart3 className="h-7 w-7 text-gray-200" />
          <p className="text-sm font-medium text-gray-500">No trips found for this truck.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={Route} label="Total Distance" value={fmtKm(stats.totalDistance)} />
            <StatTile icon={CalendarDays} label="Monthly Distance Average" value={fmtKm(stats.monthlyAvg)} />
            <StatTile icon={Gauge} label="Daily Distance Average" value={fmtKm(stats.dailyAvg)} />
            <StatTile icon={BarChart3} label="Average per Trip" value={fmtKm(stats.avgPerTrip)} />
            <StatTile icon={Route} label="Longest Trip" value={fmtKm(stats.longest)} />
            <StatTile icon={Route} label="Shortest Trip" value={stats.tripsWithDistance > 0 ? fmtKm(stats.shortest) : "—"} />
          </div>
          <p className="text-xs text-gray-400">
            Based on {stats.tripsWithDistance} trip{stats.tripsWithDistance !== 1 ? "s" : ""} with a logged distance, over {stats.months} month{stats.months !== 1 ? "s" : ""} of tracked activity.
          </p>

          {/* Per-trip breakdown */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Trip ID</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Category</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Distance</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Share of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(({ trip, totalKm }) => {
                  const km = Number(totalKm) || 0;
                  const share = stats.totalDistance > 0 ? (km / stats.totalDistance) * 100 : 0;
                  return (
                    <tr key={trip.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{trip.tripId}</td>
                      <td className="px-4 py-2.5 text-gray-600">{formatDate(trip.assignedDate)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{trip.tripCategory || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{km > 0 ? fmtKm(km) : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{km > 0 ? `${share.toFixed(1)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Dialog>
  );
}
