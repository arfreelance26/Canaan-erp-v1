"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { maintenanceTypesApi } from "@/lib/api";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { Truck } from "@/types/truck";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";

type MaintenanceRecordFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (record: MaintenanceRecord) => void;
  truck: Truck | null;
};

const emptyForm: Omit<MaintenanceRecord, "id" | "truckId"> = {
  date: "",
  maintenanceEndDate: "",
  odometer: "",
  maintenanceType: "",
  compliant: "",
  maintenanceLocation: "",
  maintenanceBy: "",
  description: "",
  cost: "",
};

export function MaintenanceRecordFormDialog({ open, onClose, onSave, truck }: MaintenanceRecordFormDialogProps) {
  const [form, setForm] = useState<Omit<MaintenanceRecord, "id" | "truckId">>(emptyForm);
  const [typeOptions, setTypeOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    maintenanceTypesApi.list()
      .then((items) => setTypeOptions(items.map((t) => ({ value: t.name, label: t.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
    }
  }, [open, truck?.id]);

  const draftKey = `erp_maintenance_record_draft_${truck?.id ?? "none"}`;
  // Merge over emptyForm rather than replacing outright — an older draft saved
  // before these fields existed would otherwise restore without them, flipping
  // their inputs from controlled to uncontrolled (undefined value).
  useFormDraft(draftKey, open, form, (draft) => setForm({ ...emptyForm, ...draft }));

  function update<K extends keyof Omit<MaintenanceRecord, "id" | "truckId">>(
    key: K,
    value: Omit<MaintenanceRecord, "id" | "truckId">[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const currentOdometer = truck ? Number(truck.odometer) : null;
  const enteredOdometer = form.odometer !== "" ? Number(form.odometer) : null;
  const odometerTooHigh = enteredOdometer !== null && currentOdometer !== null && enteredOdometer > currentOdometer;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!truck) return;
    if (odometerTooHigh) return;
    clearFormDraft(draftKey);
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
        {currentOdometer !== null && currentOdometer > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Current Odometer</span>
            <span className="ml-auto text-sm font-bold text-blue-800">{currentOdometer.toLocaleString("en-IN")} km</span>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Maintenance Start Date" required>
            <DatePickerInput
              required
              value={form.date}
              onChange={(v) => update("date", v)}
              className={inputClass}
            />
          </Field>

          <Field label="Maintenance End Date">
            <DatePickerInput
              value={form.maintenanceEndDate}
              onChange={(v) => update("maintenanceEndDate", v)}
              className={inputClass}
            />
          </Field>

          <Field label="Odometer (km)" required>
            <DecimalInput type="number"
              required
              min="0"
              max={currentOdometer !== null && currentOdometer > 0 ? currentOdometer : undefined}
              value={form.odometer}
              onChange={(e) => update("odometer", e.target.value)}
              className={`${inputClass} ${odometerTooHigh ? "border-red-400 ring-2 ring-red-100" : ""}`}
              placeholder="e.g. 85000"
            />
            {odometerTooHigh && (
              <p className="mt-1 text-xs text-red-600">
                Must be less than or equal to the current odometer ({currentOdometer!.toLocaleString("en-IN")} km).
              </p>
            )}
            {!odometerTooHigh && currentOdometer !== null && currentOdometer > 0 && (
              <p className="mt-1 text-xs text-gray-400">Enter the odometer reading when this maintenance was done.</p>
            )}
          </Field>

          <Field label="Maintenance Type" required>
            <GlassCombobox
              required
              value={form.maintenanceType}
              onChange={(val) => update("maintenanceType", val)}
              placeholder="Select or type a maintenance type"
              options={typeOptions}
            />
          </Field>

          <Field label="Cost" required>
            <DecimalInput type="number"
              required
              min="0"
              value={form.cost}
              onChange={(e) => update("cost", e.target.value)}
              className={inputClass}
              placeholder="e.g. 5000"
            />
          </Field>

          <Field label="Maintenance Location">
            <input
              type="text"
              value={form.maintenanceLocation}
              onChange={(e) => update("maintenanceLocation", e.target.value)}
              className={inputClass}
              placeholder="e.g. Canaan Yard, Chennai"
            />
          </Field>

          <Field label="Maintenance By">
            <input
              type="text"
              value={form.maintenanceBy}
              onChange={(e) => update("maintenanceBy", e.target.value)}
              className={inputClass}
              placeholder="e.g. workshop or mechanic name"
            />
          </Field>
        </div>

        <Field label="Compliant">
          <textarea
            value={form.compliant}
            onChange={(e) => update("compliant", e.target.value)}
            className={inputClass}
            rows={3}
          />
        </Field>

        <Field label="Remarks" required>
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
            onClick={() => { clearFormDraft(draftKey); onClose(); }}
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
