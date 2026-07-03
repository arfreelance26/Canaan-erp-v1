"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import type { Branch } from "@/types/branch";

type BranchFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (branch: Branch) => void;
  initialData: Branch | null;
};

const emptyForm: Omit<Branch, "id"> = {
  name: "",
  haltDayFee20ft: "",
  haltDayFee40ft: "",
  driverHaltDayPercentage: "",
};

export function BranchFormDialog({ open, onClose, onSave, initialData }: BranchFormDialogProps) {
  const [form, setForm] = useState<Omit<Branch, "id">>(emptyForm);

  useEffect(() => {
    if (open) {
      if (initialData) {
        const { id: _id, ...rest } = initialData;
        setForm(rest);
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, initialData]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSave({ id: initialData?.id ?? "", ...form });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initialData ? "Edit Branch" : "Add Branch"}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Branch Name" required>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className={inputClass}
            placeholder="e.g. CHENNAI"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="20FT Halt Day Fee (₹)" required>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={form.haltDayFee20ft}
              onChange={(e) => setForm((p) => ({ ...p, haltDayFee20ft: e.target.value }))}
              onWheel={(e) => e.currentTarget.blur()}
              className={inputClass}
              placeholder="e.g. 500"
            />
          </Field>

          <Field label="40FT Halt Day Fee (₹)" required>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={form.haltDayFee40ft}
              onChange={(e) => setForm((p) => ({ ...p, haltDayFee40ft: e.target.value }))}
              onWheel={(e) => e.currentTarget.blur()}
              className={inputClass}
              placeholder="e.g. 700"
            />
          </Field>

          <Field label="Driver Compensation Percentage (%)" required>
            <input
              type="number"
              required
              min="0"
              max="100"
              step="0.01"
              value={form.driverHaltDayPercentage}
              onChange={(e) => setForm((p) => ({ ...p, driverHaltDayPercentage: e.target.value }))}
              onWheel={(e) => e.currentTarget.blur()}
              className={inputClass}
              placeholder="e.g. 10"
            />
          </Field>
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {initialData ? "Save Changes" : "Add Branch"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
