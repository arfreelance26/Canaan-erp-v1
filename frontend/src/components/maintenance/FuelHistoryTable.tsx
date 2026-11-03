import { useAuth } from "@/context/AuthContext";
import type { Truck } from "@/types/truck";
import { RiTruckLine as TruckIcon, RiGasStationLine as Fuel, RiHistoryLine as History } from "@remixicon/react";

import { EmptyState } from "@/components/ui/EmptyState";
type FuelHistoryTableProps = {
  trucks: Truck[];
  onViewHistory?: (truck: Truck) => void;
  onEnterFuelLog?: (truck: Truck) => void;
};

export function FuelHistoryTable({ trucks, onViewHistory, onEnterFuelLog }: FuelHistoryTableProps) {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  // Fuel history is open to the Maintenance team as well as Admin.
  const canViewFuelHistory = isAdmin || authUser?.softwareDesignation === "Maintenance";
  if (trucks.length === 0) {
    return (
      <EmptyState size="compact" illustration="logistics" title="No trucks found" description="Add a truck in Our Fleet to get started" />
    );
  }

  return (
    <div className="flex max-h-[75vh] flex-col gap-3 overflow-auto pr-1">
      {trucks.map((truck) => (
        <div
          key={truck.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-separator-border bg-background-primary-default px-5 py-4 shadow-sm transition duration-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
        >
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
              <TruckIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-text-primary">{truck.registrationNumber}</p>
              <p className="mt-0.5 text-xs text-text-tertiary">
                {truck.truckId}
                {(truck.manufacturer || truck.modelName) && (
                  <> &middot; {[truck.manufacturer, truck.modelName].filter(Boolean).join(" ")}</>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canViewFuelHistory && (
              <button
                type="button"
                onClick={() => onViewHistory?.(truck)}
                className="flex h-9 items-center gap-1.5 rounded-full border border-purple-border bg-purple-surface px-3.5 text-caption-1-semibold text-purple-text transition duration-200 hover:bg-purple-surface-strong"
              >
                <History className="h-3.5 w-3.5" />
                View Fuel History
              </button>
            )}
            <button
              type="button"
              onClick={() => onEnterFuelLog?.(truck)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-accent-solid px-3.5 text-caption-1-semibold text-on-solid shadow-sm transition duration-200 hover:bg-accent-solid-hover"
            >
              <Fuel className="h-3.5 w-3.5" />
              Enter Fuel Log
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
