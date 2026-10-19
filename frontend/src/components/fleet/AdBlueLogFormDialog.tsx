import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Droplets, Save } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { AdBlueLog } from "@/types/adblue-log";
import { adblueLogsApi } from "@/lib/api";
import { todayIst } from "@/lib/format-date";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";

type AdBlueLogFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (log: Omit<AdBlueLog, "id" | "createdAt" | "enteredByName" | "version">) => void;
  truck: Truck;
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

function emptyForm() {
  return {
    date: todayIst(),
    odometer: "",
    litres: "",
    pricePerLitre: "",
    totalCost: "",
    fillingLocation: "",
  };
}

function totalOf(litres: string, price: string): string {
  const l = parseFloat(litres);
  const p = parseFloat(price);
  return !isNaN(l) && l > 0 && !isNaN(p) && p >= 0 ? (l * p).toFixed(2) : "";
}

export function AdBlueLogFormDialog({ open, onClose, onSave, truck }: AdBlueLogFormDialogProps) {
  // Lazy initializer — a fresh object per mount, with "today" computed at
  // open-time rather than once at module load.
  const [form, setForm] = useState(emptyForm);

  const draftKey = `erp_adblue_log_draft_${truck.id}`;
  useFormDraft(draftKey, open, form, setForm);

  // Cost Per Litre starts at this truck's last logged price (still editable) —
  // AdBlue prices change, so it's entered per fill rather than fixed.
  useEffect(() => {
    if (!open) return;
    adblueLogsApi.listLogs(truck.id)
      .then((logs) => {
        const last = logs[0]?.pricePerLitre;
        if (!last) return;
        setForm((prev) => (prev.pricePerLitre ? prev : { ...prev, pricePerLitre: last, totalCost: totalOf(prev.litres, last) }));
      })
      .catch(() => {});
  }, [open, truck.id]);

  function update(field: "date" | "odometer" | "litres" | "pricePerLitre" | "fillingLocation", value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "litres" || field === "pricePerLitre") next.totalCost = totalOf(next.litres, next.pricePerLitre);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.totalCost) return;
    onSave({
      truckId: truck.id,
      date: form.date,
      odometer: form.odometer,
      litres: form.litres,
      pricePerLitre: form.pricePerLitre,
      totalCost: form.totalCost,
      fillingLocation: form.fillingLocation || null,
      remarks: null,
    });
    clearFormDraft(draftKey);
    setForm(emptyForm());
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
          <DecimalInput
            type="number"
            required
            step="0.01"
            min="0"
            value={form.pricePerLitre}
            onChange={(e) => update("pricePerLitre", e.target.value)}
            className={inputClass}
            placeholder="e.g. 60.00"
          />
        </Field>

        <Field label="Total Adblue Cost (₹)" required>
          <DecimalInput
            type="number"
            required
            readOnly
            value={form.totalCost}
            className={`${inputClass} cursor-not-allowed bg-green-50 text-green-800`}
            placeholder="Enter quantity and cost per litre"
          />
          {form.totalCost && (
            <p className="mt-1 text-xs text-green-700">
              Auto-calculated: {form.litres} L × ₹{Number(form.pricePerLitre).toFixed(2)} = ₹{form.totalCost}
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
            disabled={!form.totalCost}
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
