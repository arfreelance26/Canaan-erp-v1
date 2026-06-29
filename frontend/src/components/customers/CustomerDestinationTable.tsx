"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";

type CustomerDestinationTableProps = {
  destinations: CustomerDestination[];
  customers: Customer[];
  onEdit: (destination: CustomerDestination) => void;
  onDelete: (id: string) => void;
};

const columns = ["Customer Name", "Destination State", "Destination Address", "Actions"];

export function CustomerDestinationTable({ destinations, customers, onEdit, onDelete }: CustomerDestinationTableProps) {
  if (destinations.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No customer destinations yet. Click &ldquo;Add Destination&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[500px] text-left text-sm">
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
          {destinations.map((entry) => {
            const customer = customers.find((c) => c.id === entry.customerId);
            return (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{customer?.name ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600">{entry.destinationState}</td>
                <td className="px-4 py-3 text-gray-600">{entry.destinationAddress}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(entry)}
                      aria-label={`Edit destination for ${customer?.name ?? "customer"}`}
                      className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entry.id)}
                      aria-label={`Delete destination for ${customer?.name ?? "customer"}`}
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
