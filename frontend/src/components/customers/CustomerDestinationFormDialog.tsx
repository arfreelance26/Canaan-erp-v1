"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Field, inputClass } from "@/components/ui/Field";
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
  destinationState: "",
  destinationAddress: "",
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

  function update<K extends keyof Omit<CustomerDestination, "id">>(key: K, value: Omit<CustomerDestination, "id">[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      id: initialData?.id ?? crypto.randomUUID(),
      ...form,
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
          <GlassSelect
            value={form.customerId}
            onChange={(val) => update("customerId", val)}
            options={[
              { value: "", label: "Select a customer" },
              ...customers.map((customer) => ({ value: customer.id, label: customer.name })),
            ]}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <Field label="Destination Address" required>
            <input
              type="text"
              required
              value={form.destinationAddress}
              onChange={(e) => update("destinationAddress", e.target.value)}
              className={inputClass}
              placeholder="e.g. NH 66, Kochi"
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
            {initialData ? "Save Changes" : "Add Destination"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
