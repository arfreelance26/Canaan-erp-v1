"use client";

import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TyreInventoryItem } from "@/types/tyre-inventory";

type TyreInventoryTableProps = {
  tyres: TyreInventoryItem[];
  onEdit: (tyre: TyreInventoryItem) => void;
  onDelete: (id: string) => void;
  onViewHistory: (tyre: TyreInventoryItem) => void;
};

const columns = [
  "Brand",
  "Tyre Pattern",
  "Tyre Type",
  "Tyre Number",
  "Tyre Size",
  "Range (km)",
  "Cost",
  "Status",
  "Actions",
];

const conditionStyles: Record<string, string> = {
  New: "bg-green-50 text-green-700",
  Rethreaded: "bg-yellow-50 text-yellow-700",
};

export function TyreInventoryTable({
  tyres,
  onEdit,
  onDelete,
  onViewHistory,
}: TyreInventoryTableProps) {
  if (tyres.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No tyres yet. Click &ldquo;Add Tyre&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[1700px] text-left text-sm">
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
          {tyres.map((tyre) => {
            return (
              <tr key={tyre.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{tyre.brand}</td>
                <td className="px-4 py-3 text-gray-600">{tyre.pattern}</td>
                <td className="px-4 py-3 text-gray-600">{tyre.tyreType}</td>
                <td className="px-4 py-3 text-gray-600">{tyre.tyreNumber}</td>
                <td className="px-4 py-3 text-gray-600">{tyre.size}</td>
                <td className="px-4 py-3 text-gray-600">{Number(tyre.range).toLocaleString()} km</td>
                <td className="px-4 py-3 text-gray-600">₹{Number(tyre.cost).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        conditionStyles[tyre.condition] ?? "bg-gray-100 text-gray-600"
                      )}
                    >
                      {tyre.condition}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onViewHistory(tyre)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    View Tyre History
                  </button>
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(tyre)}
                      aria-label={`Edit ${tyre.tyreNumber}`}
                      className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(tyre.id)}
                      aria-label={`Delete ${tyre.tyreNumber}`}
                      className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
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
