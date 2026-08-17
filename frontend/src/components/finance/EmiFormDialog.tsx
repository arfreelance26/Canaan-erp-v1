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

export const DRAFT_KEY = "erp_emi_form_draft";

type EmiFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (record: EmiRecord) => void;
  initialData: EmiRecord | null;
};

const RUN_CONFIG_KEY = "erp_truck_run_config";

function getKmPerDayFromCache(tyreLayout: string): number {
  try {
    const saved = JSON.parse(localStorage.getItem(RUN_CONFIG_KEY) ?? "{}");
    return Number(saved[tyreLayout]?.day) || 0;
  } catch { return 0; }
}

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
  monthlyFinanceCost: "",
  dailyFinanceCost: "",
  emiCostPerKm: "",
};

export function EmiFormDialog({ open, onClose, onSave, initialData }: EmiFormDialogProps) {
  const [form, setForm] = useState<Omit<EmiRecord, "id">>(emptyForm);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [runConfigCache, setRunConfigCache] = useState<Record<string, number>>({});

  useEffect(() => {
    trucksApi.list().then(setTrucks).catch(() => setTrucks([]));
  }, []);

  // Load run config from API; fall back to localStorage cache
  useEffect(() => {
    trucksApi.getRunConfig().then((rows: { tyre_layout: string; km_per_day: string | null }[]) => {
      const map: Record<string, number> = {};
      for (const r of rows) map[r.tyre_layout] = Number(r.km_per_day) || 0;
      // Merge into localStorage cache for offline use
      try {
        const cached = JSON.parse(localStorage.getItem(RUN_CONFIG_KEY) ?? "{}");
        for (const [layout, day] of Object.entries(map)) {
          cached[layout] = { ...(cached[layout] ?? {}), day: String(day) };
        }
        localStorage.setItem(RUN_CONFIG_KEY, JSON.stringify(cached));
      } catch {}
      setRunConfigCache(map);
    }).catch(() => {
      // Hydrate from localStorage if API unavailable
      try {
        const cached = JSON.parse(localStorage.getItem(RUN_CONFIG_KEY) ?? "{}");
        const map: Record<string, number> = {};
        for (const [layout, val] of Object.entries(cached)) {
          map[layout] = Number((val as { day?: string }).day) || 0;
        }
        setRunConfigCache(map);
      } catch {}
    });
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
  const emiAmt  = Number(form.emiAmount)  || 0;

  const costPerMonth        = tenure > 0 && loanAmt > 0 ? (loanAmt / tenure).toFixed(2)             : "";
  // Monthly Finance Cost = EMI Amount ÷ Tenure
  const monthlyFinanceCost  = tenure > 0 && emiAmt  > 0 ? (emiAmt  / tenure).toFixed(2)             : "";
  // Daily Finance Cost   = Monthly Finance Cost ÷ 26 working days
  const dailyFinanceCost    = monthlyFinanceCost         ? (Number(monthlyFinanceCost) / 26).toFixed(2) : "";

  // EMI Cost per Km = Daily Finance Cost ÷ Km/Day for the selected truck's tyre layout
  const selectedTruck   = trucks.find((t) => t.registrationNumber === form.truckRegistration);
  const kmPerDay        = selectedTruck
    ? (runConfigCache[selectedTruck.tyreLayout] || getKmPerDayFromCache(selectedTruck.tyreLayout))
    : 0;
  const emiCostPerKm    = dailyFinanceCost && kmPerDay > 0
    ? (Number(dailyFinanceCost) / kmPerDay).toFixed(4)
    : "";

  // Keep all computed values in form state so they are persisted to the API
  useEffect(() => {
    setForm((prev) => ({ ...prev, costPerMonth, monthlyFinanceCost, dailyFinanceCost, emiCostPerKm }));
  }, [costPerMonth, monthlyFinanceCost, dailyFinanceCost, emiCostPerKm]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Recompute all derived fields fresh at submit time using current render-scope
    // values — this guarantees they are saved to DB even if the useEffect sync
    // hadn't fired yet (e.g. runConfigCache loaded after the last state sync).
    const submitEmiAmt    = Number(form.emiAmount)    || 0;
    const submitTenure    = Number(form.tenureMonths) || 0;
    const submitLoanAmt   = Number(form.loanAmount)   || 0;
    const freshCostPerMonth       = submitTenure > 0 && submitLoanAmt > 0 ? (submitLoanAmt / submitTenure).toFixed(2) : "";
    const freshMonthlyFinanceCost = submitTenure > 0 && submitEmiAmt  > 0 ? (submitEmiAmt  / submitTenure).toFixed(2) : "";
    const freshDailyFinanceCost   = freshMonthlyFinanceCost ? (Number(freshMonthlyFinanceCost) / 26).toFixed(2) : "";
    const freshEmiCostPerKm       = freshDailyFinanceCost && kmPerDay > 0
      ? (Number(freshDailyFinanceCost) / kmPerDay).toFixed(4)
      : "";

    // Synthesize the payment date string from the day of the month
    let finalPaymentDate = form.emiPaymentDate;
    const paymentDay = Number(form.emiPaymentDate);
    if (!isNaN(paymentDay) && paymentDay > 0 && paymentDay <= 31) {
      const today = new Date();
      let nextPayment = new Date(today.getFullYear(), today.getMonth(), paymentDay);
      if (nextPayment < today) {
        nextPayment = new Date(today.getFullYear(), today.getMonth() + 1, paymentDay);
      }
      const year  = nextPayment.getFullYear();
      const month = String(nextPayment.getMonth() + 1).padStart(2, "0");
      const day   = String(nextPayment.getDate()).padStart(2, "0");
      finalPaymentDate = `${year}-${month}-${day}`;
    }

    onSave({
      id: initialData?.id ?? crypto.randomUUID(),
      ...form,
      costPerMonth:        freshCostPerMonth,
      monthlyFinanceCost:  freshMonthlyFinanceCost,
      dailyFinanceCost:    freshDailyFinanceCost,
      emiCostPerKm:        freshEmiCostPerKm,
      emiPaymentDate:      finalPaymentDate,
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

          <Field label="Monthly Finance Cost">
            <input
              type="text"
              readOnly
              disabled
              value={monthlyFinanceCost ? `₹ ${Number(monthlyFinanceCost).toLocaleString("en-IN")}` : ""}
              className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
              placeholder="EMI Amount ÷ Tenure"
            />
          </Field>

          <Field label="Daily Finance Cost">
            <input
              type="text"
              readOnly
              disabled
              value={dailyFinanceCost ? `₹ ${Number(dailyFinanceCost).toLocaleString("en-IN")}` : ""}
              className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
              placeholder="Monthly Finance Cost ÷ 26"
            />
          </Field>

          <Field label="EMI Cost per Km">
            <input
              type="text"
              readOnly
              disabled
              value={emiCostPerKm ? `₹ ${Number(emiCostPerKm).toLocaleString("en-IN", { minimumFractionDigits: 4 })}` : ""}
              className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
              placeholder={
                !form.truckRegistration
                  ? "Select a truck first"
                  : kmPerDay === 0
                  ? `No run config for ${selectedTruck?.tyreLayout ?? "this layout"}`
                  : "Daily Finance Cost ÷ Km/Day"
              }
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
