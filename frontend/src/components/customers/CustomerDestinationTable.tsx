"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";
import { ALL_STAGE_COLORS, stageBadgeClass } from "@/lib/stage-colors";

type CustomerDestinationTableProps = {
  destinations: CustomerDestination[];
  customers: Customer[];
  onEdit: (destination: CustomerDestination) => void;
  onDelete: (id: string) => void;
};

export function CustomerDestinationTable({ destinations, customers, onEdit, onDelete }: CustomerDestinationTableProps) {
  if (destinations.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No customer destinations yet. Click &ldquo;Add Destination&rdquo; to create one.
      </div>
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
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[600px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-200 bg-gray-50">
            {hasData.customerName       && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Customer Name</th>}
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Route Number</th>
            {hasData.originState        && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-blue-600 uppercase">Origin State</th>}
            {hasData.originAddress      && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-blue-600 uppercase">Origin Address</th>}
            {hasData.destinationState   && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Destination State</th>}
            {hasData.destinationAddress && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Destination Address</th>}
            {hasData.cargoClassification && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-emerald-600 uppercase">Cargo Classification</th>}
            {hasData.containerType && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-emerald-600 uppercase">Container Type</th>}
            {hasData.weightInTons && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-emerald-600 uppercase">Cargo Weight (tons)</th>}
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {destinations.map((entry) => {
            const customer = customers.find((c) => c.id === entry.customerId);
            return (
              <tr key={entry.id} className="hover:bg-gray-50">
                {hasData.customerName       && <td className="px-4 py-3 font-medium text-gray-900">{customer?.name ?? "—"}</td>}
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
                {hasData.originState        && <td className="px-4 py-3 text-blue-700 font-medium">{entry.originState || "—"}</td>}
                {hasData.originAddress      && <td className="px-4 py-3 text-blue-600">{entry.originAddress || "—"}</td>}
                {hasData.destinationState   && <td className="px-4 py-3 text-gray-600">{entry.destinationState || "—"}</td>}
                {hasData.destinationAddress && <td className="px-4 py-3 text-gray-600">{entry.destinationAddress || "—"}</td>}
                {hasData.cargoClassification && <td className="px-4 py-3 text-gray-600">{entry.cargoClassification || "—"}</td>}
                {hasData.containerType && <td className="px-4 py-3 text-gray-600">{entry.containerType || "—"}</td>}
                {hasData.weightInTons && <td className="px-4 py-3 text-gray-600">{entry.weightInTons || "—"}</td>}
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
