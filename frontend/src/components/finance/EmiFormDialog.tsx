"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { trucksApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import type { EmiRecord } from "@/types/finance";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";

const DRAFT_KEY = "erp_emi_form_draft";

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
  costPerMonth: "",
};

export function EmiFormDialog({ open, onClose, onSave, initialData }: EmiFormDialogProps) {
  const [form, setForm] = useState<Omit<EmiRecord, "id">>(emptyForm);
  const [trucks, setTrucks] = useState<Truck[]>([]);

  useEffect(() => {
    trucksApi.list().then(setTrucks).catch(() => setTrucks([]));
  }, []);

  useEffect(() => {
    if (open) {
      const { id: _id, ...rest } = initialData ?? { id: "", ...emptyForm };
      setForm(rest);
    }
  }, [open, initialData]);

  useFormDraft(DRAFT_KEY, open && !initialData, form, setForm);

  function update<K extends keyof Omit<EmiRecord, "id">>(key: K, value: Omit<EmiRecord, "id">[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-calculate tenure whenever either date changes
      if (key === "emiStartDate" || key === "emiEndDate") {
        const start = key === "emiStartDate" ? String(value) : prev.emiStartDate;
        const end   = key === "emiEndDate"   ? String(value) : prev.emiEndDate;
        if (start && end) {
          const s = new Date(start), e = new Date(end);
          const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
          next.tenureMonths = months > 0 ? String(months) : "";
        } else {
          next.tenureMonths = "";
        }
      }
      return next;
    });
  }

  const tenure = Number(form.tenureMonths) || 0;
  const loanAmt = Number(form.loanAmount) || 0;
  const costPerMonth = tenure > 0 && loanAmt > 0 ? (loanAmt / tenure).toFixed(2) : "";

  // Keep costPerMonth in form state so it is sent to the API
  useEffect(() => {
    setForm((prev) => ({ ...prev, costPerMonth }));
  }, [costPerMonth]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    
    // Synthesize the date string from the day of the month
    let finalPaymentDate = form.emiPaymentDate;
    const paymentDay = Number(form.emiPaymentDate);
    if (!isNaN(paymentDay) && paymentDay > 0 && paymentDay <= 31) {
      const today = new Date();
      let nextPayment = new Date(today.getFullYear(), today.getMonth(), paymentDay);
      if (nextPayment < today) {
        nextPayment = new Date(today.getFullYear(), today.getMonth() + 1, paymentDay);
      }
      // Keep YYYY-MM-DD format
      const year = nextPayment.getFullYear();
      const month = String(nextPayment.getMonth() + 1).padStart(2, "0");
      const day = String(nextPayment.getDate()).padStart(2, "0");
      finalPaymentDate = `${year}-${month}-${day}`;
    }

    if (!initialData) clearFormDraft(DRAFT_KEY);
    onSave({
      id: initialData?.id ?? crypto.randomUUID(),
      ...form,
      emiPaymentDate: finalPaymentDate,
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

          <Field label="Truck Registration Number" required>
            <GlassSelect
              value={form.truckRegistration}
              onChange={(val) => update("truckRegistration", val)}
              options={[
                { value: "", label: "Select truck" },
                ...trucks.map((t) => ({ value: t.registrationNumber, label: t.registrationNumber })),
              ]}
            />
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
            <DecimalInput type="number"
              required
              min="0"
              value={form.loanAmount}
              onChange={(e) => update("loanAmount", e.target.value)}
              className={inputClass}
              placeholder="e.g. 2400000"
            />
          </Field>

          <Field label="EMI Amount" required>
            <DecimalInput type="number"
              required
              min="0"
              value={form.emiAmount}
              onChange={(e) => update("emiAmount", e.target.value)}
              className={inputClass}
              placeholder="e.g. 48500"
            />
          </Field>

          <Field label="EMI Start Date" required>
            <DatePickerInput
              required
              value={form.emiStartDate}
              onChange={(v) => update("emiStartDate", v)}
              className={inputClass}
            />
          </Field>

          <Field label="EMI End Date" required>
            <DatePickerInput
              required
              value={form.emiEndDate}
              onChange={(v) => update("emiEndDate", v)}
              className={inputClass}
            />
          </Field>

          <Field label="Tenure (in Months)">
            <input
              type="text"
              readOnly
              disabled
              value={form.tenureMonths ? `${form.tenureMonths} months` : ""}
              className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
              placeholder="Auto-calculated from dates"
            />
          </Field>

          <Field label="Cost Per Month">
            <input
              type="text"
              readOnly
              disabled
              value={costPerMonth ? `₹ ${Number(costPerMonth).toLocaleString("en-IN")}` : ""}
              className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
              placeholder="Auto-calculated"
            />
          </Field>

          <Field label="Date of EMI Payment (Day of Month)" required>
            <DecimalInput type="number"
              required
              min="1"
              max="31"
              value={form.emiPaymentDate ? (form.emiPaymentDate.includes("-") ? new Date(form.emiPaymentDate).getDate() : form.emiPaymentDate) : ""}
              onChange={(e) => update("emiPaymentDate", e.target.value)}
              className={inputClass}
              placeholder="e.g. 5"
              title="Day of the month (1-31)"
            />
          </Field>
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => { clearFormDraft(DRAFT_KEY); onClose(); }}
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
