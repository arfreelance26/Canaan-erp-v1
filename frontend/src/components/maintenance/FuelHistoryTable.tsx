import type { Truck } from "@/types/truck";
import { cn } from "@/lib/utils";
import { Fuel, History } from "lucide-react";

type FuelHistoryTableProps = {
  trucks: Truck[];
  onViewHistory?: (truck: Truck) => void;
  onEnterFuelLog?: (truck: Truck) => void;
};

const columns = [
  "Truck ID",
  "Registration",
  "Manufacturer",
  "Model",
  "Actions",
];

export function FuelHistoryTable({ trucks, onViewHistory, onEnterFuelLog }: FuelHistoryTableProps) {
  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No trucks found. Add a truck in Our Fleet to get started.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
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
            {trucks.map((truck) => (
              <tr key={truck.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{truck.truckId}</td>
                <td className="px-4 py-3 text-gray-600 font-medium">{truck.registrationNumber}</td>
                <td className="px-4 py-3 text-gray-600">{truck.manufacturer}</td>
                <td className="px-4 py-3 text-gray-600">{truck.modelName}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onViewHistory?.(truck)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors whitespace-nowrap"
                    >
                      <History className="h-3.5 w-3.5" />
                      View Fuel History
                    </button>
                    <button
                      type="button"
                      onClick={() => onEnterFuelLog?.(truck)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors whitespace-nowrap"
                    >
                      <Fuel className="h-3.5 w-3.5" />
                      Enter Fuel Log
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
