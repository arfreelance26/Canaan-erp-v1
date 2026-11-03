"use client";

import { RiPencilLine as Pencil, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";
import { ALL_STAGE_COLORS, stageBadgeClass } from "@/lib/stage-colors";

import { EmptyState } from "@/components/ui/EmptyState";
type CustomerDestinationTableProps = {
  destinations: CustomerDestination[];
  customers: Customer[];
  onEdit: (destination: CustomerDestination) => void;
  onDelete: (id: string) => void;
};

export function CustomerDestinationTable({ destinations, customers, onEdit, onDelete }: CustomerDestinationTableProps) {
  if (destinations.length === 0) {
    return (
      <EmptyState size="compact" illustration="no-data" title="No customer destinations yet" description="Click &ldquo;Add Destination&rdquo; to create one" />
    );
  }

  // Route Number — a per-customer serial number (1, 2, 3, ...) computed by
  // creation order (ascending numeric id, since ids are DB auto-increment).
  // A newly added route always lands at the end and gets the next number.
  const routeNumbers = new Map<string, number>();
  const byCustomer = new Map<string, CustomerDestination[]>();
  for (const d of destinations) {
    const list = byCustomer.get(d.customerId);
    if (list) list.push(d);
    else byCustomer.set(d.customerId, [d]);
  }
  for (const list of byCustomer.values()) {
    list.sort((a, b) => Number(a.id) - Number(b.id));
    list.forEach((d, i) => routeNumbers.set(d.id, i + 1));
  }

  const hasData = {
    customerName:       destinations.some((d) => customers.find(c => c.id === d.customerId)?.name),
    originState:        destinations.some((d) => d.originState),
    originAddress:      destinations.some((d) => d.originAddress),
    destinationState:   destinations.some((d) => d.destinationState),
    destinationAddress: destinations.some((d) => d.destinationAddress),
    cargoClassification: destinations.some((d) => d.cargoClassification),
    containerType:       destinations.some((d) => d.containerType),
    weightInTons:        destinations.some((d) => d.weightInTons),
  };

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[600px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-separator-border bg-fill-1">
            {hasData.customerName       && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Customer Name</th>}
            <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Route Number</th>
            {hasData.originState        && <th className="px-4 py-3 text-caption-1-semibold text-accent-text">Origin State</th>}
            {hasData.originAddress      && <th className="px-4 py-3 text-caption-1-semibold text-accent-text">Origin Address</th>}
            {hasData.destinationState   && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Destination State</th>}
            {hasData.destinationAddress && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Destination Address</th>}
            {hasData.cargoClassification && <th className="px-4 py-3 text-caption-1-semibold text-success-text">Cargo Classification</th>}
            {hasData.containerType && <th className="px-4 py-3 text-caption-1-semibold text-success-text">Container Type</th>}
            {hasData.weightInTons && <th className="px-4 py-3 text-caption-1-semibold text-success-text">Cargo Weight (tons)</th>}
            <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-separator-border">
          {destinations.map((entry) => {
            const customer = customers.find((c) => c.id === entry.customerId);
            return (
              <tr key={entry.id} className="hover:bg-fill-2">
                {hasData.customerName       && <td className="px-4 py-3 font-medium text-text-primary">{customer?.name ?? "—"}</td>}
                <td className="px-4 py-3">
                  {(() => {
                    const num = routeNumbers.get(entry.id) ?? 1;
                    const color = ALL_STAGE_COLORS[(num - 1) % ALL_STAGE_COLORS.length];
                    return (
                      <span className={stageBadgeClass(color)}>
                        {num}
                      </span>
                    );
                  })()}
                </td>
                {hasData.originState        && <td className="px-4 py-3 text-accent-text font-medium">{entry.originState || "—"}</td>}
                {hasData.originAddress      && <td className="px-4 py-3 text-accent-text">{entry.originAddress || "—"}</td>}
                {hasData.destinationState   && <td className="px-4 py-3 text-text-secondary">{entry.destinationState || "—"}</td>}
                {hasData.destinationAddress && <td className="px-4 py-3 text-text-secondary">{entry.destinationAddress || "—"}</td>}
                {hasData.cargoClassification && <td className="px-4 py-3 text-text-secondary">{entry.cargoClassification || "—"}</td>}
                {hasData.containerType && <td className="px-4 py-3 text-text-secondary">{entry.containerType || "—"}</td>}
                {hasData.weightInTons && <td className="px-4 py-3 text-text-secondary">{entry.weightInTons || "—"}</td>}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(entry)}
                      aria-label={`Edit destination for ${customer?.name ?? "customer"}`}
                      className="transition duration-300 group rounded-md p-1.5 text-text-secondary hover:bg-accent-surface-strong hover:text-accent-text"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entry.id)}
                      aria-label={`Delete destination for ${customer?.name ?? "customer"}`}
                      className="transition duration-300 group rounded-md p-1.5 text-text-secondary hover:bg-danger-surface-strong hover:text-danger-text"
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
