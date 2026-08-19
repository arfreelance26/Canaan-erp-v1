"use client";

import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { TruckMaintenanceStatus } from "@/types/maintenance-status";

type TruckMaintenanceTableProps = {
  trucks: Truck[];
  records: MaintenanceRecord[];
  statusByTruckDbId: Map<string, TruckMaintenanceStatus>;
  onUpdateRecord: (truck: Truck) => void;
  onViewRecord: (truck: Truck) => void;
  onViewStatus: (truck: Truck) => void;
};

function StatusChip({ status }: { status: TruckMaintenanceStatus | undefined }) {
  if (!status) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  if (status.overdueCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
        <AlertTriangle className="h-3 w-3" />
        {status.overdueCount} Overdue
      </span>
    );
  }
  if (status.dueSoonCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
        <Clock className="h-3 w-3" />
        {status.dueSoonCount} Due Soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />
      All OK
    </span>
  );
}

export function TruckMaintenanceTable({
  trucks,
  records,
  statusByTruckDbId,
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
            {["Registration Number", "Maintenance Status", "Actions"].map((col) => (
              <th key={col} className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {trucks.map((truck) => {
            const status = statusByTruckDbId.get(truck.id);
            return (
              <tr key={truck.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{truck.registrationNumber}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusChip status={status} />
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
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
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
