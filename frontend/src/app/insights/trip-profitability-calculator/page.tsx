"use client";

import { useEffect, useState } from "react";
import { IndianRupee, Truck as TruckIcon, Search, X, ChevronDown, Fuel, PencilLine, BookOpen, HelpCircle, CheckCircle2 } from "lucide-react";
import { trucksApi, branchesApi, financeApi, fuelLogsApi, adblueApi, tyreApi, tyreRangeConfigApi, maintenanceApi, type AdBlueManufacturer } from "@/lib/api";
import type { Branch } from "@/types/branch";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition";

type Truck = {
  id: string;
  registrationNumber: string;
  manufacturer: string;
  tyreLayout: string;
  branchRegisteredTo: string;
  adblueConsumption: string;
};


// ---------------------------------------------------------------------------
// Field definitions — 3 rows × 6 columns = 18 fields
// ---------------------------------------------------------------------------

type FieldType = "input" | "fetched" | "calculated";

type FieldDef = {
  label:        string;
  key:          string;
  type:         FieldType;
  nullLabel?:   string;
  overridable?: boolean;
};

const CARD_ACCENTS = [
  { badge: "bg-blue-50 text-blue-600"     },
  { badge: "bg-indigo-50 text-indigo-600" },
  { badge: "bg-slate-100 text-slate-600"  },
  { badge: "bg-sky-50 text-sky-700"       },
  { badge: "bg-violet-50 text-violet-600" },
  { badge: "bg-blue-50 text-blue-500"     },
];

const FIELD_ROWS: FieldDef[][] = [
  [
    { label: "Toll Pricing",  key: "toll",         type: "fetched"    },
    { label: "Driver Batta",  key: "driverBatta",  type: "calculated" },
    { label: "Cleaner Batta", key: "cleanerBatta", type: "calculated" },
  ],
  [
    { label: "EMI Per Day",   key: "emiPerDay",    type: "fetched",    overridable: true, nullLabel: "NULL" },
    { label: "EMI Per KM",    key: "emiPerKm",     type: "fetched",    overridable: true, nullLabel: "NULL" },
    { label: "EMI Expenses",  key: "emiExpenses",  type: "calculated", nullLabel: "NULL" },
  ],
  [
    { label: "Truck Mileage",        key: "truckMileage",      type: "fetched",    overridable: true },
    { label: "Mileage Cost Per KM",  key: "mileageCostPerKm",  type: "fetched",    overridable: true },
    { label: "Diesel Expenses",      key: "dieselExpenses",    type: "calculated" },
    { label: "AdBlue Cost Per KM",   key: "adbluePerKm",       type: "fetched",    overridable: true },
  ],
  [
    { label: "AdBlue Expenses",  key: "adblueExpenses", type: "calculated" },
    { label: "Tyre Cost Per KM", key: "tyrePerKm",      type: "fetched",    overridable: true },
    { label: "Tyre Expenses",    key: "tyreExpenses",   type: "calculated" },
  ],
  [
    { label: "Maint. Cost / Day", key: "maintPerDay",   type: "fetched", overridable: true },
    { label: "Maint. Cost / KM",  key: "maintPerKm",    type: "fetched", overridable: true },
    { label: "Maint. Expenses",   key: "maintExpenses", type: "calculated" },
  ],
];

// ---------------------------------------------------------------------------
// Fuel Cost Details card (right panel)
// ---------------------------------------------------------------------------

