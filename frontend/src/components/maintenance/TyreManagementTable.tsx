"use client";

import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { RiSettings3Line as Settings2, RiFileList3Line as ClipboardList, RiHistoryLine as History } from "@remixicon/react";
import type { Truck } from "@/types/truck";

import { EmptyState } from "@/components/ui/EmptyState";
type TyreManagementTableProps = {
  trucks: Truck[];
  onManageTyres: (truck: Truck) => void;
  onViewTyreData: (truck: Truck) => void;
  onViewTruckHistory: (truck: Truck) => void;
};

export function TyreManagementTable({ trucks, onManageTyres, onViewTyreData, onViewTruckHistory }: TyreManagementTableProps) {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  // Truck history is available to the Maintenance team as well as Admin.
  const canViewTruckHistory = isAdmin || authUser?.softwareDesignation === "Maintenance";
  if (trucks.length === 0) {
    return (
      <EmptyState size="compact" illustration="logistics" title="No trucks yet" description="Add a truck under &ldquo;Our Fleet&rdquo; to get started" />
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
            <Avatar photoUrl={null} label={truck.registrationNumber} size={44} />
            <div>
              <p className="font-semibold text-text-primary">{truck.registrationNumber}</p>
              {truck.truckId && <p className="mt-0.5 text-xs text-text-tertiary">{truck.truckId}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onManageTyres(truck)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-accent-solid px-3.5 text-caption-1-semibold text-on-solid shadow-sm transition duration-200 hover:bg-accent-solid-hover"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Manage Tyres
            </button>
            <button
              type="button"
              onClick={() => onViewTyreData(truck)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-warning-border bg-warning-surface px-3.5 text-caption-1-semibold text-warning-text transition duration-200 hover:bg-warning-surface-strong"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              View Tyre Data
            </button>
            {canViewTruckHistory && (
              <button
                type="button"
                onClick={() => onViewTruckHistory(truck)}
                className="flex h-9 items-center gap-1.5 rounded-full border border-purple-border bg-purple-surface px-3.5 text-caption-1-semibold text-purple-text transition duration-200 hover:bg-purple-surface-strong"
              >
                <History className="h-3.5 w-3.5" />
                View Truck History
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
