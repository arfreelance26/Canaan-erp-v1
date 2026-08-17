"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { tripExpenseRatesApi, type TripExpenseRate } from "@/lib/api";
import { Receipt, CheckCircle2, Loader2, AlertCircle, Anchor, ShieldCheck, Forklift, Zap } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormData = {
  portPassExpense: string;       portPassExpenseAuto: boolean;
  weightSheetExpense: string;    weightSheetExpenseAuto: boolean;
  mamolExpense: string;          mamolExpenseAuto: boolean;
  claimableMamolExpense: string; claimableMamolExpenseAuto: boolean;
  trafficRtoExpense: string;     trafficRtoExpenseAuto: boolean;
  liftOnOffExpense: string;      liftOnOffExpenseAuto: boolean;
  craneOperatorExpense: string;  craneOperatorExpenseAuto: boolean;
  parkingExpense: string;        parkingExpenseAuto: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const EMPTY_FORM: FormData = {
  portPassExpense: "",       portPassExpenseAuto: false,
  weightSheetExpense: "",    weightSheetExpenseAuto: false,
  mamolExpense: "",          mamolExpenseAuto: false,
  claimableMamolExpense: "", claimableMamolExpenseAuto: false,
  trafficRtoExpense: "",     trafficRtoExpenseAuto: false,
  liftOnOffExpense: "",      liftOnOffExpenseAuto: false,
  craneOperatorExpense: "",  craneOperatorExpenseAuto: false,
  parkingExpense: "",        parkingExpenseAuto: false,
};

function rateToForm(r: TripExpenseRate): FormData {
  const fmt = (v: number) => (v === 0 ? "" : String(v));
  return {
    portPassExpense: fmt(r.portPassExpense),             portPassExpenseAuto: r.portPassExpenseAuto,
    weightSheetExpense: fmt(r.weightSheetExpense),       weightSheetExpenseAuto: r.weightSheetExpenseAuto,
    mamolExpense: fmt(r.mamolExpense),                   mamolExpenseAuto: r.mamolExpenseAuto,
    claimableMamolExpense: fmt(r.claimableMamolExpense), claimableMamolExpenseAuto: r.claimableMamolExpenseAuto,
    trafficRtoExpense: fmt(r.trafficRtoExpense),         trafficRtoExpenseAuto: r.trafficRtoExpenseAuto,
    liftOnOffExpense: fmt(r.liftOnOffExpense),           liftOnOffExpenseAuto: r.liftOnOffExpenseAuto,
    craneOperatorExpense: fmt(r.craneOperatorExpense),   craneOperatorExpenseAuto: r.craneOperatorExpenseAuto,
    parkingExpense: fmt(r.parkingExpense),               parkingExpenseAuto: r.parkingExpenseAuto,
  };
}

function formToPayload(f: FormData) {
  const num = (v: string) => (v === "" ? 0 : parseFloat(v) || 0);
  return {
    portPassExpense: num(f.portPassExpense),             portPassExpenseAuto: f.portPassExpenseAuto,
    weightSheetExpense: num(f.weightSheetExpense),       weightSheetExpenseAuto: f.weightSheetExpenseAuto,
    mamolExpense: num(f.mamolExpense),                   mamolExpenseAuto: f.mamolExpenseAuto,
    claimableMamolExpense: num(f.claimableMamolExpense), claimableMamolExpenseAuto: f.claimableMamolExpenseAuto,
    trafficRtoExpense: num(f.trafficRtoExpense),         trafficRtoExpenseAuto: f.trafficRtoExpenseAuto,
    liftOnOffExpense: num(f.liftOnOffExpense),           liftOnOffExpenseAuto: f.liftOnOffExpenseAuto,
    craneOperatorExpense: num(f.craneOperatorExpense),   craneOperatorExpenseAuto: f.craneOperatorExpenseAuto,
    parkingExpense: num(f.parkingExpense),               parkingExpenseAuto: f.parkingExpenseAuto,
  };
}

// ---------------------------------------------------------------------------
// Save-state chip
// ---------------------------------------------------------------------------

function SaveChip({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const map = {
    saving: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: "Saving…",     cls: "bg-gray-100 text-gray-500" },
    saved:  { icon: <CheckCircle2 className="h-3.5 w-3.5" />,         text: "Saved",        cls: "bg-emerald-50 text-emerald-600" },
    error:  { icon: <AlertCircle className="h-3.5 w-3.5" />,          text: "Save failed",  cls: "bg-red-50 text-red-500" },
  } as const;
  const { icon, text, cls } = map[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      {icon}{text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Expense row: label | auto-populate toggle | ₹ input
// ---------------------------------------------------------------------------

function ExpenseRow({
  label,
  sublabel,
  value,
  autoPopulate,
  onChange,
  onAutoChange,
  onBlur,
}: {
  label: string;
  sublabel?: string;
  value: string;
  autoPopulate: boolean;
  onChange: (v: string) => void;
  onAutoChange: (v: boolean) => void;
  onBlur: () => void;
}) {
  const hasValue = value !== "" && parseFloat(value) > 0;

  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-5 px-5 py-3.5 transition-colors hover:bg-gray-50/70">
      {/* Label */}
      <div>
        <p className="text-sm font-medium text-gray-800 leading-snug">{label}</p>
        {sublabel && <p className="mt-0.5 text-xs text-gray-400 leading-snug">{sublabel}</p>}
      </div>

      {/* Auto-populate toggle */}
      <button
        type="button"
        disabled={!hasValue}
        onClick={() => { if (hasValue) { onAutoChange(!autoPopulate); onBlur(); } }}
        title={
          !hasValue
            ? "Set a value first to enable auto-populate"
            : autoPopulate
            ? "Auto-populate is ON — click to disable"
            : "Click to auto-populate this field in new trip sheets"
        }
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
          !hasValue
            ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300"
            : autoPopulate
            ? "border-blue-300 bg-blue-600 text-white shadow-sm"
            : "border-gray-200 bg-white text-gray-400 hover:border-blue-200 hover:text-blue-500"
        }`}
      >
        <Zap className={`h-3 w-3 ${autoPopulate && hasValue ? "fill-white" : ""}`} />
        Auto-populate
      </button>

      {/* Amount input */}
      <div className="relative w-40">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 select-none">
          ₹
        </span>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-8 pr-3 text-sm font-medium text-gray-900 transition-colors focus:border-blue-500 focus:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section card
// ---------------------------------------------------------------------------

function Section({
  icon: Icon,
  title,
  accentCls,
  children,
}: {
  icon: React.ElementType;
  title: string;
  accentCls: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className={`flex items-center gap-2.5 border-b border-gray-100 px-5 py-3.5 ${accentCls}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TripExpensesPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const [config, setConfig] = useState<TripExpenseRate | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configRef = useRef<TripExpenseRate | null>(null);
  const formRef = useRef<FormData>(EMPTY_FORM);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { formRef.current = form; }, [form]);

  useEffect(() => {
    if (!ready) return;
    if (user?.softwareDesignation !== "Admin") { router.replace("/"); return; }
    tripExpenseRatesApi.getConfig()
      .then((r) => { setConfig(r); setForm(rateToForm(r)); })
      .catch(() => {})
      .catch(() => {}).finally(() => setLoading(false));
  }, [ready, user, router]);

  const persist = useCallback(async () => {
    setSaveState("saving");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    try {
      const result = await tripExpenseRatesApi.saveConfig(
        formToPayload(formRef.current),
        configRef.current?.version,
      );
      setConfig(result);
      setSaveState("saved");
      savedTimer.current = setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
      savedTimer.current = setTimeout(() => setSaveState("idle"), 3000);
    }
  }, []);

  // Generic setter for a string value field.
  // Also updates formRef synchronously so persist() always reads the latest state.
  const setVal = (key: keyof FormData) => (v: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: v };
      const autoKey = `${key}Auto` as keyof FormData;
      if ((v === "" || parseFloat(v) === 0) && autoKey in next) {
        (next as Record<string, unknown>)[autoKey] = false;
      }
      formRef.current = next;
      return next;
    });
  };

  // Setter for the auto boolean — updates formRef synchronously so persist() fired
  // in the same click event sees the new value (React batches the state update and
  // runs updater functions later, so we cannot rely on an updater to write the ref).
  const setAuto = (key: keyof FormData) => (v: boolean) => {
    const next = { ...formRef.current, [key]: v };
    formRef.current = next;
    setForm(next);
  };

  if (!ready) return null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
          <Receipt className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Trip Expenses</h1>
            <SaveChip state={saveState} />
          </div>
          <p className="text-sm text-gray-500">
            Set default amounts · toggle{" "}
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              <Zap className="h-2.5 w-2.5 fill-white" /> Auto-populate
            </span>{" "}
            to pre-fill those fields in every new trip sheet
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-gray-200 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Section 1 */}
          <Section icon={Anchor} title="Port & Operational Charges" accentCls="bg-blue-50 text-blue-700">
            <ExpenseRow
              label="Port Pass Expense" sublabel="பாஸ்"
              value={form.portPassExpense} autoPopulate={form.portPassExpenseAuto}
              onChange={setVal("portPassExpense")} onAutoChange={setAuto("portPassExpenseAuto")} onBlur={persist}
            />
            <ExpenseRow
              label="Weight Sheet Expense" sublabel="எடை"
              value={form.weightSheetExpense} autoPopulate={form.weightSheetExpenseAuto}
              onChange={setVal("weightSheetExpense")} onAutoChange={setAuto("weightSheetExpenseAuto")} onBlur={persist}
            />
            <ExpenseRow
              label="Mamol Expense" sublabel="இறக்கு / ஏற்று மாமூல்"
              value={form.mamolExpense} autoPopulate={form.mamolExpenseAuto}
              onChange={setVal("mamolExpense")} onAutoChange={setAuto("mamolExpenseAuto")} onBlur={persist}
            />
            <ExpenseRow
              label="Claimable Mamol Expense"
              value={form.claimableMamolExpense} autoPopulate={form.claimableMamolExpenseAuto}
              onChange={setVal("claimableMamolExpense")} onAutoChange={setAuto("claimableMamolExpenseAuto")} onBlur={persist}
            />
          </Section>

          {/* Section 2 */}
          <Section icon={ShieldCheck} title="Government & Compliance" accentCls="bg-amber-50 text-amber-700">
            <ExpenseRow
              label="Traffic / RTO / Police Expense"
              value={form.trafficRtoExpense} autoPopulate={form.trafficRtoExpenseAuto}
              onChange={setVal("trafficRtoExpense")} onAutoChange={setAuto("trafficRtoExpenseAuto")} onBlur={persist}
            />
          </Section>

          {/* Section 3 */}
          <Section icon={Forklift} title="Loading & Handling" accentCls="bg-emerald-50 text-emerald-700">
            <ExpenseRow
              label="Lift On / Off" sublabel="லிப்டான்"
              value={form.liftOnOffExpense} autoPopulate={form.liftOnOffExpenseAuto}
              onChange={setVal("liftOnOffExpense")} onAutoChange={setAuto("liftOnOffExpenseAuto")} onBlur={persist}
            />
            <ExpenseRow
              label="Crane Operator Expense"
              value={form.craneOperatorExpense} autoPopulate={form.craneOperatorExpenseAuto}
              onChange={setVal("craneOperatorExpense")} onAutoChange={setAuto("craneOperatorExpenseAuto")} onBlur={persist}
            />
            <ExpenseRow
              label="Parking Expenses"
              value={form.parkingExpense} autoPopulate={form.parkingExpenseAuto}
              onChange={setVal("parkingExpense")} onAutoChange={setAuto("parkingExpenseAuto")} onBlur={persist}
            />
          </Section>
        </div>
      )}
    </div>
  );
}
