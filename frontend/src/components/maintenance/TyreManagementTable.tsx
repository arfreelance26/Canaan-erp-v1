"use client";

import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { Settings2, ClipboardList, History } from "lucide-react";
import type { Truck } from "@/types/truck";

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
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No trucks yet. Add a truck under &ldquo;Our Fleet&rdquo; to get started.
      </div>
    );
  }

  return (
    <div className="flex max-h-[75vh] flex-col gap-3 overflow-auto pr-1">
      {trucks.map((truck) => (
        <div
          key={truck.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/80 bg-white/90 px-5 py-4 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
        >
          <div className="flex items-center gap-3.5">
            <Avatar photoUrl={null} label={truck.registrationNumber} size={44} />
            <div>
              <p className="font-semibold text-gray-900">{truck.registrationNumber}</p>
              {truck.truckId && <p className="mt-0.5 text-xs text-gray-400">{truck.truckId}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onManageTyres(truck)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:scale-105 hover:bg-blue-700"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Manage Tyres
            </button>
            <button
              type="button"
              onClick={() => onViewTyreData(truck)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 text-xs font-semibold text-amber-700 transition-all duration-200 hover:scale-105 hover:bg-amber-100"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              View Tyre Data
            </button>
            {canViewTruckHistory && (
              <button
                type="button"
                onClick={() => onViewTruckHistory(truck)}
                className="flex h-9 items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 text-xs font-semibold text-indigo-700 transition-all duration-200 hover:scale-105 hover:bg-indigo-100"
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
