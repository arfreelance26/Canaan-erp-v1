"use client";

import { RiPencilLine as Pencil } from "@remixicon/react";
import { Avatar } from "@/components/ui/Avatar";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";

import { EmptyState } from "@/components/ui/EmptyState";
type AssignDriverTableProps = {
  drivers: Driver[];
  trucks: Truck[];
  vehicleByDriverId: Record<string, string>;
  onAssign: (driver: Driver) => void;
};

export function AssignDriverTable({ drivers, trucks, vehicleByDriverId, onAssign }: AssignDriverTableProps) {
  if (drivers.length === 0) {
    return (
      <EmptyState size="compact" illustration="logistics" title="No driver records found" />
    );
  }

  const truckById = new Map(trucks.map((truck) => [truck.truckId, truck]));

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-separator-border bg-fill-1">
            {["Driver", "Driver ID", "Assigned Vehicle", "Actions"].map((column) => (
              <th key={column} className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-separator-border">
          {drivers.map((driver) => {
            const vehicleId = vehicleByDriverId[driver.driverId] ?? "";
            const truck = vehicleId ? truckById.get(vehicleId) : undefined;

            return (
              <tr key={driver.id} className="hover:bg-fill-2">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar photoUrl={driver.photoUrl} label={driver.name} size={36} />
                    <span className="font-medium text-text-primary">{driver.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-text-secondary">{driver.driverId}</td>

                <td className="px-4 py-3 text-text-secondary">
                  {truck ? (
                    <span className="inline-flex items-center rounded-full bg-accent-surface px-2.5 py-1 text-caption-1-medium text-accent-text">
                      {truck.truckId} — {truck.registrationNumber}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-fill-2 px-2.5 py-1 text-caption-1-medium text-text-secondary">
                      Unassigned
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onAssign(driver)}
                    aria-label={`Assign vehicle to ${driver.name}`}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-text-secondary hover:bg-accent-surface-strong hover:text-accent-text"
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
