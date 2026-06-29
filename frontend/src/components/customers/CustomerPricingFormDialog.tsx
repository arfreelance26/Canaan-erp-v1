"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Field, inputClass } from "@/components/ui/Field";
import { CUSTOMER_STATUS_OPTIONS } from "@/lib/customer-data";
import { CONTAINER_TYPE_OPTIONS, LOAD_TYPE_OPTIONS, WEIGHT_IN_TONS_OPTIONS } from "@/lib/customer-pricing-data";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";
import type { CustomerPricing } from "@/types/customer-pricing";

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
  loadType: "",
  containerType: "",
  weightInTons: "",
  rate: "",
  status: "",
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

  const customerDestinationOptions = useMemo(() => {
    return destinations
      .filter((d) => d.customerId === form.customerId && d.destinationAddress)
      .map((d) => ({ value: d.destinationAddress, label: d.destinationAddress }));
  }, [destinations, form.customerId]);

  function update<K extends keyof Omit<CustomerPricing, "id">>(key: K, value: Omit<CustomerPricing, "id">[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleCustomerChange(customerId: string) {
    setForm((prev) => ({ ...prev, customerId, customerDestination: "" }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      id: initialData?.id ?? crypto.randomUUID(),
      ...form,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Customer Pricing" : "Add Customer Pricing"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Customer Name" required>
          <GlassSelect
            value={form.customerId}
            onChange={(val) => handleCustomerChange(val)}
            options={[
              { value: "", label: "Select a customer" },
              ...availableCustomers.map((customer) => ({ value: customer.id, label: customer.name })),
            ]}
          />
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

          <Field label="Load Type" required>
            <GlassSelect
              value={form.loadType}
              onChange={(val) => update("loadType", val as CustomerPricing["loadType"])}
              options={[
                { value: "", label: "Select load type" },
                ...LOAD_TYPE_OPTIONS.map((o) => ({ value: o, label: o })),
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

          <Field label="Weight (In tons)" required>
            <GlassSelect
              value={form.weightInTons}
              onChange={(val) => update("weightInTons", val as CustomerPricing["weightInTons"])}
              options={[
                { value: "", label: "Select weight range" },
                ...WEIGHT_IN_TONS_OPTIONS.map((o) => ({ value: o, label: o })),
              ]}
            />
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

          <Field label="Status" required>
            <GlassSelect
              value={form.status}
              onChange={(val) => update("status", val as CustomerPricing["status"])}
              options={[
                { value: "", label: "Select status" },
                ...CUSTOMER_STATUS_OPTIONS.map((o) => ({ value: o, label: o })),
              ]}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
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