function FuelCostCard({
  value,
  onChange,
}: {
  value:    string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${open ? "border-b border-gray-100" : ""}`}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Fuel className="h-4 w-4" />
        </div>
        <h2 className="flex-1 text-sm font-bold text-gray-800">Fuel Cost Details</h2>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${open ? "rotate-180" : "rotate-0"}`}
        />
      </button>

      <div
        className={`flex flex-col overflow-hidden transition-all duration-300 ${
          open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-2 px-4 py-4">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Base Fuel Cost (Per Liter)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">₹</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 95.50"
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-7 pr-3 text-sm font-semibold text-gray-800 outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 transition"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toll Pricing Details card (right panel)
// ---------------------------------------------------------------------------

function TollPricingCard({
  layouts,
  tollPrices,
  onChange,
}: {
  layouts:    string[];
  tollPrices: Record<string, string>;
  onChange:   (layout: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${open ? "border-b border-gray-100" : ""}`}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <IndianRupee className="h-4 w-4" />
        </div>
        <h2 className="flex-1 text-sm font-bold text-gray-800">Toll Pricing Details</h2>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${open ? "rotate-180" : "rotate-0"}`}
        />
      </button>

      <div
        className={`flex flex-col divide-y divide-gray-100 overflow-hidden transition-all duration-300 ${
          open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {layouts.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-gray-400">
            No tyre layouts found in fleet.
          </p>
        ) : (
          layouts.map((layout) => (
            <div key={layout} className="flex flex-col gap-2 px-4 py-4">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {layout}
              </label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="₹ Toll amount"
                value={tollPrices[layout] ?? ""}
                onChange={(e) => onChange(layout, e.target.value)}
                className={inputClass}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-truck profitability card
// ---------------------------------------------------------------------------

function FieldCell({
  field,
  value,
  onChange,
}: {
  field:    FieldDef;
  value:    string | null;
  onChange: (key: string, val: string) => void;
}) {
  const hasValue  = value !== null && value !== "" && value !== "—";
  const emptyText = field.nullLabel ?? "—";

  if (field.type === "input") {
    return (
      <input
        type="number"
        min="0"
        step="any"
        placeholder="0"
        value={value ?? ""}
        onChange={(e) => onChange(field.key, e.target.value)}
        className="w-full rounded border border-gray-200 bg-white px-1 py-1 text-center text-[11px] font-bold outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition tabular-nums text-gray-800 placeholder:text-gray-300"
      />
    );
  }

  if (field.type === "fetched") {
    return (
      <div
        className={`flex w-full items-center justify-center rounded border px-1 py-1 text-center text-[11px] font-bold tabular-nums ${
          hasValue
            ? "border-teal-200 bg-teal-50 text-teal-600"
            : "border-gray-200 bg-gray-50 text-gray-300"
        }`}
      >
        {hasValue ? value : emptyText}
      </div>
    );
  }

  // calculated
  return (
    <div
      className={`flex w-full items-center justify-center rounded border px-1 py-1 text-center text-[11px] font-bold tabular-nums ${
        hasValue
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-gray-200 bg-white text-gray-300"
      }`}
    >
      {hasValue ? value : emptyText}
    </div>
  );
}

// Overridable field: dashed teal border + pencil icon in auto mode; amber when overridden.
// Switches to visible text on focus so the cursor is always accessible.
function OverridableCell({
  autoRawValue,
  overrideValue,
  onChange,
}: {
  autoRawValue:  string;
  overrideValue: string;
  onChange:      (v: string) => void;
}) {
  const [focused, setFocused]   = useState(false);
  const isOverridden             = overrideValue !== "";

  return (
    <div className="relative">
      <input
        type="number"
        min="0"
        step="any"
        value={overrideValue}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onWheel={(e) => e.currentTarget.blur()}
        placeholder={autoRawValue || "—"}
        className={`w-full rounded border px-1 py-1 text-center text-[11px] font-bold tabular-nums outline-none transition ${
          isOverridden
            ? "border-amber-300 bg-amber-50 text-amber-700 placeholder:text-amber-300 focus:border-amber-400 focus:ring-1 focus:ring-amber-100"
            : focused
              ? "border-teal-400 bg-white text-teal-700 placeholder:text-teal-300 focus:ring-1 focus:ring-teal-100"
              : "border-dashed border-teal-300 bg-teal-50 text-transparent placeholder:text-teal-600 cursor-text"
        }`}
      />
      {/* Pencil accent — signals this field is manually editable */}
      {!isOverridden && !focused && (
        <PencilLine className="pointer-events-none absolute right-0.5 top-0.5 h-2 w-2 text-teal-400" />
      )}
      {isOverridden && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Reset to auto-fetched"
          className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-white hover:bg-amber-500 transition-colors"
        >
          <X className="h-2 w-2" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Start Guide modal
// ---------------------------------------------------------------------------

const GUIDE_STEPS = [
  {
    title: "Enter Trip Details",
    body: "Fill in origin, destination, total distance (km), hire amount, and trip duration at the top of the page. These values drive every cost and revenue calculation.",
  },
  {
    title: "Set Fuel Cost",
    body: 'Open the "Fuel Cost Details" panel on the right and enter the current diesel price per litre. This sets the baseline for mileage cost per km across all trucks.',
  },
  {
    title: "Set Toll Pricing",
    body: 'Open "Toll Pricing Details" and enter the toll amount for each tyre layout in your fleet. The matching toll is applied automatically to each truck card.',
  },
  {
    title: "Review Auto-Fetched Values",
    body: "Each truck card auto-populates mileage (from fuel logs), EMI (from finance records), AdBlue cost, tyre cost, and maintenance cost from your fleet data. Teal fields are auto-fetched.",
  },
  {
    title: "Override When Needed",
    body: "Click any teal field (pencil icon) to enter a custom value. For paired fields — EMI Per Day ↔ Per KM, and Maint. Cost / Day ↔ / KM — entering one side automatically derives the other. Click the amber × to reset.",
  },
  {
    title: "Read the Results",
    body: "The card footer shows Total Expenses (sum of all cost fields), Total Profit (hire minus expenses), and Total Loss (expenses minus hire) for each truck on this trip.",
  },
];

function QuickStartGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-white">Quick Start Guide</h2>
            <p className="text-[11px] text-blue-200">Get up and running in 6 steps</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Steps */}
        <div className="flex flex-col divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
          {GUIDE_STEPS.map((step, i) => (
            <div key={i} className="flex gap-3.5 px-5 py-4 hover:bg-gray-50/60 transition-colors">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-extrabold text-white mt-0.5">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-gray-900 mb-0.5">{step.title}</p>
                <p className="text-[11px] leading-relaxed text-gray-500">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <p className="text-[10px] text-gray-400">All values are saved automatically — they persist across page reloads.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// How is this Calculated? modal
// ---------------------------------------------------------------------------

type FormulaSection = {
  title: string;
  color: string;
  rows: { field: string; formula: string }[];
};

const FORMULA_SECTIONS: FormulaSection[] = [
  {
    title: "Batta & Toll",
    color: "bg-violet-50 text-violet-700 border-violet-200",
    rows: [
      { field: "Toll Pricing",  formula: "Entered manually in Toll Pricing Details panel (per tyre layout)" },
      { field: "Driver Batta",  formula: "Driver Compensation % ÷ 100 × Hire Amount" },
      { field: "Cleaner Batta", formula: "Cleaner Batta Fee per Day × Trip Duration (days)" },
    ],
  },
  {
    title: "EMI",
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
    rows: [
      { field: "EMI Per Day",   formula: "Fetched from EMI Tracking records — or enter manually" },
      { field: "EMI Per KM",    formula: "EMI Per Day ÷ Expected Daily Range (km/day from Truck Run Config) — or enter manually" },
      { field: "EMI Expenses",  formula: "EMI Per KM × Total KM" },
    ],
  },
  {
    title: "Fuel & Mileage",
    color: "bg-sky-50 text-sky-700 border-sky-200",
    rows: [
      { field: "Truck Mileage",       formula: "Average km/L from fuel log history — or enter manually" },
      { field: "Mileage Cost Per KM", formula: "Fuel Cost Per Litre ÷ Truck Mileage — or enter manually" },
      { field: "Diesel Expenses",     formula: "Mileage Cost Per KM × Total KM" },
      { field: "AdBlue Cost Per KM",  formula: "AdBlue consumption ratio × AdBlue price per litre — or enter manually" },
    ],
  },
  {
    title: "AdBlue & Tyres",
    color: "bg-teal-50 text-teal-700 border-teal-200",
    rows: [
      { field: "AdBlue Expenses",  formula: "AdBlue Cost Per KM × Total KM" },
      { field: "Tyre Cost Per KM", formula: "Sum of (Tyre Purchase Cost ÷ Expected Range km) for each currently fitted tyre — or enter manually" },
      { field: "Tyre Expenses",    formula: "Tyre Cost Per KM × Total KM" },
    ],
  },
  {
    title: "Maintenance",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    rows: [
      { field: "Maint. Cost / Day", formula: "12-month maintenance total ÷ 12 months ÷ 26 working days — or enter manually" },
      { field: "Maint. Cost / KM",  formula: "Maint. Cost / Day ÷ Expected Daily Range (km/day from Truck Run Config) — or enter manually" },
      { field: "Maint. Expenses",   formula: "Maint. Cost / KM × Total KM" },
    ],
  },
  {
    title: "Footer Totals",
    color: "bg-slate-100 text-slate-700 border-slate-300",
    rows: [
      { field: "Total Expenses", formula: "Toll + Driver Batta + Cleaner Batta + EMI Expenses + Diesel Expenses + AdBlue Expenses + Tyre Expenses + Maint. Expenses" },
      { field: "Total Profit",   formula: "Hire Amount − Total Expenses  (shown only when result is positive)" },
      { field: "Total Loss",     formula: "Total Expenses − Hire Amount  (shown only when expenses exceed hire)" },
    ],
  },
];

function HowCalculatedModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="relative z-10 w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 bg-gradient-to-r from-slate-700 to-slate-800 dark:from-slate-100 dark:to-slate-200 px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <HelpCircle className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-white">How is this Calculated?</h2>
            <p className="text-[11px] text-slate-400 dark:text-slate-600">Formula reference for every field in the truck card</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Sections */}
        <div className="flex flex-col gap-0 max-h-[72vh] overflow-y-auto divide-y divide-gray-100">
          {FORMULA_SECTIONS.map((section) => (
            <div key={section.title} className="px-5 py-4">
              <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest mb-3 ${section.color}`}>
                {section.title}
              </span>
              <div className="flex flex-col gap-2">
                {section.rows.map((row) => (
                  <div key={row.field} className="grid grid-cols-[140px_1fr] gap-3 items-start">
                    <span className="text-[11px] font-bold text-gray-700 leading-snug pt-px">{row.field}</span>
                    <span className="text-[11px] text-gray-500 leading-snug">{row.formula}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="flex items-start gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <PencilLine className="h-3 w-3 text-teal-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-gray-400 leading-relaxed">
            <span className="font-semibold text-teal-600">Teal fields</span> are auto-fetched from fleet data.
            Click to override. <span className="font-semibold text-amber-600">Amber fields</span> are overridden — click × to reset.
            Paired Per Day ↔ Per KM fields cross-derive automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

function TruckProfitCard({
  truck,
  tollPrices,
  hireAmount,
  driverCompensationPct,
  cleanerBattaFeePerDay,
  tripDuration,
  totalKm,
  emiPerDay,
  emiPerKm,
  truckMileage,
  systemFuelCostPerLitre,
  fuelCostPerLitre,
  adbluePerKm,
  tyrePerKm,
  maintPerDay,
  maintPerKm,
  kmPerDay,
  accent,
}: {
  truck:                  Truck;
  tollPrices:             Record<string, string>;
  hireAmount:             string;
  driverCompensationPct:  string;
  cleanerBattaFeePerDay:  string;
  tripDuration:           string;
  totalKm:                string;
  emiPerDay:              string;
  emiPerKm:               string;
  truckMileage:             string;
  systemFuelCostPerLitre:   number;
  fuelCostPerLitre:         string;
  adbluePerKm:              string;
  tyrePerKm:                string;
  maintPerDay:              string;
  maintPerKm:               string;
  kmPerDay:                 number;
  accent:                   typeof CARD_ACCENTS[number];
}) {
  const [overrides, setOverrides] = useState<{
    manualMileage: string; manualCostPerKm: string; manualAdbluePerKm: string;
    manualTyrePerKm: string; manualEmiPerDay: string; manualEmiPerKm: string;
    manualMaintPerDay: string; manualMaintPerKm: string;
  }>(() => {
    const def = {
      manualMileage: "", manualCostPerKm: "", manualAdbluePerKm: "",
      manualTyrePerKm: "", manualEmiPerDay: "", manualEmiPerKm: "",
      manualMaintPerDay: "", manualMaintPerKm: "",
    };
    try {
      const saved = JSON.parse(localStorage.getItem(`erp_trip_calc_truck_${truck.id}`) ?? "{}");
      return { ...def, ...saved };
    } catch { return def; }
  });

  const {
    manualMileage, manualCostPerKm, manualAdbluePerKm, manualTyrePerKm,
    manualEmiPerDay, manualEmiPerKm, manualMaintPerDay, manualMaintPerKm,
  } = overrides;

  function setManualField(key: keyof typeof overrides) {
    return (value: string) =>
      setOverrides(prev => {
        const next = { ...prev, [key]: value };
        try { localStorage.setItem(`erp_trip_calc_truck_${truck.id}`, JSON.stringify(next)); } catch {}
        return next;
      });
  }

  const setManualMileage     = setManualField("manualMileage");
  const setManualCostPerKm   = setManualField("manualCostPerKm");
  const setManualAdbluePerKm = setManualField("manualAdbluePerKm");
  const setManualTyrePerKm   = setManualField("manualTyrePerKm");
  const setManualEmiPerDay   = setManualField("manualEmiPerDay");
  const setManualEmiPerKm    = setManualField("manualEmiPerKm");
  const setManualMaintPerDay = setManualField("manualMaintPerDay");
  const setManualMaintPerKm  = setManualField("manualMaintPerKm");

  const autoMileageNum  = parseFloat(truckMileage);
  const autoMileageValid = !isNaN(autoMileageNum) && autoMileageNum > 0;

  // Effective cost per km — drives mileageCostPerKm display AND dieselExpenses:
  //   1. Manual cost per km override → use directly
  //   2. Manual mileage override     → card fuel cost ÷ manual mileage
  //   3. Auto mode                   → system fuel cost ÷ auto mileage (card input ignored)
  const effectiveCostPerKmNum = (() => {
    if (manualCostPerKm && parseFloat(manualCostPerKm) > 0) return parseFloat(manualCostPerKm);
    if (manualMileage && parseFloat(manualMileage) > 0) {
      const fc = parseFloat(fuelCostPerLitre) || 0;
      const m  = parseFloat(manualMileage);
      return fc > 0 && m > 0 ? fc / m : 0;
    }
    return systemFuelCostPerLitre > 0 && autoMileageValid ? systemFuelCostPerLitre / autoMileageNum : 0;
  })();

  // Effective AdBlue cost per km — manual override takes priority over auto-fetched prop
  const effectiveAdbluePerKmNum = (() => {
    if (manualAdbluePerKm && parseFloat(manualAdbluePerKm) > 0) return parseFloat(manualAdbluePerKm);
    const v = parseFloat(adbluePerKm);
    return !isNaN(v) && v > 0 ? v : 0;
  })();

  // Placeholder raw strings for the OverridableCells
  const autoMileageRaw   = autoMileageValid ? autoMileageNum.toFixed(2) : "";
  const autoAdbluePerKmRaw = (() => {
    const v = parseFloat(adbluePerKm);
    return !isNaN(v) && v > 0 ? v.toFixed(4) : "";
  })();
  const effectiveTyrePerKmNum = (() => {
    if (manualTyrePerKm && parseFloat(manualTyrePerKm) > 0) return parseFloat(manualTyrePerKm);
    const v = parseFloat(tyrePerKm);
    return !isNaN(v) && v > 0 ? v : 0;
  })();
  const autoTyrePerKmRaw = (() => {
    const v = parseFloat(tyrePerKm);
    return !isNaN(v) && v > 0 ? v.toFixed(4) : "";
  })();
  const autoCostPerKmRaw = (() => {
    if (manualMileage && parseFloat(manualMileage) > 0) {
      const fc = parseFloat(fuelCostPerLitre) || 0;
      const m  = parseFloat(manualMileage);
      return fc > 0 && m > 0 ? (fc / m).toFixed(4) : "";
    }
    return systemFuelCostPerLitre > 0 && autoMileageValid
      ? (systemFuelCostPerLitre / autoMileageNum).toFixed(4)
      : "";
  })();

  // Effective EMI per day — manual day > derived from manual km > fetched
  const effectiveEmiPerDayNum = (() => {
    if (manualEmiPerDay && parseFloat(manualEmiPerDay) > 0) return parseFloat(manualEmiPerDay);
    if (manualEmiPerKm && parseFloat(manualEmiPerKm) > 0 && kmPerDay > 0)
      return parseFloat(manualEmiPerKm) * kmPerDay;
    const v = parseFloat(emiPerDay);
    return !isNaN(v) && v > 0 ? v : 0;
  })();

  // Effective EMI per km — manual km > derived from manual day > fetched
  const effectiveEmiPerKmNum = (() => {
    if (manualEmiPerKm && parseFloat(manualEmiPerKm) > 0) return parseFloat(manualEmiPerKm);
    if (manualEmiPerDay && parseFloat(manualEmiPerDay) > 0 && kmPerDay > 0)
      return parseFloat(manualEmiPerDay) / kmPerDay;
    const v = parseFloat(emiPerKm);
    return !isNaN(v) && v > 0 ? v : 0;
  })();

  const autoEmiPerDayRaw = (() => {
    if (!manualEmiPerDay && manualEmiPerKm && parseFloat(manualEmiPerKm) > 0 && kmPerDay > 0)
      return (parseFloat(manualEmiPerKm) * kmPerDay).toFixed(2);
    const v = parseFloat(emiPerDay);
    return !isNaN(v) && v > 0 ? v.toFixed(2) : "";
  })();

  const autoEmiPerKmRaw = (() => {
    if (!manualEmiPerKm && manualEmiPerDay && parseFloat(manualEmiPerDay) > 0 && kmPerDay > 0)
      return (parseFloat(manualEmiPerDay) / kmPerDay).toFixed(4);
    const v = parseFloat(emiPerKm);
    return !isNaN(v) && v > 0 ? v.toFixed(4) : "";
  })();

  // Effective maint per day — manual day > derived from manual km > fetched
  const effectiveMaintPerDayNum = (() => {
    if (manualMaintPerDay && parseFloat(manualMaintPerDay) > 0) return parseFloat(manualMaintPerDay);
    if (manualMaintPerKm && parseFloat(manualMaintPerKm) > 0 && kmPerDay > 0)
      return parseFloat(manualMaintPerKm) * kmPerDay;
    const v = parseFloat(maintPerDay);
    return !isNaN(v) && v > 0 ? v : 0;
  })();

  // Effective maint per km — manual km > derived from manual day > fetched
  const effectiveMaintPerKmNum = (() => {
    if (manualMaintPerKm && parseFloat(manualMaintPerKm) > 0) return parseFloat(manualMaintPerKm);
    if (manualMaintPerDay && parseFloat(manualMaintPerDay) > 0 && kmPerDay > 0)
      return parseFloat(manualMaintPerDay) / kmPerDay;
    const v = parseFloat(maintPerKm);
    return !isNaN(v) && v > 0 ? v : 0;
  })();

  // Auto raw values shown as placeholder when the other field drives the derivation
  const autoMaintPerDayRaw = (() => {
    if (!manualMaintPerDay && manualMaintPerKm && parseFloat(manualMaintPerKm) > 0 && kmPerDay > 0)
      return (parseFloat(manualMaintPerKm) * kmPerDay).toFixed(2);
    const v = parseFloat(maintPerDay);
    return !isNaN(v) && v > 0 ? v.toFixed(2) : "";
  })();

  const autoMaintPerKmRaw = (() => {
    if (!manualMaintPerKm && manualMaintPerDay && parseFloat(manualMaintPerDay) > 0 && kmPerDay > 0)
      return (parseFloat(manualMaintPerDay) / kmPerDay).toFixed(4);
    const v = parseFloat(maintPerKm);
    return !isNaN(v) && v > 0 ? v.toFixed(4) : "";
  })();

  // ── Footer totals ──────────────────────────────────────────────────────────
  const km   = parseFloat(totalKm);
  const kmN  = !isNaN(km) && km > 0 ? km : 0;
  const days = parseFloat(tripDuration);
  const hire = parseFloat(hireAmount);

  const tollAmt      = (() => { const v = parseFloat(tollPrices[truck.tyreLayout] ?? ""); return !isNaN(v) && v > 0 ? v : 0; })();
  const driverAmt    = (() => { const pct = parseFloat(driverCompensationPct); return !isNaN(pct) && pct > 0 && !isNaN(hire) && hire > 0 ? (pct / 100) * hire : 0; })();
  const cleanerAmt   = (() => { const fee = parseFloat(cleanerBattaFeePerDay); return !isNaN(fee) && fee > 0 && !isNaN(days) && days > 0 ? fee * days : 0; })();
  const emiAmt       = effectiveEmiPerKmNum > 0 && kmN > 0 ? effectiveEmiPerKmNum * kmN : 0;
  const dieselAmt    = effectiveCostPerKmNum > 0 && kmN > 0 ? effectiveCostPerKmNum * kmN : 0;
  const adblueAmt    = effectiveAdbluePerKmNum > 0 && kmN > 0 ? effectiveAdbluePerKmNum * kmN : 0;
  const tyreAmt      = effectiveTyrePerKmNum > 0 && kmN > 0 ? effectiveTyrePerKmNum * kmN : 0;
  const maintAmt     = effectiveMaintPerKmNum > 0 && kmN > 0 ? effectiveMaintPerKmNum * kmN : 0;

  const totalExpenses = tollAmt + driverAmt + cleanerAmt + emiAmt + dieselAmt + adblueAmt + tyreAmt + maintAmt;
  const hasExpenses   = totalExpenses > 0;
  const hireValid     = !isNaN(hire) && hire > 0;
  const profitOrLoss  = hireValid && hasExpenses ? hire - totalExpenses : null;

  function getValue(key: string): string | null {
    if (key === "cleanerBatta") {
      const fee  = parseFloat(cleanerBattaFeePerDay);
      const days = parseFloat(tripDuration);
      if (!isNaN(fee) && fee > 0 && !isNaN(days) && days > 0)
        return `₹${(fee * days).toFixed(2)}`;
      return null;
    }
    if (key === "driverBatta") {
      const pct  = parseFloat(driverCompensationPct);
      const hire = parseFloat(hireAmount);
      if (!isNaN(pct) && pct > 0 && !isNaN(hire) && hire > 0)
        return `₹${((pct / 100) * hire).toFixed(2)}`;
      return null;
    }
    if (key === "toll") {
      const v = tollPrices[truck.tyreLayout];
      return v && parseFloat(v) > 0 ? `₹${parseFloat(v).toFixed(2)}` : null;
    }
    if (key === "emiPerDay") {
      return effectiveEmiPerDayNum > 0 ? `₹${effectiveEmiPerDayNum.toFixed(2)}` : null;
    }
    if (key === "emiPerKm") {
      return effectiveEmiPerKmNum > 0 ? `₹${effectiveEmiPerKmNum.toFixed(4)}` : null;
    }
    if (key === "emiExpenses") {
      const km = parseFloat(totalKm);
      if (effectiveEmiPerKmNum > 0 && !isNaN(km) && km > 0)
        return `₹${(effectiveEmiPerKmNum * km).toFixed(2)}`;
      return null;
    }
    if (key === "truckMileage") {
      if (manualMileage && parseFloat(manualMileage) > 0)
        return `${parseFloat(manualMileage).toFixed(2)} km/L`;
      return autoMileageValid ? `${autoMileageNum.toFixed(2)} km/L` : null;
    }
    if (key === "mileageCostPerKm") {
      return effectiveCostPerKmNum > 0 ? `₹${effectiveCostPerKmNum.toFixed(4)}` : null;
    }
    if (key === "dieselExpenses") {
      const km = parseFloat(totalKm);
      if (effectiveCostPerKmNum > 0 && !isNaN(km) && km > 0)
        return `₹${(effectiveCostPerKmNum * km).toFixed(2)}`;
      return null;
    }
    if (key === "adblueExpenses") {
      const km = parseFloat(totalKm);
      if (effectiveAdbluePerKmNum > 0 && !isNaN(km) && km > 0)
        return `₹${(effectiveAdbluePerKmNum * km).toFixed(2)}`;
      return null;
    }
    if (key === "tyreExpenses") {
      const km = parseFloat(totalKm);
      if (effectiveTyrePerKmNum > 0 && !isNaN(km) && km > 0)
        return `₹${(effectiveTyrePerKmNum * km).toFixed(2)}`;
      return null;
    }
    if (key === "maintPerDay") {
      return effectiveMaintPerDayNum > 0 ? `₹${effectiveMaintPerDayNum.toFixed(2)}` : null;
    }
    if (key === "maintPerKm") {
      return effectiveMaintPerKmNum > 0 ? `₹${effectiveMaintPerKmNum.toFixed(4)}` : null;
    }
    if (key === "maintExpenses") {
      const km = parseFloat(totalKm);
      if (effectiveMaintPerKmNum > 0 && !isNaN(km) && km > 0)
        return `₹${(effectiveMaintPerKmNum * km).toFixed(2)}`;
      return null;
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden shadow-[0_4px_6px_-1px_rgba(0,0,0,0.07),0_8px_24px_-4px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_16px_-2px_rgba(0,0,0,0.1),0_16px_40px_-8px_rgba(0,0,0,0.08)] transition-shadow duration-300">
      {/* Card header */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600">
          <TruckIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 flex items-center gap-3">
          <p className="text-sm font-bold text-gray-900 truncate">{truck.registrationNumber}</p>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
              {truck.manufacturer}
            </span>
            {truck.tyreLayout && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${accent.badge}`}>
                {truck.tyreLayout}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Field rows */}
      {FIELD_ROWS.map((row, rowIdx) => (
        <div
          key={rowIdx}
          className={`flex bg-gray-50/60 ${rowIdx > 0 ? "border-t border-gray-100" : ""}`}
        >
          {row.map((field, colIdx) => (
            <div
              key={field.key}
              className={`flex flex-1 min-w-0 flex-col gap-1 py-2 px-1.5 ${colIdx > 0 ? "border-l border-gray-100" : ""}`}
            >
              <span className="text-[8.5px] font-semibold uppercase tracking-wide text-gray-400 leading-tight text-center truncate">
                {field.label}
              </span>
              {field.overridable ? (
                <OverridableCell
                  autoRawValue={
                    field.key === "truckMileage"    ? autoMileageRaw :
                    field.key === "adbluePerKm"     ? autoAdbluePerKmRaw :
                    field.key === "tyrePerKm"       ? autoTyrePerKmRaw :
                    field.key === "emiPerDay"       ? autoEmiPerDayRaw :
                    field.key === "emiPerKm"        ? autoEmiPerKmRaw :
                    field.key === "maintPerDay"     ? autoMaintPerDayRaw :
                    field.key === "maintPerKm"      ? autoMaintPerKmRaw :
                    autoCostPerKmRaw
                  }
                  overrideValue={
                    field.key === "truckMileage"    ? manualMileage :
                    field.key === "adbluePerKm"     ? manualAdbluePerKm :
                    field.key === "tyrePerKm"       ? manualTyrePerKm :
                    field.key === "emiPerDay"       ? manualEmiPerDay :
                    field.key === "emiPerKm"        ? manualEmiPerKm :
                    field.key === "maintPerDay"     ? manualMaintPerDay :
                    field.key === "maintPerKm"      ? manualMaintPerKm :
                    manualCostPerKm
                  }
                  onChange={
                    field.key === "truckMileage"    ? setManualMileage :
                    field.key === "adbluePerKm"     ? setManualAdbluePerKm :
                    field.key === "tyrePerKm"       ? setManualTyrePerKm :
                    field.key === "emiPerDay"       ? setManualEmiPerDay :
                    field.key === "emiPerKm"        ? setManualEmiPerKm :
                    field.key === "maintPerDay"     ? setManualMaintPerDay :
                    field.key === "maintPerKm"      ? setManualMaintPerKm :
                    setManualCostPerKm
                  }
                />
              ) : (
                <FieldCell
                  field={field}
                  value={getValue(field.key)}
                  onChange={() => {}}
                />
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Footer — Total Expenses / Total Profit / Total Loss */}
      <div className="grid grid-cols-3 divide-x divide-white/10 overflow-hidden rounded-b-xl">
        <div className="flex items-center justify-between gap-2 bg-slate-800 dark:bg-slate-100 px-3 py-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 leading-tight">
            Total<br />Expenses
          </span>
          <span className="text-xs font-extrabold tabular-nums text-white dark:text-gray-900">
            {hasExpenses ? `₹${totalExpenses.toFixed(2)}` : "—"}
          </span>
        </div>
        <div className={`flex items-center justify-between gap-2 px-3 py-2 ${profitOrLoss !== null && profitOrLoss >= 0 ? "bg-blue-600 dark:bg-blue-400" : "bg-blue-900 dark:bg-blue-50"}`}>
          <span className="text-[9px] font-bold uppercase tracking-widest text-blue-200 dark:text-blue-700 leading-tight">
            Total<br />Profit
          </span>
          <span className="text-xs font-extrabold tabular-nums text-white dark:text-blue-900">
            {profitOrLoss !== null && profitOrLoss >= 0 ? `₹${profitOrLoss.toFixed(2)}` : "—"}
          </span>
        </div>
        <div className={`flex items-center justify-between gap-2 px-3 py-2 ${profitOrLoss !== null && profitOrLoss < 0 ? "bg-red-600 dark:bg-red-400" : "bg-red-900 dark:bg-red-50"}`}>
          <span className="text-[9px] font-bold uppercase tracking-widest text-red-300 dark:text-red-700 leading-tight">
            Total<br />Loss
          </span>
          <span className="text-xs font-extrabold tabular-nums text-white dark:text-red-900">
            {profitOrLoss !== null && profitOrLoss < 0 ? `₹${Math.abs(profitOrLoss).toFixed(2)}` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TripProfitabilityCalculatorPage() {
  const [trucks, setTrucks]               = useState<Truck[]>([]);
  const [trucksLoading, setTrucksLoading] = useState(true);
  const [truckSearch, setTruckSearch]     = useState("");
  const [showGuide, setShowGuide]         = useState(false);
  const [showCalc, setShowCalc]           = useState(false);
  const [branches, setBranches]           = useState<Branch[]>([]);
  // registration → { emiPerDay, emiPerKm }
  const [emiMap, setEmiMap] = useState<Record<string, { emiPerDay: string; emiPerKm: string }>>({});
  // truck_id → average mileage km/L
  const [mileageMap, setMileageMap] = useState<Record<string, number>>({});
  // manufacturer name → defaultPricePerLitre (for AdBlue cost computation)
  const [adblueManufacturers, setAdblueManufacturers] = useState<AdBlueManufacturer[]>([]);
  // tyre data for per-truck cost computation
  const [tyreInventory, setTyreInventory]     = useState<TyreInventoryItem[]>([]);
  const [tyreFitments, setTyreFitments]       = useState<TyreFitmentRecord[]>([]);
  const [tyreRangeConfig, setTyreRangeConfig] = useState<{ tyre_type: string; range_km: number | null }[]>([]);
  // maintenance cost maps fetched directly from backend
  const [maintDailyMap, setMaintDailyMap] = useState<Record<string, number>>({});
  const [maintPerKmFetchedMap, setMaintPerKmFetchedMap] = useState<Record<string, number>>({});
  // tyre layout → km_per_day (for maint cost cross-derivation)
  const [runConfigs, setRunConfigs] = useState<{ tyre_layout: string; km_per_day: string | null }[]>([]);
  // system base cost — fetched once from API, used for auto-mode calculations (never changes with card input)
  const [systemFuelCostPerLitre, setSystemFuelCostPerLitre] = useState<number>(0);
  // card input — persisted; API value used only as fallback when nothing saved
  const [fuelCostPerLitre, setFuelCostPerLitre] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem("erp_trip_calc_page") ?? "{}");
      return s.fuelCostPerLitre ?? "";
    } catch { return ""; }
  });

  // Trip details — persisted to localStorage
  const [tripDetails, setTripDetails] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem("erp_trip_calc_page") ?? "{}");
      return {
        origin:       s.tripDetails?.origin       ?? "",
        destination:  s.tripDetails?.destination  ?? "",
        totalKm:      s.tripDetails?.totalKm      ?? "",
        hireAmount:   s.tripDetails?.hireAmount   ?? "",
        tripDuration: s.tripDetails?.tripDuration ?? "",
      };
    } catch {
      return { origin: "", destination: "", totalKm: "", hireAmount: "", tripDuration: "" };
    }
  });

  // Right-panel state — persisted to localStorage
  const [tollPrices, setTollPrices] = useState<Record<string, string>>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("erp_trip_calc_page") ?? "{}");
      return s.tollPrices ?? {};
    } catch { return {}; }
  });


  // Derived unique tyre layouts (sorted)
  const layouts = [...new Set(trucks.map((t) => t.tyreLayout).filter(Boolean))].sort();

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => {});
    adblueApi.listManufacturers().then(setAdblueManufacturers).catch(() => {});
    tyreApi.listInventory().then(setTyreInventory).catch(() => {});
    tyreApi.listFitments(undefined, true).then(setTyreFitments).catch(() => {});
    tyreRangeConfigApi.list().then(setTyreRangeConfig).catch(() => {});
    maintenanceApi.getMaintenanceCostPerDay().then(setMaintDailyMap).catch(() => {});
    maintenanceApi.getMaintenanceCostPerKm().then(setMaintPerKmFetchedMap).catch(() => {});
    trucksApi.getRunConfig().then(setRunConfigs).catch(() => {});

    fuelLogsApi.getAllFuelStats().then(setMileageMap).catch(() => {});
    fuelLogsApi.getBaseConfig().then((cfg) => {
      if (cfg.cost_per_litre != null) {
        setSystemFuelCostPerLitre(cfg.cost_per_litre);
        // Only use API value as fallback; don't overwrite a saved user value
        setFuelCostPerLitre((prev: string) => prev !== "" ? prev : String(cfg.cost_per_litre));
      }
    }).catch(() => {});

    financeApi.listEmi().then((records) => {
      const map: Record<string, { emiPerDay: string; emiPerKm: string }> = {};
      for (const r of records) {
        if (r.truckRegistration) {
          map[r.truckRegistration] = {
            emiPerDay: r.dailyFinanceCost,
            emiPerKm:  r.emiCostPerKm,
          };
        }
      }
      setEmiMap(map);
    }).catch(() => {});

    trucksApi
      .list()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((list: any[]) => {
        const mapped: Truck[] = list.map((t) => ({
          id:                 String(t.id),
          registrationNumber: t.registrationNumber ?? "",
          manufacturer:       t.manufacturer ?? "",
          tyreLayout:         t.tyreLayout ?? "",
          branchRegisteredTo: t.branchRegisteredTo ?? "",
          adblueConsumption:  String(t.adblueConsumption ?? ""),
        }));
        setTrucks(mapped);
      })
      .catch(() => {})
      .finally(() => setTrucksLoading(false));
  }, []);

  // Persist page-level state across reloads and navigation
  useEffect(() => {
    try {
      localStorage.setItem("erp_trip_calc_page", JSON.stringify({ tripDetails, tollPrices, fuelCostPerLitre }));
    } catch {}
  }, [tripDetails, tollPrices, fuelCostPerLitre]);

  // manufacturer name → AdBlue defaultPricePerLitre
  const adblueManufacturerPriceMap = Object.fromEntries(
    adblueManufacturers.map((m) => [m.name, m.defaultPricePerLitre ?? ""])
  );

  // truckId (string) → total tyre cost per km — mirrors ViewTyreDataDialog logic
  const tyreCostPerKmMap: Record<string, number> = (() => {
    const rangeMap: Record<string, number> = {};
    for (const r of tyreRangeConfig) {
      if (r.range_km != null && r.range_km > 0)
        rangeMap[r.tyre_type.toUpperCase()] = r.range_km;
    }
    const tyreById: Record<string, TyreInventoryItem> = {};
    for (const t of tyreInventory) tyreById[t.id] = t;
    const result: Record<string, number> = {};
    for (const f of tyreFitments) {
      if (f.removedOdometer !== null) continue;
      const tyre = tyreById[f.tyreId];
      if (!tyre) continue;
      const cost  = parseFloat(tyre.cost);
      const range = rangeMap[tyre.tyreType.toUpperCase()];
      if (!cost || !range) continue;
      result[f.truckId] = (result[f.truckId] ?? 0) + cost / range;
    }
    return result;
  })();


  // branchName → driverHaltDayPercentage
  const branchPctMap = Object.fromEntries(
    branches.map((b) => [b.name, b.driverHaltDayPercentage])
  );

  // branchName → cleanerBattaFee (per day)
  const cleanerBattaFeeMap = Object.fromEntries(
    branches.map((b) => [b.name, b.cleanerBattaFee])
  );

  // tyre layout → km_per_day (used for maint cost cross-derivation in each card)
  const tyreLayoutKmPerDayMap: Record<string, number> = {};
  for (const c of runConfigs) {
    const v = c.km_per_day ? parseFloat(String(c.km_per_day)) : null;
    if (v && v > 0) tyreLayoutKmPerDayMap[c.tyre_layout] = v;
  }

  const filtered = trucks.filter((t) =>
    t.registrationNumber.toLowerCase().includes(truckSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">

      {/* Modals */}
      {showGuide && <QuickStartGuideModal onClose={() => setShowGuide(false)} />}
      {showCalc  && <HowCalculatedModal  onClose={() => setShowCalc(false)}  />}

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Profitability Calculator</h1>
          <p className="mt-1 text-sm text-gray-500">
            Estimate and analyse profit margins per trip across your fleet.
          </p>
        </div>

        {/* Right controls — buttons + search */}
        <div className="flex items-center gap-2 mt-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <BookOpen className="h-3 w-3" />
            Quick Start Guide
          </button>
          <button
            type="button"
            onClick={() => setShowCalc(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <HelpCircle className="h-3 w-3" />
            How is this Calculated?
          </button>

        {/* Truck search */}
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search reg. no."
            value={truckSearch}
            onChange={(e) => setTruckSearch(e.target.value)}
            className="w-40 rounded-xl border border-gray-200 bg-white py-1.5 pl-8 pr-7 text-xs text-gray-800 shadow-sm outline-none placeholder:text-gray-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
          />
          {truckSearch && (
            <button
              type="button"
              onClick={() => setTruckSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        </div>{/* end right controls */}
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-4 gap-6 items-start">

        {/* Left — 75%: trip details + per-truck profitability cards */}
        <div className="col-span-3 flex flex-col gap-4">

          {/* Trip Details card */}
          <div className="rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06),0_4px_16px_-4px_rgba(0,0,0,0.05)]">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                <IndianRupee className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-sm font-bold text-gray-800">Trip Details</h2>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Origin Location",       key: "origin",       type: "text",   placeholder: "e.g. Chennai" },
                { label: "Destination Location",   key: "destination",  type: "text",   placeholder: "e.g. Mumbai"  },
                { label: "Total KM",               key: "totalKm",      type: "number", placeholder: "e.g. 1350"    },
                { label: "Total Hire Amount (₹)",  key: "hireAmount",   type: "number", placeholder: "e.g. 45000"   },
                { label: "Trip Duration (Days)",   key: "tripDuration", type: "number", placeholder: "e.g. 5"       },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</label>
                  <input
                    type={type}
                    min={type === "number" ? "0" : undefined}
                    step={type === "number" ? "any" : undefined}
                    placeholder={placeholder}
                    value={tripDetails[key as keyof typeof tripDetails]}
                    onChange={(e) => setTripDetails((p) => ({ ...p, [key]: e.target.value }))}
                    onWheel={type === "number" ? (e) => e.currentTarget.blur() : undefined}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Truck cards — 2-up grid */}
          <div className="grid grid-cols-2 gap-4 items-start">
          {trucksLoading ? (
            [1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
            ))
          ) : trucks.length === 0 ? (
            <div className="col-span-2 flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-sm text-gray-400">
              No trucks found in fleet.
            </div>
          ) : filtered.length === 0 ? (
            <div className="col-span-2 flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-10 text-sm text-gray-400">
              No trucks match &quot;{truckSearch}&quot;.
            </div>
          ) : (
            filtered.map((truck, idx) => (
              <TruckProfitCard
                key={truck.id}
                truck={truck}
                tollPrices={tollPrices}
                hireAmount={tripDetails.hireAmount}
                driverCompensationPct={branchPctMap[truck.branchRegisteredTo] ?? "0"}
                cleanerBattaFeePerDay={cleanerBattaFeeMap[truck.branchRegisteredTo] ?? "0"}
                tripDuration={tripDetails.tripDuration}
                totalKm={tripDetails.totalKm}
                emiPerDay={emiMap[truck.registrationNumber]?.emiPerDay ?? "0"}
                emiPerKm={emiMap[truck.registrationNumber]?.emiPerKm ?? "0"}
                truckMileage={String(mileageMap[truck.id] ?? "0")}
                systemFuelCostPerLitre={systemFuelCostPerLitre}
                fuelCostPerLitre={fuelCostPerLitre}
                adbluePerKm={(() => {
                  const consumption = parseFloat(truck.adblueConsumption);
                  const price = parseFloat(adblueManufacturerPriceMap[truck.manufacturer] ?? "");
                  return !isNaN(consumption) && consumption > 0 && !isNaN(price) && price > 0
                    ? String(consumption * price)
                    : "0";
                })()}
                tyrePerKm={String(tyreCostPerKmMap[truck.id] ?? "0")}
                maintPerDay={String(maintDailyMap[truck.id] ?? "0")}
                maintPerKm={String(maintPerKmFetchedMap[truck.id] ?? "0")}
                kmPerDay={tyreLayoutKmPerDayMap[truck.tyreLayout] ?? 0}
                accent={CARD_ACCENTS[idx % CARD_ACCENTS.length]}
              />
            ))
          )}
          </div>{/* end truck grid */}
        </div>{/* end left panel */}

        {/* Right — 25%: input cards */}
        <div className="col-span-1 flex flex-col gap-4">
          <FuelCostCard value={fuelCostPerLitre} onChange={setFuelCostPerLitre} />
          <TollPricingCard
            layouts={layouts}
            tollPrices={tollPrices}
            onChange={(layout, value) =>
              setTollPrices((prev) => ({ ...prev, [layout]: value }))
            }
          />
        </div>

      </div>
    </div>
  );
}
