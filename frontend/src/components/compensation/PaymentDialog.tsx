"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import type { CompensationTransactionType } from "@/types/compensation";
import { todayIst } from "@/lib/format-date";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";

type PaymentDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (payment: { amount: number; date: string; note: string; tripNumber?: string }) => void;
  type: CompensationTransactionType;
  personName: string;
  tripNumbers?: string[];
};

const emptyForm = { amount: "", date: todayIst(), note: "", tripNumber: "" };

export function PaymentDialog({ open, onClose, onSave, type, personName, tripNumbers }: PaymentDialogProps) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, date: todayIst() });
    }
  }, [open]);

  const draftKey = `erp_payment_dialog_draft_${type}`;
  useFormDraft(draftKey, open, form, setForm);

  function update<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFormDraft(draftKey);
    onSave({
      amount: Number(form.amount),
      date: form.date,
      note: form.note,
      ...(tripNumbers ? { tripNumber: form.tripNumber } : {}),
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Pay ${type} - ${personName}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Amount">
          <DecimalInput type="number"
            required
            min="0"
            value={form.amount}
            onChange={(e) => update("amount", e.target.value)}
            className={inputClass}
            placeholder="e.g. 5000"
          />
        </Field>

        <Field label="Date">
          <DatePickerInput
            required
            value={form.date}
            onChange={(v) => update("date", v)}
            className={inputClass}
          />
        </Field>

        {tripNumbers && (
          <Field label="Trip Number">
            <GlassCombobox
              required
              value={form.tripNumber}
              onChange={(val) => update("tripNumber", val)}
              placeholder="e.g. TRP-1050"
              options={tripNumbers.map(trip => ({ value: trip, label: trip }))}
            />
          </Field>
        )}

        <Field label="Note">
          <input
            type="text"
            value={form.note}
            onChange={(e) => update("note", e.target.value)}
            className={inputClass}
            placeholder="Optional note"
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
            Pay {type}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
