"use client";

import { useEffect, useMemo, useState, useRef, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Field, inputClass } from "@/components/ui/Field";
import { CARGO_CLASSIFICATION_OPTIONS, CONTAINER_TYPE_OPTIONS, WEIGHT_IN_TONS_OPTIONS } from "@/lib/customer-pricing-data";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";
import type { CustomerPricing } from "@/types/customer-pricing";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";

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
  cargoClassification: "",
  containerType: "",
  weightInTons: "",
  rate: "",
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

  const customerDestinationOptions = useMemo(() => {
    return destinations
      .filter((d) => d.customerId === form.customerId)
      .map((d) => {
        const label = d.destinationName ?? d.destinationAddress ?? "";
        return { value: label, label };
      })
      .filter((o) => o.value !== "");
  }, [destinations, form.customerId]);

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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer Destination" required>
            <GlassSelect
              value={form.customerDestination}
              onChange={(val) => update("customerDestination", val)}
              options={[
                { value: "", label: form.customerId ? "Select destination" : "Select a customer first" },
                ...customerDestinationOptions,
              ]}
            />
          </Field>

          <Field label="Cargo Classification" required>
            <GlassSelect
              value={form.cargoClassification}
              onChange={(val) => update("cargoClassification", val as CustomerPricing["cargoClassification"])}
              options={[
                { value: "", label: "Select cargo classification" },
                ...CARGO_CLASSIFICATION_OPTIONS.map((o) => ({ value: o, label: o })),
              ]}
            />
          </Field>

          <Field label="Container Type" required>
            <GlassSelect
              value={form.containerType}
              onChange={(val) => update("containerType", val as CustomerPricing["containerType"])}
              options={[
                { value: "", label: "Select container type" },
                ...CONTAINER_TYPE_OPTIONS.map((o) => ({ value: o, label: o })),
              ]}
            />
          </Field>

          <Field label="Cargo Weight (tons)" required>
            <GlassSelect
              value={form.weightInTons}
              onChange={(val) => update("weightInTons", val as CustomerPricing["weightInTons"])}
              options={[
                { value: "", label: "Select weight range" },
                ...WEIGHT_IN_TONS_OPTIONS.map((o) => ({ value: o, label: o })),
              ]}
            />
          </Field>

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
