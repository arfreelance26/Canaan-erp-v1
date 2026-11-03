"use client";

import { RiPencilLine as Pencil, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types/customer";
import type { CustomerPricing } from "@/types/customer-pricing";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
type CustomerPricingTableProps = {
  pricing: CustomerPricing[];
  customers: Customer[];
  onEdit: (pricing: CustomerPricing) => void;
  onDelete: (id: string) => void;
};

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-success-surface-strong text-success-text",
  INACTIVE: "bg-fill-2 text-text-primary",
  BLACKLISTED: "bg-danger-surface-strong text-danger-text",
};

export function CustomerPricingTable({ pricing, customers, onEdit, onDelete }: CustomerPricingTableProps) {
  if (pricing.length === 0) {
    return (
      <EmptyState size="compact" illustration="no-data" title="No customer pricing yet" description="Click &ldquo;Add Pricing&rdquo; to create one" />
    );
  }

  const hasData = {
    customerName: pricing.some((p) => customers.find(c => c.id === p.customerId)?.name),
    customerDestination: pricing.some((p) => p.customerDestination),
    rate: pricing.some((p) => p.rate !== null && p.rate !== undefined),
    commissionAmount: pricing.some((p) => p.commissionAmount),
    status: pricing.some((p) => p.status),
  };

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[900px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-separator-border bg-fill-1">
            {hasData.customerName && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Customer Name</th>}
            {hasData.customerDestination && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Customer Destination</th>}
            {hasData.rate && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Rate</th>}
            {hasData.commissionAmount && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Commission Amount</th>}
            {hasData.status && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Status</th>}
            <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Actions</th>
          </tr>
        </thead>
        <PagedTbody className="divide-y divide-separator-border" items={pricing}>
          {(entry) => {
            const customer = customers.find((c) => c.id === entry.customerId);
            return (
              <tr key={entry.id} className="hover:bg-fill-2">
                {hasData.customerName && <td className="px-4 py-3 font-medium text-text-primary">{customer?.name ?? "—"}</td>}
                {hasData.customerDestination && <td className="px-4 py-3 text-text-secondary">{entry.customerDestination}</td>}
                {hasData.rate && <td className="px-4 py-3 text-text-secondary">{entry.rate}</td>}
                {hasData.commissionAmount && <td className="px-4 py-3 text-text-secondary">{entry.commissionAmount || "—"}</td>}
                {hasData.status && (
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-caption-1-medium",
                        statusStyles[entry.status] ?? "bg-fill-2 text-text-secondary"
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
                      className="transition duration-300 group rounded-md p-1.5 text-text-secondary hover:bg-accent-surface-strong hover:text-accent-text"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entry.id)}
                      aria-label={`Delete pricing for ${customer?.name ?? "customer"}`}
                      className="transition duration-300 group rounded-md p-1.5 text-text-secondary hover:bg-danger-surface-strong hover:text-danger-text"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          }}
        </PagedTbody>
      </table>
    </div>
  );
}
