"use client";

import { Pencil, Trash2 } from "lucide-react";
import { getTyreLayout } from "@/lib/tyre-layouts";
import type { Truck } from "@/types/truck";

type TruckTableProps = {
  trucks: Truck[];
  onEdit: (truck: Truck) => void;
  onDelete: (id: string) => void;
};

const columns = [
  "Truck ID",
  "Registration Number",
  "Manufacturer",
  "Model Name",
  "Truck Type",
  "Tyre Layout",
  "Odometer",
  "FC Expiry",
  "Insurance Expiry",
  "Actions",
];

export function TruckTable({ trucks, onEdit, onDelete }: TruckTableProps) {
  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No trucks yet. Click &ldquo;Add Truck&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[1200px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((column) => (
              <th
                key={column}
                className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {trucks.map((truck) => (
            <tr key={truck.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{truck.truckId}</td>
              <td className="px-4 py-3 text-gray-600">{truck.registrationNumber}</td>
              <td className="px-4 py-3 text-gray-600">{truck.manufacturer}</td>
              <td className="px-4 py-3 text-gray-600">{truck.modelName}</td>
              <td className="px-4 py-3 text-gray-600">{truck.truckType}</td>
              <td className="px-4 py-3 text-gray-600">
                {getTyreLayout(truck.tyreLayout)?.label ?? truck.tyreLayout}
              </td>
              <td className="px-4 py-3 text-gray-600">{truck.odometer}</td>
              <td className="px-4 py-3 text-gray-600">{truck.fcExpiryDate}</td>
              <td className="px-4 py-3 text-gray-600">{truck.insuranceExpiryDate}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(truck)}
                    aria-label={`Edit ${truck.truckId}`}
                    className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(truck.id)}
                    aria-label={`Delete ${truck.truckId}`}
                    className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
