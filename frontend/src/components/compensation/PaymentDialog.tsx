"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import type { CompensationTransactionType } from "@/types/compensation";
import { todayIst } from "@/lib/format-date";
import { DateInput } from "@/components/ui/DateInput";

type PaymentDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (payment: { amount: number; date: string; note: string; tripNumber?: string }) => void;
  type: CompensationTransactionType;
  personName: string;
  tripNumbers?: string[];
};

export function PaymentDialog({ open, onClose, onSave, type, personName, tripNumbers }: PaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIst());
  const [note, setNote] = useState("");
  const [tripNumber, setTripNumber] = useState("");

  useEffect(() => {
    if (open) {
      setAmount("");
      setDate(todayIst());
      setNote("");
      setTripNumber("");
    }
  }, [open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      amount: Number(amount),
      date,
      note,
      ...(tripNumbers ? { tripNumber } : {}),
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Pay ${type} - ${personName}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Amount">
          <input
            type="number"
            required
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
            placeholder="e.g. 5000"
          />
        </Field>

        <Field label="Date">
          <DateInput
            required
            value={date}
            onChange={(v) => setDate(v)}
            className={inputClass}
          />
        </Field>

        {tripNumbers && (
          <Field label="Trip Number">
            <GlassCombobox
              required
              value={tripNumber}
              onChange={(val) => setTripNumber(val)}
              placeholder="e.g. TRP-1050"
              options={tripNumbers.map(trip => ({ value: trip, label: trip }))}
            />
          </Field>
        )}

        <Field label="Note">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            placeholder="Optional note"
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
            Pay {type}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
