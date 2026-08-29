"use client";

import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { Truck } from "@/types/truck";
import { showInfo } from "@/lib/swal";
import { formatDate } from "@/lib/format-date";

type TyreInventoryTableProps = {
  tyres: TyreInventoryItem[];
  fitments: TyreFitmentRecord[];
  trucks: Truck[];
  onEdit: (tyre: TyreInventoryItem) => void;
  onDelete: (id: string) => void;
  onViewHistory: (tyre: TyreInventoryItem) => void;
};

const columns = [
  "Brand",
  "Tyre Type",
  "Tyre Number",
  "Tyre Size",
  "Cost",
  "Purchase Date",
  "Status",
  "Actions",
];

export function TyreInventoryTable({
  tyres,
  fitments,
  trucks,
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
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[1700px] text-left text-sm whitespace-nowrap">
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
          {tyres.map((tyre) => {
            const isAttached = fitments.some((f) => f.tyreId === tyre.id && !f.removedDate);
            const status = isAttached ? "Attached" : "Available";

            return (
              <tr key={tyre.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{tyre.brand}</td>
                <td className="px-4 py-3 text-gray-600">{tyre.tyreType}</td>
                <td className="px-4 py-3 text-gray-600">{tyre.tyreNumber}</td>
                <td className="px-4 py-3 text-gray-600">{tyre.size}</td>
                <td className="px-4 py-3 text-gray-600">₹{Number(tyre.cost).toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-600">
                  {formatDate(tyre.purchaseDate)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        status === "Attached"
                          ? "bg-purple-50 text-purple-700"
                          : "bg-blue-50 text-blue-700"
                      )}
                    >
                      {status}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onViewHistory(tyre)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      View Tyre History
                    </button>
                    <button
                      type="button"
                      onClick={() => showInfo(`Flagging tyre ${tyre.tyreNumber} for rethreading...`, "Flag Tyre")}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors whitespace-nowrap"
                    >
                      Flag for Rethreading
                    </button>
                    <div className="flex items-center gap-1 ml-2 border-l pl-2">
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
