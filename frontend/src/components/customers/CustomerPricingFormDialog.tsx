"use client";

import { useEffect, useMemo, useState, useRef, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";
import type { CustomerPricing } from "@/types/customer-pricing";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { RouteDiagram } from "./RouteDiagram";

export const DRAFT_KEY = "erp_customer_pricing_form_draft";

type CustomerPricingFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (pricing: CustomerPricing) => void;
  initialData: CustomerPricing | null;
  customers: Customer[];
  destinations: CustomerDestination[];
  existingPricing: CustomerPricing[];
};

const emptyForm: Omit<CustomerPricing, "id"> = {
  customerId: "",
  customerDestination: "",
  rate: "",
  commissionAmount: "",
  status: "ACTIVE",
};

export function CustomerPricingFormDialog({
  open,
  onClose,
  onSave,
  initialData,
  customers,
  destinations,
  existingPricing,
}: CustomerPricingFormDialogProps) {
  const [form, setForm] = useState<Omit<CustomerPricing, "id">>(emptyForm);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customerError, setCustomerError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const { id: _id, ...rest } = initialData ?? { id: "", ...emptyForm };
      setForm(rest);
      const preselected = customers.find((c) => c.id === (initialData?.customerId ?? ""));
      setSearch(preselected?.name ?? "");
      setDropdownOpen(false);
      setCustomerError(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData]);

  useFormDraft(DRAFT_KEY, open && !initialData, form, setForm);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [dropdownOpen]);

  // When dropdown closes, restore search text to selected customer name
  useEffect(() => {
    if (!dropdownOpen) {
      const selected = customers.find((c) => c.id === form.customerId);
      setSearch(selected?.name ?? "");
    }
  }, [dropdownOpen, form.customerId, customers]);

  const filteredCustomers = useMemo(
    () => customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [customers, search],
  );

  // Routes that already have a Hire Amount set for this customer (excluding
  // the pricing entry currently being edited, so its own route stays selectable).
  const pricedRouteValues = useMemo(() => {
    const set = new Set<string>();
    for (const p of existingPricing) {
      if (p.customerId !== form.customerId) continue;
      if (initialData && p.id === initialData.id) continue;
      if (!p.rate || String(p.rate).trim() === "") continue;
      if (p.customerDestination) set.add(p.customerDestination.trim().toLowerCase());
    }
    return set;
  }, [existingPricing, form.customerId, initialData]);

  // Full destination records for this customer that don't have a Hire Amount
  // set yet — rendered as selectable route cards below.
  const availableRoutes = useMemo(() => {
    return destinations
      .filter((d) => d.customerId === form.customerId)
      .filter((d) => {
        const value = d.destinationName ?? d.destinationAddress ?? "";
        return value !== "" && !pricedRouteValues.has(value.trim().toLowerCase());
      });
  }, [destinations, form.customerId, pricedRouteValues]);

  function update<K extends keyof Omit<CustomerPricing, "id">>(key: K, value: Omit<CustomerPricing, "id">[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleCustomerChange(customerId: string) {
    setForm((prev) => ({ ...prev, customerId, customerDestination: "" }));
  }

  function selectCustomer(customer: Customer) {
    handleCustomerChange(customer.id);
    setSearch(customer.name);
    setDropdownOpen(false);
    setCustomerError(false);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setDropdownOpen(true);
    if (!value) handleCustomerChange("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.customerId) {
      setCustomerError(true);
      return;
    }
    onSave({ id: initialData?.id ?? crypto.randomUUID(), ...form });
  }

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Customer Pricing" : "Add Customer Pricing"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Customer Name — searchable combobox */}
        <Field label="Customer Name" required>
          <div ref={containerRef} className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setDropdownOpen(true)}
              placeholder="Search customer…"
              autoComplete="off"
              className={[
                inputClass,
                customerError ? "border-red-400 focus:border-red-500" : "",
              ].join(" ")}
            />
            {dropdownOpen && (
              <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {filteredCustomers.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-400">No customers found</div>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectCustomer(customer)}
                      className={[
                        "w-full px-3 py-2 text-left text-sm transition-colors",
                        form.customerId === customer.id
                          ? "bg-blue-50 font-semibold text-blue-700"
                          : "text-gray-700 hover:bg-gray-50",
                      ].join(" ")}
                    >
                      {customer.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {customerError && (
            <p className="mt-1 text-xs text-red-500">Please select a customer from the list.</p>
          )}
        </Field>

        <Field label="Available Routes" required>
          <span className="mb-2 block text-xs text-gray-400">
            Only routes without a Hire Amount set yet are shown. Select one card.
          </span>
          {!form.customerId ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-400">
              Select a customer first
            </p>
          ) : availableRoutes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-400">
              No unpriced routes for this customer
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-h-[28rem] overflow-y-auto p-1">
              {availableRoutes.map((d) => {
                const value = d.destinationName ?? d.destinationAddress ?? "";
                const selected = form.customerDestination === value;
                const tags = [d.cargoClassification, d.containerType, d.weightInTons].filter(Boolean);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => update("customerDestination", value)}
                    className={[
                      "flex flex-col rounded-2xl border p-4 text-left shadow-sm transition-all duration-200",
                      selected
                        ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/30 shadow-md"
                        : "border-gray-200 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/20 hover:shadow-md",
                    ].join(" ")}
                  >
                    <RouteDiagram
                      compact
                      originState={d.originState}
                      originAddress={d.originAddress}
                      destinationState={d.destinationState}
                      destinationAddress={d.destinationAddress}
                      approxDistanceKm={d.approxDistanceKm}
                    />
                    {tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Hire Amount" required>
            <DecimalInput type="number"
              required
              min="0"
              step="0.01"
              value={form.rate}
              onChange={(e) => update("rate", e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className={inputClass}
              placeholder="e.g. 25000"
            />
          </Field>

          <Field label="Commission Amount">
            <DecimalInput type="number"
              min="0"
              step="0.01"
              value={form.commissionAmount ?? ""}
              onChange={(e) => update("commissionAmount", e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className={inputClass}
              placeholder="e.g. 500"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => { clearFormDraft(DRAFT_KEY); onClose(); }}
            className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-interactive rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95"
          >
            {initialData ? "Save Changes" : "Add Pricing"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
