"use client";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import type { Truck } from "@/types/truck";

type TyreManagementTableProps = {
  trucks: Truck[];
  onManageTyres: (truck: Truck) => void;
  onViewTyreData: (truck: Truck) => void;
};

const columns = ["Truck Photo", "Truck Registration", "Upcoming Maintenance"];


export function TyreManagementTable({ trucks, onManageTyres, onViewTyreData }: TyreManagementTableProps) {
  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No trucks yet. Add a truck under &ldquo;Our Fleet&rdquo; to get started.
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-auto text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
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

            return (
              <tr key={truck.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Avatar photoUrl={null} label={truck.registrationNumber} size={40} />
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{truck.registrationNumber}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onManageTyres(truck)}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Manage Tyres
                    </button>
                    <button
                      type="button"
                      onClick={() => onViewTyreData(truck)}
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    >
                      View Tyre Data
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
