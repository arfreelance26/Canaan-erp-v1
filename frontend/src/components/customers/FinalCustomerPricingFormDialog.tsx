"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { customersApi } from "@/lib/api";
import type { Customer } from "@/types/customer";
import type { CustomerPricing } from "@/types/customer-pricing";
import type { CustomerDestination } from "@/types/customer-destination";
import type { FinalCustomerPricing } from "@/types/final-customer-pricing";
import { RouteDiagram } from "./RouteDiagram";

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (customerId: string, data: { actualHireAmount: string | null; accountsHireAmount: string | null }) => Promise<void>;
  initialData?: FinalCustomerPricing | null;
  customers: Customer[];
};

type RouteOption = {
  label: string;
  rate: string;
  destination?: CustomerDestination;
};

export function FinalCustomerPricingFormDialog({ open, onClose, onSave, initialData, customers }: Props) {
  const [customerId, setCustomerId] = useState("");
  const [actualHireAmount, setActualHireAmount] = useState("");
  const [accountsHireAmount, setAccountsHireAmount] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [customerPricing, setCustomerPricing] = useState<CustomerPricing[]>([]);
  const [destinations, setDestinations] = useState<CustomerDestination[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setCustomerId(initialData.customerId);
      setActualHireAmount(initialData.actualHireAmount ?? "");
      setAccountsHireAmount(initialData.accountsHireAmount ?? "");
      Promise.all([
        customersApi.listPricing(initialData.customerId),
        customersApi.listDestinations(initialData.customerId),
      ]).then(([pricing, dests]) => {
        setCustomerPricing(pricing);
        setDestinations(dests);
        // Best-effort: preselect whichever priced route matches the saved amount,
        // since Final Customer Pricing itself only stores the resulting figure.
        const match = pricing.find((p) => p.rate && p.rate === initialData.actualHireAmount);
        setSelectedRoute(match?.customerDestination ?? "");
      }).catch(() => {});
    } else {
      setCustomerId("");
      setActualHireAmount("");
      setAccountsHireAmount("");
      setSelectedRoute("");
      setCustomerPricing([]);
      setDestinations([]);
    }
  }, [open, initialData]);

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    setActualHireAmount("");
    setSelectedRoute("");
    setCustomerPricing([]);
    setDestinations([]);
    if (!id) return;
    customersApi.listPricing(id).then(setCustomerPricing).catch(() => {});
    customersApi.listDestinations(id).then(setDestinations).catch(() => {});
  }

  function selectRoute(opt: RouteOption) {
    setSelectedRoute(opt.label);
    setActualHireAmount(opt.rate);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return;
    setSaving(true);
    try {
      await onSave(customerId, {
        actualHireAmount: actualHireAmount || null,
        accountsHireAmount: accountsHireAmount || null,
      });
    } finally {
      setSaving(false);
    }
  }

  const customerOptions = customers.map((c) => ({ value: c.id, label: c.name }));

  // Every route that has a Hire Amount configured via Customer Pricing —
  // enriched with its destination record (when found) so the route diagram
  // can render, matched by the same destination label the pricing row stores.
  const routeOptions: RouteOption[] = useMemo(
    () =>
      customerPricing
        .filter((p) => p.customerDestination && p.rate)
        .map((p) => ({
          label: p.customerDestination,
          rate: p.rate,
          destination: destinations.find(
            (d) => (d.destinationName ?? d.destinationAddress ?? "") === p.customerDestination
          ),
        })),
    [customerPricing, destinations]
  );

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Final Pricing" : "Add Final Customer Pricing"} className="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-1">

        <Field label="Customer Name" required>
          <GlassCombobox
            value={customerId}
            onChange={handleCustomerChange}
            options={customerOptions}
            placeholder="Search customer…"
            disabled={!!initialData}
          />
        </Field>

        <Field label="Available Routes" required>
          <span className="mb-2 block text-xs text-gray-400">
            Routes with a Hire Amount configured in Customer Pricing. Select one to auto-fill Actual Hire Amount below.
          </span>
          {!customerId ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-400">
              Select a customer first
            </p>
          ) : routeOptions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-400">
              No priced routes for this customer yet — add one in Customer Pricing
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-h-[24rem] overflow-y-auto p-1">
              {routeOptions.map((opt) => {
                const selected = selectedRoute === opt.label;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => selectRoute(opt)}
                    className={[
                      "flex flex-col rounded-2xl border p-4 text-left shadow-sm transition-all duration-200",
                      selected
                        ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/30 shadow-md"
                        : "border-gray-200 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/20 hover:shadow-md",
                    ].join(" ")}
                  >
                    {opt.destination ? (
                      <RouteDiagram
                        compact
                        originState={opt.destination.originState}
                        originAddress={opt.destination.originAddress}
                        destinationState={opt.destination.destinationState}
                        destinationAddress={opt.destination.destinationAddress}
                        approxDistanceKm={opt.destination.approxDistanceKm}
                      />
                    ) : (
                      <span className="text-sm font-semibold text-gray-800">{opt.label}</span>
                    )}
                    <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        ₹{Number(opt.rate).toLocaleString("en-IN")}
                      </span>
                      {selected && (
                        <span className="text-[11px] font-semibold text-blue-600">Selected</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">Actual Hire Amount (₹)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={actualHireAmount}
            readOnly
            className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-600`}
            placeholder="Select a route above to auto-populate"
          />
        </div>

        <Field label="Hire Amount as per Accounts (₹)" required>
          <input
            type="number"
            min="0"
            step="0.01"
            value={accountsHireAmount}
            onChange={(e) => setAccountsHireAmount(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            className={inputClass}
            placeholder="Enter accounts hire amount"
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !customerId || !accountsHireAmount}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : initialData ? "Save Changes" : "Add Final Pricing"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
