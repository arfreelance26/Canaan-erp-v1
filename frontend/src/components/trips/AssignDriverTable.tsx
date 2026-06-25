"use client";

import { Pencil } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";

type AssignDriverTableProps = {
  drivers: Driver[];
  trucks: Truck[];
  vehicleByDriverId: Record<string, string>;
  onAssign: (driver: Driver) => void;
};

export function AssignDriverTable({ drivers, trucks, vehicleByDriverId, onAssign }: AssignDriverTableProps) {
  if (drivers.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No driver records found.
      </div>
    );
  }

  const truckById = new Map(trucks.map((truck) => [truck.truckId, truck]));

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {["Driver", "Driver ID", "Branch", "Assigned Vehicle", "Actions"].map((column) => (
              <th key={column} className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {drivers.map((driver) => {
            const vehicleId = vehicleByDriverId[driver.driverId] ?? "";
            const truck = vehicleId ? truckById.get(vehicleId) : undefined;

            return (
              <tr key={driver.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar photoUrl={driver.photoUrl} label={driver.name} size={36} />
                    <span className="font-medium text-gray-900">{driver.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{driver.driverId}</td>
                <td className="px-4 py-3 text-gray-600">{driver.branch}</td>
                <td className="px-4 py-3 text-gray-600">
                  {truck ? (
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                      {truck.truckId} — {truck.registrationNumber}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                      Unassigned
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onAssign(driver)}
                    aria-label={`Assign vehicle to ${driver.name}`}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                    {truck ? "Change" : "Assign"}
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
