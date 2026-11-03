"use client";

import { useMemo } from "react";
import { RiBarChartBoxLine as BarChart3, RiDashboard3Line as Gauge, RiCalendar2Line as CalendarDays, RiRouteLine as Route } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { useTruckTripRuns, useTruckRunStats, missingSheetsNote } from "@/hooks/useTruckTripRuns";
import type { Truck } from "@/types/truck";
import { formatDate } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PagedTbody } from "@/components/ui/PagedTbody";
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
    <div className="rounded-xl border border-separator-border bg-background-primary-default px-4 py-3">
      <p className="flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-1 text-title-3-semibold text-text-primary"><AnimatedNumber value={value} /></p>
    </div>
  );
}

export function TruckBreakdownDialog({ open, onClose, truck }: TruckBreakdownDialogProps) {
  const { rows, loading: rowsLoading } = useTruckTripRuns(truck, open);
  // The summary figures come from the server (one formula for the whole app).
  const { stats, loading: statsLoading } = useTruckRunStats(truck, open);
  const loading = rowsLoading || statsLoading;

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
            <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-fill-2" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState size="compact" illustration="logistics" title="No trips found for this truck" />
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
          <p className="text-xs text-text-tertiary">
            Based on {stats.tripsWithDistance} trip{stats.tripsWithDistance !== 1 ? "s" : ""} with a trip sheet, over{" "}
            {stats.days} day{stats.days !== 1 ? "s" : ""} ({stats.months.toFixed(1)} months, from the first such trip to the latest trip entered in the system;
            minimum one month). Cancelled trips and trips without a sheet aren&apos;t counted.
          </p>
          {stats.missingSheets > 0 && (
            <p className="-mt-3 rounded-lg bg-warning-surface px-3 py-2 text-caption-1-medium text-warning-text-strong ring-1 ring-warning-border">
              {missingSheetsNote(stats)}.
            </p>
          )}

          {/* Per-trip breakdown */}
          <div className="overflow-x-auto rounded-xl border border-separator-border">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-separator-border bg-fill-1">
                  <th className="px-4 py-2.5 text-caption-1-semibold text-text-secondary">Trip ID</th>
                  <th className="px-4 py-2.5 text-caption-1-semibold text-text-secondary">Date</th>
                  <th className="px-4 py-2.5 text-caption-1-semibold text-text-secondary">Category</th>
                  <th className="px-4 py-2.5 text-right text-caption-1-semibold text-text-secondary">Distance</th>
                  <th className="px-4 py-2.5 text-right text-caption-1-semibold text-text-secondary">Share of Total</th>
                </tr>
              </thead>
              <PagedTbody className="divide-y divide-separator-border" items={rows}>
                {({ trip, totalKm }) => {
                  const km = Number(totalKm) || 0;
                  const share = stats.totalDistance > 0 ? (km / stats.totalDistance) * 100 : 0;
                  return (
                    <tr key={trip.id} className="hover:bg-fill-2">
                      <td className="px-4 py-2.5 font-medium text-text-primary">{trip.tripId}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{formatDate(trip.assignedDate)}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{trip.tripCategory || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-primary">{km > 0 ? fmtKm(km) : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{km > 0 ? `${share.toFixed(1)}%` : "—"}</td>
                    </tr>
                  );
                }}
              </PagedTbody>
            </table>
          </div>
        </div>
      )}
    </Dialog>
  );
}
