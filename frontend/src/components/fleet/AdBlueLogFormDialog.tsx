import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Droplets, Save } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { AdBlueLog } from "@/types/adblue-log";
import { todayIst } from "@/lib/format-date";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";

type AdBlueLogFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (log: Omit<AdBlueLog, "id" | "createdAt" | "enteredByName" | "version">) => void;
  truck: Truck;
  /** The truck's manufacturer's default AdBlue price per litre — Cost Per
   * Litre is auto-fetched from this, never entered by hand. */
  pricePerLitre: string;
};

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function emptyForm(pricePerLitre: string) {
  return {
    date: todayIst(),
    odometer: "",
    litres: "",
    pricePerLitre,
    totalCost: "",
    fillingLocation: "",
  };
}

export function AdBlueLogFormDialog({ open, onClose, onSave, truck, pricePerLitre }: AdBlueLogFormDialogProps) {
  const priceNum = parseFloat(pricePerLitre);
  const priceAvailable = !isNaN(priceNum) && priceNum > 0;

  // Lazy initializer — a fresh object per mount, with "today" computed at
  // open-time rather than once at module load.
  const [form, setForm] = useState(() => emptyForm(pricePerLitre));

  const draftKey = `erp_adblue_log_draft_${truck.id}`;
  useFormDraft(draftKey, open, form, setForm);

  function update(field: "date" | "odometer" | "litres" | "fillingLocation", value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "litres") {
        const l = parseFloat(value);
        next.totalCost = (!isNaN(l) && l > 0 && priceAvailable)
          ? (l * priceNum).toFixed(2)
          : "";
      }
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!priceAvailable) return;
    onSave({
      truckId: truck.id,
      date: form.date,
      odometer: form.odometer,
      litres: form.litres,
      pricePerLitre,
      totalCost: form.totalCost,
      fillingLocation: form.fillingLocation || null,
      remarks: null,
    });
    clearFormDraft(draftKey);
    setForm(emptyForm(pricePerLitre));
  }

  return (
    <Dialog open={open} onClose={onClose} title="Enter AdBlue Log">
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100/50 text-blue-600">
          <Droplets className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold text-gray-900">{truck.registrationNumber}</p>
          <p className="text-sm text-gray-500">{truck.modelName}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Date" required>
          <DatePickerInput required value={form.date} onChange={(v) => update("date", v)} />
        </Field>

        <Field label="Odometer Reading" required>
          <DecimalInput
            type="number"
            required
            min="0"
            value={form.odometer}
            onChange={(e) => update("odometer", e.target.value)}
            className={inputClass}
            placeholder="e.g. 102500"
          />
        </Field>

        <Field label="Quantity (Litres)" required>
          <DecimalInput
            type="number"
            required
            step="0.01"
            min="0.01"
            value={form.litres}
            onChange={(e) => update("litres", e.target.value)}
            className={inputClass}
            placeholder="e.g. 10.00"
          />
        </Field>

        <Field label="Cost Per Litre (₹)" required>
          {priceAvailable ? (
            <div className={`${inputClass} flex cursor-not-allowed items-center justify-between bg-blue-50 text-blue-800`}>
              <span className="font-semibold">₹{priceNum.toFixed(2)}</span>
              <span className="text-[11px] font-medium text-blue-400">Auto-fetched · {truck.manufacturer}</span>
            </div>
          ) : (
            <div className={`${inputClass} bg-red-50 text-xs font-medium text-red-600`}>
              No default price set for {truck.manufacturer || "this manufacturer"}. Set one in Registered
              Manufacturers before logging.
            </div>
          )}
        </Field>

        <Field label="Total Adblue Cost (₹)" required>
          <DecimalInput
            type="number"
            required
            readOnly
            value={form.totalCost}
            className={`${inputClass} cursor-not-allowed bg-green-50 text-green-800`}
            placeholder="Enter quantity to auto-calculate"
          />
          {form.litres && priceAvailable && (
            <p className="mt-1 text-xs text-green-700">
              Auto-calculated: {form.litres} L × ₹{priceNum.toFixed(2)} = ₹{form.totalCost}
            </p>
          )}
        </Field>

        <Field label="Filling Location">
          <input
            type="text"
            value={form.fillingLocation}
            onChange={(e) => update("fillingLocation", e.target.value)}
            className={inputClass}
            placeholder="e.g. Canaan Yard, Ennore"
          />
        </Field>

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => { clearFormDraft(draftKey); onClose(); }}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!priceAvailable}
            title={priceAvailable ? undefined : "Set a default price for this manufacturer first"}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save AdBlue Log
          </button>
        </div>
      </form>
    </Dialog>
  );
}
