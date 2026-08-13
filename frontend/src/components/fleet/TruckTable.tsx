"use client";

import { Pencil, Trash2, Eye } from "lucide-react";
import { getTyreLayout } from "@/lib/tyre-layouts";
import type { Truck } from "@/types/truck";
import { formatDate } from "@/lib/format-date";

type TruckTableProps = {
  trucks: Truck[];
  onView: (truck: Truck) => void;
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

export function TruckTable({ trucks, onView, onEdit, onDelete }: TruckTableProps) {
  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No trucks yet. Click &ldquo;Add Truck&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[1200px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
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
            <tr key={truck.truckId} onClick={() => onView(truck)} className="hover:bg-gray-50 cursor-pointer">
              <td className="px-4 py-3 font-medium text-gray-900">{truck.truckId}</td>
              <td className="px-4 py-3 text-gray-600">{truck.registrationNumber}</td>
              <td className="px-4 py-3 text-gray-600">{truck.manufacturer}</td>
              <td className="px-4 py-3 text-gray-600">{truck.modelName}</td>
              <td className="px-4 py-3 text-gray-600">{truck.truckType}</td>
              <td className="px-4 py-3 text-gray-600">
                {getTyreLayout(truck.tyreLayout)?.label ?? truck.tyreLayout}
              </td>
              <td className="px-4 py-3 text-gray-600">{truck.odometer}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(truck.fcExpiryDate)}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(truck.insuranceExpiryDate)}</td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onView(truck)}
                    aria-label={`View ${truck.truckId}`}
                    className="transition-all duration-300 rounded-md p-1.5 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
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
