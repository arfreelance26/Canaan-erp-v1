"use client";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import type { Truck } from "@/types/truck";

type TyreManagementTableProps = {
  trucks: Truck[];
  onManageTyres: (truck: Truck) => void;
};

const columns = ["Truck Photo", "Truck Registration", "Upcoming Maintenance"];


export function TyreManagementTable({ trucks, onManageTyres }: TyreManagementTableProps) {
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

            return (
              <tr key={truck.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Avatar photoUrl={null} label={truck.registrationNumber} size={40} />
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{truck.registrationNumber}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onManageTyres(truck)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Manage Tyres
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
