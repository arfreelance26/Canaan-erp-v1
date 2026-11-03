"use client";

import { RiTruckLine as TruckIcon, RiPencilLine as Pencil, RiEyeLine as Eye, RiPulseLine as Activity } from "@remixicon/react";
import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";

import { EmptyState } from "@/components/ui/EmptyState";
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
      <EmptyState size="compact" illustration="logistics" title="No trucks yet" description="Add a truck under &ldquo;Our Fleet&rdquo; to get started" />
    );
  }

  return (
    <div className="flex max-h-[75vh] flex-col gap-3 overflow-auto pr-1">
      {trucks.map((truck) => {
        const recordCount = records.filter((r) => r.truckId === truck.id).length;
        return (
          <div
            key={truck.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-separator-border bg-background-primary-default px-5 py-4 shadow-sm transition duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
          >
            <div className="flex items-center gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-border bg-orange-surface text-orange-text shadow-sm">
                <TruckIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-text-primary">{truck.registrationNumber}</p>
                <p className="mt-0.5 text-xs text-text-tertiary">
                  {recordCount} maintenance record{recordCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onUpdateRecord(truck)}
                className="flex h-9 items-center gap-1.5 rounded-full border border-warning-border bg-warning-surface px-3.5 text-caption-1-semibold text-warning-text transition duration-200 hover:bg-warning-surface-strong"
              >
                <Pencil className="h-3.5 w-3.5" />
                Update Record
              </button>
              <button
                type="button"
                onClick={() => onViewRecord(truck)}
                className="flex h-9 items-center gap-1.5 rounded-full bg-accent-solid px-3.5 text-caption-1-semibold text-on-solid shadow-sm transition duration-200 hover:bg-accent-solid-hover"
              >
                <Eye className="h-3.5 w-3.5" />
                View Record
              </button>
              <button
                type="button"
                onClick={() => onViewStatus(truck)}
                className="flex h-9 items-center gap-1.5 rounded-full border border-purple-border bg-purple-surface px-3.5 text-caption-1-semibold text-purple-text transition duration-200 hover:bg-purple-surface-strong"
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
