"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { initialTrucks } from "@/lib/truck-data";
import type { EmiRecord } from "@/types/finance";

type EmiFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (record: EmiRecord) => void;
  initialData: EmiRecord | null;
};

const emptyForm: Omit<EmiRecord, "id"> = {
  emiName: "",
  truckRegistration: "",
  loanNumber: "",
  bankName: "",
  loanAmount: "",
  emiStartDate: "",
  emiEndDate: "",
  emiAmount: "",
  tenureMonths: "",
  emiPaymentDate: "",
};

export function EmiFormDialog({ open, onClose, onSave, initialData }: EmiFormDialogProps) {
  const [form, setForm] = useState<Omit<EmiRecord, "id">>(emptyForm);

  useEffect(() => {
    if (open) {
      const { id: _id, ...rest } = initialData ?? { id: "", ...emptyForm };
      setForm(rest);
    }
  }, [open, initialData]);

  function update<K extends keyof Omit<EmiRecord, "id">>(key: K, value: Omit<EmiRecord, "id">[K]) {
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
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit EMI Entry" : "Add EMI Entry"}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="EMI Name" required>
            <input
              type="text"
              required
              value={form.emiName}
              onChange={(e) => update("emiName", e.target.value)}
              className={inputClass}
              placeholder="e.g. Tata Signa 4623.S Loan"
            />
          </Field>

          <Field label="Truck Registration" required>
            <select
              required
              value={form.truckRegistration}
              onChange={(e) => update("truckRegistration", e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Select truck registration
              </option>
              {initialTrucks.map((truck) => (
                <option key={truck.id} value={truck.registrationNumber}>
                  {truck.registrationNumber}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Loan Number" required>
            <input
              type="text"
              required
              value={form.loanNumber}
              onChange={(e) => update("loanNumber", e.target.value)}
              className={inputClass}
              placeholder="e.g. HDFC-LN-88231"
            />
          </Field>

          <Field label="Bank Name" required>
            <input
              type="text"
              required
              value={form.bankName}
              onChange={(e) => update("bankName", e.target.value)}
              className={inputClass}
              placeholder="e.g. HDFC Bank"
            />
          </Field>

          <Field label="Loan Amount" required>
            <input
              type="number"
              required
              min="0"
              value={form.loanAmount}
              onChange={(e) => update("loanAmount", e.target.value)}
              className={inputClass}
              placeholder="e.g. 2400000"
            />
          </Field>

          <Field label="EMI Amount" required>
            <input
              type="number"
              required
              min="0"
              value={form.emiAmount}
              onChange={(e) => update("emiAmount", e.target.value)}
              className={inputClass}
              placeholder="e.g. 48500"
            />
          </Field>

          <Field label="EMI Start Date" required>
            <input
              type="date"
              required
              value={form.emiStartDate}
              onChange={(e) => update("emiStartDate", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="EMI End Date" required>
            <input
              type="date"
              required
              value={form.emiEndDate}
              onChange={(e) => update("emiEndDate", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Tenure (in Months)" required>
            <input
              type="number"
              required
              min="0"
              value={form.tenureMonths}
              onChange={(e) => update("tenureMonths", e.target.value)}
              className={inputClass}
              placeholder="e.g. 60"
            />
          </Field>

          <Field label="Date of EMI Payment" required>
            <input
              type="date"
              required
              value={form.emiPaymentDate}
              onChange={(e) => update("emiPaymentDate", e.target.value)}
              className={inputClass}
            />
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
            {initialData ? "Save Changes" : "Add EMI Entry"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
