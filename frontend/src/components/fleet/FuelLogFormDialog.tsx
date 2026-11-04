import { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { RiGasStationLine as Fuel, RiSave3Line as Save } from "@remixicon/react";
import type { Truck } from "@/types/truck";
import type { FuelLog } from "@/types/fuel-log";
import { showError } from "@/lib/feedback";
import { todayIst } from "@/lib/format-date";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { fuelLogsApi } from "@/lib/api";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { GlassCombobox } from "@/components/ui/GlassCombobox";

type FuelLogFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (log: Omit<FuelLog, "id" | "distance" | "mileage" | "createdAt" | "pricePerLitre" | "enteredByName" | "source">) => void;
  truck: Truck;
};

const inputClass =
  "mt-1 block w-full rounded-lg border border-border-button-default bg-background-primary-default px-3 py-2 text-sm text-text-primary placeholder-text-placeholder focus:border-accent-solid focus:outline-none focus:ring-1 focus:ring-accent-solid transition-colors";

function Field({ label, required, rightContent, children }: { label: string; required?: boolean; rightContent?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="block text-body-medium text-text-primary">
          {label} {required && <span className="text-danger-text">*</span>}
        </label>
        {rightContent}
      </div>
      {children}
    </div>
  );
}

export function FuelLogFormDialog({ open, onClose, onSave, truck }: FuelLogFormDialogProps) {
  const [form, setForm] = useState({
    date: todayIst(),
    odometer: "",
    litres: "",
    costPerLitre: "",
    totalCost: "",
    fuelStation: "",
    loggedBy: "",
  });
  const [litresError, setLitresError] = useState("");

  const draftKey = `erp_fuel_log_draft_${truck.id}`;
  useFormDraft(draftKey, open, form, setForm);

  const [stations, setStations] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      fuelLogsApi.listFuelStations()
        .then(setStations)
        .catch(() => {});
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (litresError) {
      await showError(litresError, "Validation Error");
      return;
    }

    onSave({
      truckId: truck.id,
      date: form.date,
      odometer: form.odometer,
      litres: form.litres,
      totalCost: form.totalCost,
      fuelStation: form.fuelStation || null,
      loggedBy: form.loggedBy || null,
    });
    clearFormDraft(draftKey);
    setLitresError("");
    setForm({
      date: todayIst(),
      odometer: "",
      litres: "",
      costPerLitre: "",
      totalCost: "",
      fuelStation: "",
      loggedBy: "",
    });
  }

  function update(field: keyof typeof form, value: string) {
    if (field === "litres") {
      const l = parseFloat(value);
      if (!isNaN(l) && l > 0 && truck.fuelCapacity && l > Number(truck.fuelCapacity)) {
        setLitresError(`Exceeds tank capacity of ${truck.fuelCapacity} L per fill.`);
      } else {
        setLitresError("");
      }
    }
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "litres" || field === "costPerLitre") {
        const l = parseFloat(field === "litres" ? value : prev.litres);
        const c = parseFloat(field === "costPerLitre" ? value : prev.costPerLitre);
        next.totalCost = (!isNaN(l) && !isNaN(c) && l > 0 && c > 0)
          ? (l * c).toFixed(2)
          : prev.totalCost;
      }
      return next;
    });
  }

  return (
    <Dialog tour="fuel-log" open={open} onClose={onClose} title="Enter Fuel Log">
        <div className="flex items-center gap-3 mb-6 bg-fill-1 p-3 rounded-lg border border-separator-border">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-surface-strong/50 text-accent-text">
            <Fuel className="w-5 h-5" />
            </div>
            <div>
            <p className="font-semibold text-text-primary">{truck.registrationNumber}</p>
            <p className="text-sm text-text-secondary">{truck.modelName}</p>
            </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Date" required>
            <DatePickerInput
              required
              value={form.date}
              onChange={(v) => update("date", v)}
            />
          </Field>
          
          <Field label="Odometer Reading" required>
            <DecimalInput type="number"
              required
              min="0"
              value={form.odometer}
              onChange={(e) => update("odometer", e.target.value)}
              className={inputClass}
              placeholder="e.g. 102500"
            />
          </Field>

          <Field 
            label="Quantity (Litres)" 
            required
            rightContent={
              <span className="text-xs text-text-secondary">
                Max Capacity: <span className="font-medium text-text-primary">{truck.fuelCapacity || "N/A"} L</span>
              </span>
            }
          >
            <DecimalInput type="number"
              required
              step="0.01"
              min="0.01"
              value={form.litres}
              onChange={(e) => update("litres", e.target.value)}
              className={`${inputClass} ${litresError ? "border-danger-border-strong focus:border-danger-solid focus:ring-danger-border-strong" : ""}`}
              placeholder="e.g. 150.00"
            />
            {litresError && (
              <p className="mt-1 text-caption-1-medium text-danger-text">{litresError}</p>
            )}
          </Field>

          <Field label="Cost Per Litre (₹)" required>
            <DecimalInput type="number"
              required
              step="0.01"
              min="0.01"
              value={form.costPerLitre}
              onChange={(e) => update("costPerLitre", e.target.value)}
              className={inputClass}
              placeholder="e.g. 96.50"
            />
          </Field>

          <Field label="Total Fuel Cost (₹)" required>
            <DecimalInput type="number"
              required
              step="0.01"
              min="1"
              value={form.totalCost}
              onChange={(e) => update("totalCost", e.target.value)}
              readOnly={!!(form.litres && form.costPerLitre)}
              className={`${inputClass} ${form.litres && form.costPerLitre ? "cursor-not-allowed bg-success-surface text-success-text-strong" : ""}`}
              placeholder="Auto-calculated or enter manually"
            />
            {form.litres && form.costPerLitre && (
              <p className="mt-1 text-xs text-success-text">
                Auto-calculated: {form.litres} L × ₹{form.costPerLitre} = ₹{form.totalCost}
              </p>
            )}
          </Field>

          <Field label="Fuel Station (Optional)">
            <GlassCombobox
              value={form.fuelStation}
              onChange={(val) => update("fuelStation", val)}
              options={stations.map((s) => ({ value: s, label: s }))}
              placeholder="e.g. Reliance Petrol Pump"
            />
          </Field>

          <div className="pt-4 flex justify-end gap-3 border-t border-separator-border">
            <button
              type="button"
              onClick={() => { clearFormDraft(draftKey); onClose(); }}
              className="px-4 py-2 text-body-medium text-text-primary bg-background-primary-default border border-border-button-default rounded-lg hover:bg-fill-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 text-body-medium text-on-solid bg-accent-solid rounded-lg hover:bg-accent-solid-hover shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              Save Fuel Log
            </button>
          </div>
        </form>
    </Dialog>
  );
}
