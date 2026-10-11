"use client";

import { Truck as TruckIcon, Pencil, Eye, Activity } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";

type TruckMaintenanceTableProps = {
  trucks: Truck[];
  records: MaintenanceRecord[];
  onUpdateRecord: (truck: Truck) => void;
  onViewRecord: (truck: Truck) => void;
  onViewStatus: (truck: Truck) => void;
};

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
    <div className="flex max-h-[75vh] flex-col gap-3 overflow-auto pr-1">
      {trucks.map((truck) => {
        const recordCount = records.filter((r) => r.truckId === truck.id).length;
        return (
          <div
            key={truck.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/80 bg-white/90 px-5 py-4 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
          >
            <div className="flex items-center gap-3.5">
              <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white text-orange-600 shadow-sm">
                <TruckIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-gray-900">{truck.registrationNumber}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {recordCount} maintenance record{recordCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onUpdateRecord(truck)}
                className="flex h-9 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 text-xs font-semibold text-amber-700 transition-all duration-200 hover:scale-105 hover:bg-amber-100"
              >
                <Pencil className="h-3.5 w-3.5" />
                Update Record
              </button>
              <button
                type="button"
                onClick={() => onViewRecord(truck)}
                className="flex h-9 items-center gap-1.5 rounded-full bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:scale-105 hover:bg-blue-700"
              >
                <Eye className="h-3.5 w-3.5" />
                View Record
              </button>
              <button
                type="button"
                onClick={() => onViewStatus(truck)}
                className="flex h-9 items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 text-xs font-semibold text-indigo-700 transition-all duration-200 hover:scale-105 hover:bg-indigo-100"
              >
                <Activity className="h-3.5 w-3.5" />
                Full Status
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
