import { useAuth } from "@/context/AuthContext";
import type { Truck } from "@/types/truck";
import { Truck as TruckIcon, Fuel, History } from "lucide-react";

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
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No trucks found. Add a truck in Our Fleet to get started.
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
            <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
              <TruckIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-gray-900">{truck.registrationNumber}</p>
              <p className="mt-0.5 text-xs text-gray-400">
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
                className="flex h-9 items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 text-xs font-semibold text-indigo-700 transition-all duration-200 hover:scale-105 hover:bg-indigo-100"
              >
                <History className="h-3.5 w-3.5" />
                View Fuel History
              </button>
            )}
            <button
              type="button"
              onClick={() => onEnterFuelLog?.(truck)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:scale-105 hover:bg-blue-700"
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
