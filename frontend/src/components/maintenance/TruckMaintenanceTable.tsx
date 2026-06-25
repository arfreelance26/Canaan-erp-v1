"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMaintenanceStatus, getTruckMaintenanceSummary } from "@/lib/truck-maintenance-data";
import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";

type TruckMaintenanceTableProps = {
  trucks: Truck[];
  records: MaintenanceRecord[];
  onUpdateRecord: (truck: Truck) => void;
  onViewRecord: (truck: Truck) => void;
};

const columns = [
  "Registration Number",
  "Current Odometer",
  "Actions",
];
export function TruckMaintenanceTable({
  trucks,
  records,
  onUpdateRecord,
  onViewRecord,
}: TruckMaintenanceTableProps) {
  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No trucks yet. Add a truck under &ldquo;Our Fleet&rdquo; to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-auto text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((column, index) => (
              <th
                key={`${column}-${index}`}
                className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {trucks.map((truck) => {
            const summary = getTruckMaintenanceSummary(truck, records);

            return (
              <tr key={truck.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{truck.registrationNumber}</td>
                <td className="px-4 py-3 text-gray-600">{Number(truck.odometer).toLocaleString()} km</td>

                <td className="px-4 py-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => onUpdateRecord(truck)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Update Truck&apos;s Maintenance Record
                  </button>
                  <button
                    type="button"
                    onClick={() => onViewRecord(truck)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    View Maintenance Record
                  </button>
                </td>

              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
