import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Droplets, Save } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { AdBlueLog } from "@/types/adblue-log";
import { adblueLogsApi, type AdBlueManufacturer } from "@/lib/api";
import { manufacturerRate } from "@/components/fleet/TruckManufacturersDialog";
import { todayIst } from "@/lib/format-date";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";

type AdBlueLogFormDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Resolves true when saved; false keeps the form as typed so it can be corrected. */
  onSave: (log: Omit<AdBlueLog, "id" | "createdAt" | "enteredByName" | "version">, reason?: string) => Promise<boolean>;
  truck: Truck;
  /** The truck's manufacturer — its AdBlue rate pre-fills Cost Per Litre. */
  manufacturer?: AdBlueManufacturer | null;
  /** The log being edited; leave out to enter a new one. */
  log?: AdBlueLog | null;
  /** An edit that goes to approval instead of saving: asks for a reason. */
  requiresApproval?: boolean;
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

function formFromLog(log: AdBlueLog) {
  return {
    date: log.date,
    odometer: String(Number(log.odometer)),
    litres: log.litres,
    pricePerLitre: log.pricePerLitre,
    totalCost: log.totalCost,
    fillingLocation: log.fillingLocation ?? "",
  };
}

function totalOf(litres: string, price: string): string {
  const l = parseFloat(litres);
  const p = parseFloat(price);
  return !isNaN(l) && l > 0 && !isNaN(p) && p >= 0 ? (l * p).toFixed(2) : "";
}

export function AdBlueLogFormDialog({ open, onClose, onSave, truck, manufacturer, log, requiresApproval }: AdBlueLogFormDialogProps) {
  // Lazy initializer — a fresh object per mount, with "today" computed at
  // open-time rather than once at module load.
  const [form, setForm] = useState(() => (log ? formFromLog(log) : emptyForm()));
  const [reason, setReason] = useState("");

  // Drafts are for new entries only; an edit always starts from the saved log.
  const draftKey = `erp_adblue_log_draft_${truck.id}`;
  useFormDraft(draftKey, open && !log, form, setForm);

  // Where the pre-filled Cost Per Litre came from (shown under the field).
  const [priceSource, setPriceSource] = useState<string | null>(null);
  const rate = manufacturerRate(manufacturer);

  // Cost Per Litre starts at the manufacturer's AdBlue rate, else this truck's
  // last logged price — still editable, since a fill can cost more or less.
  useEffect(() => {
    if (!open || log) return;
    setPriceSource(null);
    const prefill = (price: string, source: string) =>
      setForm((prev) => {
        if (prev.pricePerLitre) return prev;  // a draft / typed price wins
        setPriceSource(source);
        return { ...prev, pricePerLitre: price, totalCost: totalOf(prev.litres, price) };
      });
    if (rate != null) {
      prefill(rate.toFixed(2), `From ${manufacturer?.name}'s AdBlue rate`);
      return;
    }
    adblueLogsApi.listLogs(truck.id)
      .then((logs) => {
        const last = logs[0]?.pricePerLitre;
        if (last) prefill(last, "From this truck's last fill");
      })
      .catch(() => {});
  }, [open, log, truck.id, rate, manufacturer?.name]);

  function update(field: "date" | "odometer" | "litres" | "pricePerLitre" | "fillingLocation", value: string) {
    if (field === "pricePerLitre") setPriceSource(null);
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "litres" || field === "pricePerLitre") next.totalCost = totalOf(next.litres, next.pricePerLitre);
      return next;
    });
  }

  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.totalCost || saving || (requiresApproval && !reason.trim())) return;
    setSaving(true);
    const saved = await onSave({
      truckId: truck.id,
      date: form.date,
      odometer: form.odometer,
      litres: form.litres,
      pricePerLitre: form.pricePerLitre,
      totalCost: form.totalCost,
      fillingLocation: form.fillingLocation || null,
      remarks: log?.remarks ?? null,
    }, reason.trim());
    setSaving(false);
    // Refused (e.g. odometer not past the last fill): keep everything typed.
    if (!saved || log) return;
    clearFormDraft(draftKey);
    setForm(emptyForm());
  }

  return (
    <Dialog open={open} onClose={onClose} title={log ? "Edit AdBlue Log" : "Enter AdBlue Log"}>
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
          {priceSource && <p className="mt-1 text-xs text-blue-600">{priceSource} — change it if this fill cost differently.</p>}
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

        {requiresApproval && (
          <Field label="Reason for edit" required>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="Explain why this log needs to be changed…"
            />
            <p className="mt-1 text-xs text-amber-700">Requires approval — the log changes once this request is approved.</p>
          </Field>
        )}

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => { if (!log) clearFormDraft(draftKey); onClose(); }}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!form.totalCost || saving || (requiresApproval && !reason.trim())}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {requiresApproval ? "Submit Request" : log ? "Save Changes" : "Save AdBlue Log"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
