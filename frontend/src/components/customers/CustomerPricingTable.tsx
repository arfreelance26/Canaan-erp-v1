"use client";

import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types/customer";
import type { CustomerPricing } from "@/types/customer-pricing";

type CustomerPricingTableProps = {
  pricing: CustomerPricing[];
  customers: Customer[];
  onEdit: (pricing: CustomerPricing) => void;
  onDelete: (id: string) => void;
};

const columns = [
  "Customer Name",
  "Customer Destination",
  "Load Type",
  "Container Type",
  "Weight (In tons)",
  "Rate",
  "Valid From",
  "Valid To",
  "Status",
  "Actions",
];

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700",
  INACTIVE: "bg-gray-100 text-gray-600",
  BLACKLISTED: "bg-red-50 text-red-700",
};

export function CustomerPricingTable({ pricing, customers, onEdit, onDelete }: CustomerPricingTableProps) {
  if (pricing.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No customer pricing yet. Click &ldquo;Add Pricing&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[1100px] text-left text-sm">
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
          {pricing.map((entry) => {
            const customer = customers.find((c) => c.id === entry.customerId);
            const effectiveStatus = customer?.status === "BLACKLISTED" ? "BLACKLISTED" : entry.status;
            return (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{customer?.name ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600">{entry.customerDestination}</td>
                <td className="px-4 py-3 text-gray-600">{entry.loadType}</td>
                <td className="px-4 py-3 text-gray-600">{entry.containerType}</td>
                <td className="px-4 py-3 text-gray-600">{entry.weightInTons}</td>
                <td className="px-4 py-3 text-gray-600">{entry.rate}</td>
                <td className="px-4 py-3 text-gray-600">{entry.validFrom}</td>
                <td className="px-4 py-3 text-gray-600">{entry.validTo}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      statusStyles[effectiveStatus] ?? "bg-gray-100 text-gray-600"
                    )}
                  >
                    {effectiveStatus}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(entry)}
                      aria-label={`Edit pricing for ${customer?.name ?? "customer"}`}
                      className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entry.id)}
                      aria-label={`Delete pricing for ${customer?.name ?? "customer"}`}
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
