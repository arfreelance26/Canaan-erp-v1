"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { MAINTENANCE_TYPE_OPTIONS } from "@/lib/truck-maintenance-data";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { Truck } from "@/types/truck";

type MaintenanceRecordFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (record: MaintenanceRecord) => void;
  truck: Truck | null;
};

const emptyForm: Omit<MaintenanceRecord, "id" | "truckId"> = {
  date: "",
  odometer: "",
  maintenanceType: "",
  description: "",
  cost: "",
};

export function MaintenanceRecordFormDialog({ open, onClose, onSave, truck }: MaintenanceRecordFormDialogProps) {
  const [form, setForm] = useState<Omit<MaintenanceRecord, "id" | "truckId">>(emptyForm);

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
    }
  }, [open]);

  function update<K extends keyof Omit<MaintenanceRecord, "id" | "truckId">>(
    key: K,
    value: Omit<MaintenanceRecord, "id" | "truckId">[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!truck) return;
    onSave({
      id: crypto.randomUUID(),
      truckId: truck.id,
      ...form,
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={truck ? `Update Maintenance Record — ${truck.registrationNumber}` : "Update Maintenance Record"}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Odometer (km)" required>
            <input
              type="number"
              required
              min="0"
              value={form.odometer}
              onChange={(e) => update("odometer", e.target.value)}
              className={inputClass}
              placeholder="e.g. 85000"
            />
          </Field>

          <Field label="Maintenance Type" required>
            <input
              type="text"
              required
              list="maintenance-type-options"
              value={form.maintenanceType}
              onChange={(e) => update("maintenanceType", e.target.value)}
              className={inputClass}
              placeholder="Select or type a maintenance type"
            />
            <datalist id="maintenance-type-options">
              {MAINTENANCE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </Field>

          <Field label="Cost" required>
            <input
              type="number"
              required
              min="0"
              value={form.cost}
              onChange={(e) => update("cost", e.target.value)}
              className={inputClass}
              placeholder="e.g. 5000"
            />
          </Field>
        </div>

        <Field label="Description" required>
          <textarea
            required
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className={inputClass}
            rows={3}
          />
        </Field>

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
            Add Record
          </button>
        </div>
      </form>
    </Dialog>
  );
}
