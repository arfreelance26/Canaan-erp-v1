"use client";

import { RiRouteLine as Route } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { useTruckTripRuns } from "@/hooks/useTruckTripRuns";
import type { Truck } from "@/types/truck";

import { EmptyState } from "@/components/ui/EmptyState";
type TruckRunRecordDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
};

export function TruckRunRecordDialog({ open, onClose, truck }: TruckRunRecordDialogProps) {
  const { rows, loading } = useTruckTripRuns(truck, open);

  if (!truck) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Truck Run Record — ${truck.registrationNumber}`}
      className="sm:max-w-xl md:max-w-2xl"
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
        <div className="overflow-x-auto rounded-xl border border-separator-border">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-separator-border bg-fill-1">
                <th className="px-4 py-2.5 text-caption-1-semibold text-text-secondary">Trip ID</th>
                <th className="px-4 py-2.5 text-caption-1-semibold text-text-secondary">From</th>
                <th className="px-4 py-2.5 text-caption-1-semibold text-text-secondary">To</th>
                <th className="px-4 py-2.5 text-right text-caption-1-semibold text-text-secondary">Total Distance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator-border">
              {rows.map(({ trip, totalKm }) => (
                <tr key={trip.id} className="hover:bg-fill-2">
                  <td className="px-4 py-2.5 font-medium text-text-primary">{trip.tripId}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{trip.origin || "—"}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{trip.destination || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-primary">
                    {totalKm ? `${Number(totalKm).toLocaleString("en-IN")} km` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
