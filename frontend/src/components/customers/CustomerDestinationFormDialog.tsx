"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { CUSTOMER_STATUS_OPTIONS } from "@/lib/customer-data";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";

type CustomerDestinationFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (destination: CustomerDestination) => void;
  initialData: CustomerDestination | null;
  customers: Customer[];
};

const emptyForm: Omit<CustomerDestination, "id"> = {
  customerId: "",
  destinationName: "",
  destinationState: "",
  status: "",
};

export function CustomerDestinationFormDialog({
  open,
  onClose,
  onSave,
  initialData,
  customers,
}: CustomerDestinationFormDialogProps) {
  const [form, setForm] = useState<Omit<CustomerDestination, "id">>(emptyForm);

  useEffect(() => {
    if (open) {
      const { id: _id, ...rest } = initialData ?? { id: "", ...emptyForm };
      setForm(rest);
    }
  }, [open, initialData]);

  const selectedCustomer = customers.find((customer) => customer.id === form.customerId);
  const isBlacklisted = selectedCustomer?.status === "BLACKLISTED";

  function update<K extends keyof Omit<CustomerDestination, "id">>(key: K, value: Omit<CustomerDestination, "id">[K]) {
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
    <Dialog
      open={open}
      onClose={onClose}
      title={initialData ? "Edit Customer Destination" : "Add Customer Destination"}
    >
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
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Destination Name" required>
            <input
              type="text"
              required
              value={form.destinationName}
              onChange={(e) => update("destinationName", e.target.value)}
              className={inputClass}
              placeholder="e.g. Kochi Port"
            />
          </Field>

          <Field label="Destination State" required>
            <input
              type="text"
              required
              value={form.destinationState}
              onChange={(e) => update("destinationState", e.target.value)}
              className={inputClass}
              placeholder="e.g. Kerala"
            />
          </Field>

          <Field label="Destination Status" required>
            <select
              required
              value={isBlacklisted ? "BLACKLISTED" : form.status}
              onChange={(e) => update("status", e.target.value as CustomerDestination["status"])}
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
                This customer is blacklisted, so this destination is automatically blacklisted.
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
            {initialData ? "Save Changes" : "Add Destination"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
