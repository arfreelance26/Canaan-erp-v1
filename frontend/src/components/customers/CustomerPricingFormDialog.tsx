"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { CUSTOMER_STATUS_OPTIONS } from "@/lib/customer-data";
import { CONTAINER_TYPE_OPTIONS, LOAD_TYPE_OPTIONS, WEIGHT_IN_TONS_OPTIONS } from "@/lib/customer-pricing-data";
import type { Customer } from "@/types/customer";
import type { CustomerPricing } from "@/types/customer-pricing";

type CustomerPricingFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (pricing: CustomerPricing) => void;
  initialData: CustomerPricing | null;
  customers: Customer[];
  existingPricing: CustomerPricing[];
};

const emptyForm: Omit<CustomerPricing, "id"> = {
  customerId: "",
  customerDestination: "",
  loadType: "",
  containerType: "",
  weightInTons: "",
  rate: "",
  validFrom: "",
  validTo: "",
  status: "",
};

export function CustomerPricingFormDialog({
  open,
  onClose,
  onSave,
  initialData,
  customers,
  existingPricing,
}: CustomerPricingFormDialogProps) {
  const [form, setForm] = useState<Omit<CustomerPricing, "id">>(emptyForm);

  useEffect(() => {
    if (open) {
      const { id: _id, ...rest } = initialData ?? { id: "", ...emptyForm };
      setForm(rest);
    }
  }, [open, initialData]);

  const availableCustomers = useMemo(() => {
    return customers.filter(
      (customer) =>
        customer.id === initialData?.customerId ||
        !existingPricing.some((pricing) => pricing.customerId === customer.id)
    );
  }, [customers, existingPricing, initialData]);

  const selectedCustomer = customers.find((customer) => customer.id === form.customerId);
  const isBlacklisted = selectedCustomer?.status === "BLACKLISTED";

  function update<K extends keyof Omit<CustomerPricing, "id">>(key: K, value: Omit<CustomerPricing, "id">[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleCustomerChange(customerId: string) {
    const customer = customers.find((c) => c.id === customerId);
    setForm((prev) => ({
      ...prev,
      customerId,
      status: customer?.status === "BLACKLISTED" ? "BLACKLISTED" : prev.status,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      id: initialData?.id ?? crypto.randomUUID(),
      ...form,
      status: isBlacklisted ? "BLACKLISTED" : form.status,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Customer Pricing" : "Add Customer Pricing"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Customer Name" required>
          <select
            required
            value={form.customerId}
            onChange={(e) => handleCustomerChange(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Select a customer
            </option>
            {availableCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer Destination" required>
            <input
              type="text"
              required
              value={form.customerDestination}
              onChange={(e) => update("customerDestination", e.target.value)}
              className={inputClass}
              placeholder="e.g. Bengaluru, Karnataka"
            />
          </Field>

          <Field label="Load Type" required>
            <select
              required
              value={form.loadType}
              onChange={(e) => update("loadType", e.target.value as CustomerPricing["loadType"])}
              className={inputClass}
            >
              <option value="" disabled>
                Select load type
              </option>
              {LOAD_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Container Type" required>
            <select
              required
              value={form.containerType}
              onChange={(e) => update("containerType", e.target.value as CustomerPricing["containerType"])}
              className={inputClass}
            >
              <option value="" disabled>
                Select container type
              </option>
              {CONTAINER_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Weight (In tons)" required>
            <select
              required
              value={form.weightInTons}
              onChange={(e) => update("weightInTons", e.target.value as CustomerPricing["weightInTons"])}
              className={inputClass}
            >
              <option value="" disabled>
                Select weight range
              </option>
              {WEIGHT_IN_TONS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Rate" required>
            <input
              type="text"
              required
              value={form.rate}
              onChange={(e) => update("rate", e.target.value)}
              className={inputClass}
              placeholder="e.g. 25000"
            />
          </Field>

          <Field label="Valid From" required>
            <input
              type="date"
              required
              value={form.validFrom}
              onChange={(e) => update("validFrom", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Valid Till" required>
            <input
              type="date"
              required
              value={form.validTo}
              onChange={(e) => update("validTo", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Status" required>
            <select
              required
              value={isBlacklisted ? "BLACKLISTED" : form.status}
              onChange={(e) => update("status", e.target.value as CustomerPricing["status"])}
              className={inputClass}
              disabled={isBlacklisted}
            >
              <option value="" disabled>
                Select status
              </option>
              {CUSTOMER_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {isBlacklisted && (
              <span className="text-xs text-red-600">
                This customer is blacklisted, so this pricing entry is automatically blacklisted.
              </span>
            )}
          </Field>
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-interactive rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {initialData ? "Save Changes" : "Add Pricing"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
