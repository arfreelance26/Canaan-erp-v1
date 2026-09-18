"use client";

import { Route } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useTruckTripRuns } from "@/hooks/useTruckTripRuns";
import type { Truck } from "@/types/truck";

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
            <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Route className="h-7 w-7 text-gray-200" />
          <p className="text-sm font-medium text-gray-500">No trips found for this truck.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Trip ID</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">From</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">To</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Total Distance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ trip, totalKm }) => (
                <tr key={trip.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{trip.tripId}</td>
                  <td className="px-4 py-2.5 text-gray-600">{trip.origin || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{trip.destination || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
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
