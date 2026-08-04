"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getMaintenanceStatus } from "@/lib/truck-maintenance-data";
import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";

type TruckMaintenanceTableProps = {
  trucks: Truck[];
  records: MaintenanceRecord[];
  onUpdateRecord: (truck: Truck) => void;
  onViewRecord: (truck: Truck) => void;
  onViewStatus: (truck: Truck) => void;
};

const VISIBLE_CHIPS = 3;

export function TruckMaintenanceTable({
  trucks,
  records,
  onUpdateRecord,
  onViewRecord,
  onViewStatus,
}: TruckMaintenanceTableProps) {
  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No trucks yet. Add a truck under &ldquo;Our Fleet&rdquo; to get started.
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-200 bg-gray-50">
            {["Registration Number", "Current Odometer", "Maintenance Status", "Actions"].map((col) => (
              <th key={col} className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {trucks.map((truck) => {
            const items = getMaintenanceStatus(truck, records);
            const overdue = items.filter((i) => i.status === "attention");

            const overdueVisible = overdue.slice(0, VISIBLE_CHIPS);
            const overdueExtra   = overdue.length - overdueVisible.length;

            return (
              <tr key={truck.id} className={overdue.length > 0 ? "bg-red-50/40 hover:bg-red-50/70" : "hover:bg-gray-50"}>
                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{truck.registrationNumber}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{Number(truck.odometer).toLocaleString()} km</td>

                {/* Maintenance Status */}
                <td className="px-4 py-3">
                  {overdue.length === 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                      <CheckCircle2 className="h-3 w-3" /> All OK
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {overdueVisible.map((item) => (
                        <span
                          key={item.item}
                          title={`${item.item} — ${Math.abs(item.remainingKm).toLocaleString()} km overdue`}
                          className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 border border-red-200"
                        >
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {item.item}
                        </span>
                      ))}
                      {overdueExtra > 0 && (
                        <button
                          type="button"
                          onClick={() => onViewStatus(truck)}
                          className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700"
                        >
                          +{overdueExtra} more overdue
                        </button>
                      )}
                    </div>
                  )}
                </td>

                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateRecord(truck)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Update Record
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewRecord(truck)}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      View Record
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewStatus(truck)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Full Status
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
