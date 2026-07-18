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

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-gray-100 text-gray-700",
  BLACKLISTED: "bg-red-100 text-red-700",
};

export function CustomerPricingTable({ pricing, customers, onEdit, onDelete }: CustomerPricingTableProps) {
  if (pricing.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No customer pricing yet. Click &ldquo;Add Pricing&rdquo; to create one.
      </div>
    );
  }

  const hasData = {
    customerName: pricing.some((p) => customers.find(c => c.id === p.customerId)?.name),
    customerDestination: pricing.some((p) => p.customerDestination),
    cargoClassification: pricing.some((p) => p.cargoClassification),
    containerType: pricing.some((p) => p.containerType),
    weightInTons: pricing.some((p) => p.weightInTons),
    rate: pricing.some((p) => p.rate !== null && p.rate !== undefined),
    status: pricing.some((p) => p.status),
  };

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[900px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-200 bg-gray-50">
            {hasData.customerName && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Customer Name</th>}
            {hasData.customerDestination && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Customer Destination</th>}
            {hasData.cargoClassification && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Load Type</th>}
            {hasData.containerType && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Container Type</th>}
            {hasData.weightInTons && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Weight (In tons)</th>}
            {hasData.rate && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Rate</th>}
            {hasData.status && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Status</th>}
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {pricing.map((entry) => {
            const customer = customers.find((c) => c.id === entry.customerId);
            return (
              <tr key={entry.id} className="hover:bg-gray-50">
                {hasData.customerName && <td className="px-4 py-3 font-medium text-gray-900">{customer?.name ?? "—"}</td>}
                {hasData.customerDestination && <td className="px-4 py-3 text-gray-600">{entry.customerDestination}</td>}
                {hasData.cargoClassification && <td className="px-4 py-3 text-gray-600">{entry.cargoClassification}</td>}
                {hasData.containerType && <td className="px-4 py-3 text-gray-600">{entry.containerType}</td>}
                {hasData.weightInTons && <td className="px-4 py-3 text-gray-600">{entry.weightInTons}</td>}
                {hasData.rate && <td className="px-4 py-3 text-gray-600">{entry.rate}</td>}
                {hasData.status && (
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        statusStyles[entry.status] ?? "bg-gray-100 text-gray-600"
                      )}
                    >
                      {entry.status}
                    </span>
                  </td>
                )}
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
