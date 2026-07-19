"use client";

import { Dialog } from "@/components/ui/Dialog";
import type { Truck } from "@/types/truck";
import type { FuelLog } from "@/types/fuel-log";
import { formatDate } from "@/lib/format-date";

type FuelHistoryDialogProps = {
  open: boolean;
  truck: Truck | null;
  logs: FuelLog[];
  onClose: () => void;
};

export function FuelHistoryDialog({ open, truck, logs, onClose }: FuelHistoryDialogProps) {
  if (!truck) return null;

  const fmt = (n: number) =>
    `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const sorted = [...logs].sort((a, b) => Number(a.odometer) - Number(b.odometer));

  const totalLitres = logs.reduce((s, l) => s + Number(l.litres), 0);
  const totalCost = logs.reduce((s, l) => s + Number(l.totalCost), 0);
  const avgCostPerLitre = totalLitres > 0 ? totalCost / totalLitres : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Fuel Fill-Up History — ${truck.registrationNumber}`}
      className="max-w-3xl"
    >
      {/* Truck info strip */}
      <div className="mb-5 grid grid-cols-3 gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs">
        <div>
          <p className="text-gray-400">Truck ID</p>
          <p className="font-medium text-gray-700">{truck.truckId}</p>
        </div>
        <div>
          <p className="text-gray-400">Model</p>
          <p className="font-medium text-gray-700">{truck.modelName}</p>
        </div>
        <div>
          <p className="text-gray-400">Current Odometer</p>
          <p className="font-medium text-gray-700">{Number(truck.odometer).toLocaleString("en-IN")} km</p>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-lg border border-gray-100 bg-gray-50 py-10 text-center text-sm text-gray-500">
          No fuel logs recorded by the driver yet.
        </div>
      ) : (
        <>
          <div className="overflow-auto max-h-72 rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {["Date", "Odometer (km)", "Litres", "Price/L", "Total Cost", "Fuel Station", "Logged By", "User Modified", "Source"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((log) => {
                  const sourceLabel = log.source ?? (log.loggedBy?.startsWith("trip:") ? "Trip Sheet" : "Manual Log");
                  const isTripSheet = sourceLabel.startsWith("Trip Sheet");
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{formatDate(log.date)}</td>
                      <td className="px-3 py-2.5 text-gray-700">{Number(log.odometer).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2.5 text-gray-700">{Number(log.litres).toFixed(1)} L</td>
                      <td className="px-3 py-2.5 text-gray-700">₹{Number(log.pricePerLitre).toFixed(2)}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-800">{fmt(Number(log.totalCost))}</td>
                      <td className="px-3 py-2.5 text-gray-600">{log.fuelStation}</td>
                      <td className="px-3 py-2.5 text-gray-600">{log.loggedBy}</td>
                      <td className="px-3 py-2.5 text-gray-600">{log.enteredByName ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${isTripSheet ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                          {sourceLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary row */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
              <p className="text-xs text-gray-400">Total Fill-ups</p>
              <p className="mt-0.5 text-lg font-bold text-gray-800">{logs.length}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
              <p className="text-xs text-gray-400">Total Litres</p>
              <p className="mt-0.5 text-lg font-bold text-blue-700">{totalLitres} L</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
              <p className="text-xs text-gray-400">Total Fuel Cost</p>
              <p className="mt-0.5 text-lg font-bold text-emerald-700">{fmt(totalCost)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
              <p className="text-xs text-gray-400">Avg. Cost Per Litre</p>
              <p className="mt-0.5 text-lg font-bold text-orange-600">{fmt(avgCostPerLitre)}</p>
            </div>
          </div>
        </>
      )}

      <div className="mt-5 flex justify-end border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </Dialog>
  );
}
