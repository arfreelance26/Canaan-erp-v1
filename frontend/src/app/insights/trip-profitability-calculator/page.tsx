"use client";

import { PillSearch } from "@/components/ui/PillSearch";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { Segmented } from "@/components/ui/Segmented";
import { useEffect, useState } from "react";
import { RiMoneyRupeeCircleLine as IndianRupee, RiTruckLine as TruckIcon, RiCloseLine as X, RiArrowDownSLine as ChevronDown, RiGasStationLine as Fuel, RiEditLine as PencilLine, RiBookOpenLine as BookOpen, RiQuestionLine as HelpCircle, RiCheckboxCircleLine as CheckCircle2, RiCalculatorLine as Calculator } from "@remixicon/react";
import { trucksApi, branchesApi, financeApi, fuelLogsApi, tyreApi, tyreRangeConfigApi, maintenanceApi, adblueApi, type AdBlueStats } from "@/lib/api";
import { isEmiCompleted } from "@/lib/emi-schedule";
import { HALT_CONTAINER_TYPES } from "@/lib/halt-pay";
import { showError } from "@/lib/feedback";
import type { Branch } from "@/types/branch";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";

import { EmptyState } from "@/components/ui/EmptyState";
const inputClass =
  "w-full rounded-lg border border-separator-border bg-fill-1 px-3 py-2 text-body-semibold text-text-primary outline-none focus:border-success-border-strong focus:bg-background-primary-default focus:ring-2 focus:ring-success-border transition";

type Truck = {
  id: string;
  registrationNumber: string;
  manufacturer: string;
  tyreLayout: string;
  branchRegisteredTo: string;
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
  { badge: "bg-accent-surface text-accent-text"     },
  { badge: "bg-purple-surface text-purple-text" },
  { badge: "bg-fill-2 text-text-secondary"  },
  { badge: "bg-teal-surface text-teal-text"       },
  { badge: "bg-purple-surface text-purple-text" },
  { badge: "bg-accent-surface text-accent-text"     },
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
  ],
  [
    { label: "AdBlue Cost Per KM", key: "adbluePerKm",    type: "fetched",    overridable: true },
    { label: "AdBlue Expenses",    key: "adblueExpenses", type: "calculated" },
  ],
  [
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
    <div className="rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-fill-2 ${open ? "border-b border-separator-border" : ""}`}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-surface text-accent-text">
          <Fuel className="h-4 w-4" />
        </div>
        <h2 className="flex-1 text-body-semibold text-text-primary">Fuel Cost Details</h2>
        <ChevronDown
          className={`h-4 w-4 text-text-tertiary transition-transform duration-300 ${open ? "rotate-180" : "rotate-0"}`}
        />
      </button>

      <div
        className={`flex flex-col overflow-hidden transition duration-300 ${
          open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-2 px-4 py-4">
          <label className="text-caption-2-semibold text-text-tertiary">
            Base Fuel Cost (Per Liter)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-semibold text-text-tertiary">₹</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 95.50"
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full rounded-lg border border-separator-border bg-fill-1 py-2 pl-7 pr-3 text-body-semibold text-text-primary outline-none focus:border-success-border-strong focus:bg-background-primary-default focus:ring-2 focus:ring-success-border transition"
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
    <div className="rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-fill-2 ${open ? "border-b border-separator-border" : ""}`}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning-surface text-warning-text">
          <IndianRupee className="h-4 w-4" />
        </div>
        <h2 className="flex-1 text-body-semibold text-text-primary">Toll Pricing Details</h2>
        <ChevronDown
          className={`h-4 w-4 text-text-tertiary transition-transform duration-300 ${open ? "rotate-180" : "rotate-0"}`}
        />
      </button>

      <div
        className={`flex flex-col divide-y divide-separator-border overflow-hidden transition duration-300 ${
          open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {layouts.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-text-tertiary">
            No tyre layouts found in fleet.
          </p>
        ) : (
          layouts.map((layout) => (
            <div key={layout} className="flex flex-col gap-2 px-4 py-4">
              <label className="text-caption-2-semibold text-text-tertiary">
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
        className="w-full rounded border border-separator-border bg-background-primary-default px-1 py-1 text-center text-caption-2-semibold outline-none focus:border-accent-border-strong focus:ring-1 focus:ring-accent-border transition tabular-nums text-text-primary placeholder:text-text-placeholder"
      />
    );
  }

  if (field.type === "fetched") {
    return (
      <div
        className={`flex w-full items-center justify-center rounded border px-1 py-1 text-center text-caption-2-semibold tabular-nums ${
          hasValue
            ? "border-teal-border bg-teal-surface text-teal-text"
            : "border-separator-border bg-fill-1 text-text-tertiary"
        }`}
      >
        {hasValue ? value : emptyText}
      </div>
    );
  }

  // calculated
  return (
    <div
      className={`flex w-full items-center justify-center rounded border px-1 py-1 text-center text-caption-2-semibold tabular-nums ${
        hasValue
          ? "border-accent-border bg-accent-surface text-accent-text"
          : "border-separator-border bg-background-primary-default text-text-tertiary"
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
        className={`w-full rounded border px-1 py-1 text-center text-caption-2-semibold tabular-nums outline-none transition ${
          isOverridden
            ? "border-warning-border-strong bg-warning-surface text-warning-text placeholder:text-text-placeholder focus:border-warning-border-strong focus:ring-1 focus:ring-warning-border"
            : focused
              ? "border-teal-border-strong bg-background-primary-default text-teal-text placeholder:text-text-placeholder focus:ring-1 focus:ring-teal-border"
              : "border-dashed border-teal-border-strong bg-teal-surface text-transparent placeholder:text-teal-text cursor-text"
        }`}
      />
      {/* Pencil accent — signals this field is manually editable */}
      {!isOverridden && !focused && (
        <PencilLine className="pointer-events-none absolute right-0.5 top-0.5 h-2 w-2 text-teal-text" />
      )}
      {isOverridden && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Reset to auto-fetched"
          className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-warning-solid text-on-solid hover:bg-warning-solid transition-colors"
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
    body: "Each truck card auto-populates mileage (from fuel logs), EMI (from finance records), AdBlue (from AdBlue logs), tyre cost, and maintenance cost from your fleet data. Teal fields are auto-fetched.",
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
      <div className="absolute inset-0 bg-scrim/40" />
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl bg-background-primary-default shadow-2xl ring-1 ring-border-button-hover overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-separator-border bg-accent-solid px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-on-solid/20">
            <BookOpen className="h-4 w-4 text-on-solid" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-body-semibold text-on-solid">Quick Start Guide</h2>
            <p className="text-[11px] text-on-solid/80">Get up and running in 6 steps</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-on-solid/10 text-on-solid hover:bg-on-solid/20 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Steps */}
        <div className="flex flex-col divide-y divide-separator-border max-h-[70vh] overflow-y-auto">
          {GUIDE_STEPS.map((step, i) => (
            <div key={i} className="flex gap-3.5 px-5 py-4 hover:bg-fill-2 transition-colors">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-solid text-caption-2-semibold text-on-solid mt-0.5">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-text-primary mb-0.5">{step.title}</p>
                <p className="text-[11px] leading-relaxed text-text-secondary">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-separator-border bg-fill-1 px-5 py-3">
          <CheckCircle2 className="h-3.5 w-3.5 text-accent-text shrink-0" />
          <p className="text-[10px] text-text-tertiary">All values are saved automatically — they persist across page reloads.</p>
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
    color: "bg-purple-surface text-purple-text border-purple-border",
    rows: [
      { field: "Toll Pricing",  formula: "Entered manually in Toll Pricing Details panel (per tyre layout)" },
      { field: "Driver Batta",  formula: "Driver Compensation % ÷ 100 × Hire Amount" },
      { field: "Cleaner Batta", formula: "Cleaner Batta Fee for the Vehicle Type × Trip Duration (days)" },
    ],
  },
  {
    title: "EMI",
    color: "bg-purple-surface text-purple-text border-purple-border",
    rows: [
      { field: "EMI Per Day",   formula: "Fetched from EMI Tracking records — or enter manually" },
      { field: "EMI Per KM",    formula: "EMI Per Day ÷ Expected Daily Range (km/day from Truck Run Config) — or enter manually" },
      { field: "EMI Expenses",  formula: "EMI Per KM × Total KM" },
    ],
  },
  {
    title: "Fuel & Mileage",
    color: "bg-teal-surface text-teal-text border-teal-border",
    rows: [
      { field: "Truck Mileage",       formula: "Average km/L from fuel log history — or enter manually" },
      { field: "Mileage Cost Per KM", formula: "Fuel Cost Per Litre ÷ Truck Mileage — or enter manually" },
      { field: "Diesel Expenses",     formula: "Mileage Cost Per KM × Total KM" },
    ],
  },
  {
    title: "AdBlue",
    color: "bg-teal-surface text-teal-text border-teal-border",
    rows: [
      { field: "AdBlue Cost Per KM", formula: "The truck's manufacturer's AdBlue price ÷ its AdBlue km per litre (Truck's AdBlue History) — or enter manually" },
      { field: "AdBlue Expenses",    formula: "AdBlue Cost Per KM × Total KM" },
    ],
  },
  {
    title: "Tyres",
    color: "bg-teal-surface text-teal-text border-teal-border",
    rows: [
      { field: "Tyre Cost Per KM", formula: "Sum of (Tyre Purchase Cost ÷ Expected Range km) for each currently fitted tyre — or enter manually" },
      { field: "Tyre Expenses",    formula: "Tyre Cost Per KM × Total KM" },
    ],
  },
  {
    title: "Maintenance",
    color: "bg-warning-surface text-warning-text border-warning-border",
    rows: [
      { field: "Maint. Cost / Day", formula: "12-month maintenance total ÷ 12 months ÷ 26 working days — or enter manually" },
      { field: "Maint. Cost / KM",  formula: "Maint. Cost / Day ÷ Expected Daily Range (km/day from Truck Run Config) — or enter manually" },
      { field: "Maint. Expenses",   formula: "Maint. Cost / KM × Total KM" },
    ],
  },
  {
    title: "Footer Totals",
    color: "bg-fill-2 text-text-primary border-border-button-default",
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
      <div className="absolute inset-0 bg-scrim/40" />
      <div
        className="relative z-10 w-full max-w-xl rounded-2xl bg-background-primary-default shadow-2xl ring-1 ring-border-button-hover overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-separator-border bg-inverse px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-on-solid/20">
            <HelpCircle className="h-4 w-4 text-on-solid" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-body-semibold text-on-solid">How is this Calculated?</h2>
            <p className="text-[11px] text-text-tertiary">Formula reference for every field in the truck card</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-on-solid/10 text-on-solid hover:bg-on-solid/20 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Sections */}
        <div className="flex flex-col gap-0 max-h-[72vh] overflow-y-auto divide-y divide-separator-border">
          {FORMULA_SECTIONS.map((section) => (
            <div key={section.title} className="px-5 py-4">
              <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[9px] font-semibold mb-3 ${section.color}`}>
                {section.title}
              </span>
              <div className="flex flex-col gap-2">
                {section.rows.map((row) => (
                  <div key={row.field} className="grid grid-cols-[140px_1fr] gap-3 items-start">
                    <span className="text-caption-2-semibold text-text-primary leading-snug pt-px">{row.field}</span>
                    <span className="text-[11px] text-text-secondary leading-snug">{row.formula}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="flex items-start gap-2 border-t border-separator-border bg-fill-1 px-5 py-3">
          <PencilLine className="h-3 w-3 text-teal-text shrink-0 mt-0.5" />
          <p className="text-[10px] text-text-tertiary leading-relaxed">
            <span className="font-semibold text-teal-text">Teal fields</span> are auto-fetched from fleet data.
            Click to override. <span className="font-semibold text-warning-text">Amber fields</span> are overridden — click × to reset.
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
    manualMileage: string; manualCostPerKm: string;
    manualTyrePerKm: string; manualEmiPerDay: string; manualEmiPerKm: string;
    manualMaintPerDay: string; manualMaintPerKm: string; manualAdbluePerKm: string;
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
    manualMileage, manualCostPerKm, manualTyrePerKm, manualAdbluePerKm,
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
  const setManualTyrePerKm   = setManualField("manualTyrePerKm");
  const setManualAdbluePerKm = setManualField("manualAdbluePerKm");
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

  // Placeholder raw strings for the OverridableCells
  const autoMileageRaw   = autoMileageValid ? autoMileageNum.toFixed(2) : "";
  // AdBlue ₹/km — a typed override wins over the fetched figure (like tyres).
  const effectiveAdbluePerKmNum = (() => {
    if (manualAdbluePerKm && parseFloat(manualAdbluePerKm) > 0) return parseFloat(manualAdbluePerKm);
    const v = parseFloat(adbluePerKm);
    return !isNaN(v) && v > 0 ? v : 0;
  })();
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
    <div className="rounded-xl border border-separator-border bg-background-primary-default overflow-hidden shadow-[0_4px_6px_-1px_rgba(0,0,0,0.07),0_8px_24px_-4px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_16px_-2px_rgba(0,0,0,0.1),0_16px_40px_-8px_rgba(0,0,0,0.08)] transition-shadow duration-300">
      {/* Card header */}
      <div className="flex items-center gap-3 border-b border-separator-border bg-fill-1 px-4 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fill-3 text-text-secondary">
          <TruckIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 flex items-center gap-3">
          <p className="text-body-semibold text-text-primary truncate">{truck.registrationNumber}</p>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-fill-3 px-2 py-0.5 text-caption-2-semibold text-text-secondary">
              {truck.manufacturer}
            </span>
            {truck.tyreLayout && (
              <span className={`rounded-full px-2 py-0.5 text-caption-2-semibold ${accent.badge}`}>
                {truck.tyreLayout}
              </span>
            )}
            {truck.branchRegisteredTo && (
              <span className="rounded-full border border-success-border bg-success-surface px-2 py-0.5 text-caption-2-semibold text-success-text">
                {truck.branchRegisteredTo}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Field rows */}
      {FIELD_ROWS.map((row, rowIdx) => (
        <div
          key={rowIdx}
          className={`flex bg-fill-1 ${rowIdx > 0 ? "border-t border-separator-border" : ""}`}
        >
          {row.map((field, colIdx) => (
            <div
              key={field.key}
              className={`flex flex-1 min-w-0 flex-col gap-1 py-2 px-1.5 ${colIdx > 0 ? "border-l border-separator-border" : ""}`}
            >
              <span className="text-[8.5px] font-semibold text-text-tertiary leading-tight text-center truncate">
                {field.label}
              </span>
              {field.overridable ? (
                <OverridableCell
                  autoRawValue={
                    field.key === "truckMileage"    ? autoMileageRaw :
                    field.key === "tyrePerKm"       ? autoTyrePerKmRaw :
                    field.key === "adbluePerKm"     ? autoAdbluePerKmRaw :
                    field.key === "emiPerDay"       ? autoEmiPerDayRaw :
                    field.key === "emiPerKm"        ? autoEmiPerKmRaw :
                    field.key === "maintPerDay"     ? autoMaintPerDayRaw :
                    field.key === "maintPerKm"      ? autoMaintPerKmRaw :
                    autoCostPerKmRaw
                  }
                  overrideValue={
                    field.key === "truckMileage"    ? manualMileage :
                    field.key === "tyrePerKm"       ? manualTyrePerKm :
                    field.key === "adbluePerKm"     ? manualAdbluePerKm :
                    field.key === "emiPerDay"       ? manualEmiPerDay :
                    field.key === "emiPerKm"        ? manualEmiPerKm :
                    field.key === "maintPerDay"     ? manualMaintPerDay :
                    field.key === "maintPerKm"      ? manualMaintPerKm :
                    manualCostPerKm
                  }
                  onChange={
                    field.key === "truckMileage"    ? setManualMileage :
                    field.key === "tyrePerKm"       ? setManualTyrePerKm :
                    field.key === "adbluePerKm"     ? setManualAdbluePerKm :
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
      <div className="grid grid-cols-3 divide-x divide-on-solid/10 overflow-hidden rounded-b-xl">
        <div className="flex items-center justify-between gap-2 bg-inverse px-3 py-2">
          <span className="text-[9px] font-semibold text-text-tertiary leading-tight">
            Total<br />Expenses
          </span>
          <span className="text-caption-1-semibold tabular-nums text-on-solid">
            {hasExpenses ? `₹${totalExpenses.toFixed(2)}` : "—"}
          </span>
        </div>
        <div className={`flex items-center justify-between gap-2 px-3 py-2 ${profitOrLoss !== null && profitOrLoss >= 0 ? "bg-accent-solid " : "bg-accent-solid "}`}>
          <span className="text-[9px] font-semibold text-on-solid/80 leading-tight">
            Total<br />Profit
          </span>
          <span className="text-caption-1-semibold tabular-nums text-on-solid">
            {profitOrLoss !== null && profitOrLoss >= 0 ? `₹${profitOrLoss.toFixed(2)}` : "—"}
          </span>
        </div>
        <div className={`flex items-center justify-between gap-2 px-3 py-2 ${profitOrLoss !== null && profitOrLoss < 0 ? "bg-danger-solid " : "bg-danger-solid "}`}>
          <span className="text-[9px] font-semibold text-on-solid/80 leading-tight">
            Total<br />Loss
          </span>
          <span className="text-caption-1-semibold tabular-nums text-on-solid">
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
  const [selectedTruckId, setSelectedTruckId]   = useState("");
  const [selectedTruckIdB, setSelectedTruckIdB] = useState("");
  // "single" = one vehicle picked from a dropdown (default); "compare" = two
  // vehicles picked side-by-side; "list" = the original type-to-search layout
  // with every matching truck's card shown.
  const [truckView, setTruckView] = useState<"single" | "compare" | "list">("single");
  const [showGuide, setShowGuide]         = useState(false);
  const [showCalc, setShowCalc]           = useState(false);
  const [branches, setBranches]           = useState<Branch[]>([]);
  // registration → { emiPerDay, emiPerKm }
  const [emiMap, setEmiMap] = useState<Record<string, { emiPerDay: string; emiPerKm: string }>>({});
  // truck_id → average mileage km/L
  const [mileageMap, setMileageMap] = useState<Record<string, number>>({});
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
        vehicleType:  s.tripDetails?.vehicleType  ?? HALT_CONTAINER_TYPES[0].spec,
      };
    } catch {
      return { origin: "", destination: "", totalKm: "", hireAmount: "", tripDuration: "", vehicleType: HALT_CONTAINER_TYPES[0].spec };
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
    // Each fetch below is independent (a failure in one doesn't corrupt the
    // others), but previously every failure was invisible — a truck card's
    // fields would just show blank/NULL, indistinguishable from genuinely-no-
    // data. Collect failures and show one consolidated toast instead.
    const failedSources: string[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    function reportFailure(label: string) {
      failedSources.push(label);
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        showError(`Couldn't load ${failedSources.join(", ")} — some truck fields may be incomplete.`);
      }, 300);
    }

    branchesApi.list().then(setBranches).catch(() => reportFailure("Branches"));
    tyreApi.listInventory().then(setTyreInventory).catch(() => reportFailure("Tyre Inventory"));
    tyreApi.listFitments(undefined, true).then(setTyreFitments).catch(() => reportFailure("Tyre Fitments"));
    tyreRangeConfigApi.list().then(setTyreRangeConfig).catch(() => reportFailure("Tyre Range Config"));
    maintenanceApi.getMaintenanceCostPerDay().then(setMaintDailyMap).catch(() => reportFailure("Maintenance Cost/Day"));
    maintenanceApi.getMaintenanceCostPerKm().then(setMaintPerKmFetchedMap).catch(() => reportFailure("Maintenance Cost/Km"));
    trucksApi.getRunConfig().then(setRunConfigs).catch(() => reportFailure("Truck Run Config"));

    fuelLogsApi.getAllFuelStats().then(setMileageMap).catch(() => reportFailure("Fuel Mileage Stats"));
    fuelLogsApi.getBaseConfig().then((cfg) => {
      if (cfg.cost_per_litre != null) {
        setSystemFuelCostPerLitre(Number(cfg.cost_per_litre));
        // Only use API value as fallback; don't overwrite a saved user value
        setFuelCostPerLitre((prev: string) => prev !== "" ? prev : String(cfg.cost_per_litre));
      }
    }).catch(() => reportFailure("Base Fuel Cost"));

    financeApi.listEmi().then((records) => {
      // A truck can have multiple active loans (sum, don't overwrite — matches
      // Running Cost Calculator's emiByTruck), and a completed loan (Amount
      // Paid caught up to Total EMI Payable — same definition as EMI
      // Tracking's Active/Completed tabs) no longer represents an ongoing
      // per-km finance cost, so it's excluded rather than silently charged.
      const map: Record<string, { emiPerDay: string; emiPerKm: string }> = {};
      for (const r of records) {
        if (!r.truckRegistration || isEmiCompleted(r)) continue;
        const prev = map[r.truckRegistration];
        const perDay = (parseFloat(prev?.emiPerDay ?? "0") || 0) + (parseFloat(r.dailyFinanceCost) || 0);
        const perKm  = (parseFloat(prev?.emiPerKm  ?? "0") || 0) + (parseFloat(r.emiCostPerKm)    || 0);
        map[r.truckRegistration] = {
          emiPerDay: String(perDay.toFixed(2)),
          emiPerKm:  String(perKm.toFixed(4)),
        };
      }
      setEmiMap(map);
    }).catch(() => reportFailure("EMI Records"));

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
        }));
        setTrucks(mapped);
      })
      .catch(() => reportFailure("Trucks"))
      .finally(() => setTrucksLoading(false));
  }, []);

  // Persist page-level state across reloads and navigation
  useEffect(() => {
    try {
      localStorage.setItem("erp_trip_calc_page", JSON.stringify({ tripDetails, tollPrices, fuelCostPerLitre }));
    } catch {}
  }, [tripDetails, tollPrices, fuelCostPerLitre]);

  // truckId (string) → total tyre cost per km — mirrors ViewTyreDataDialog logic
  // AdBlue ₹/km per truck (Truck's AdBlue History × manufacturer price), keyed by trucks.id.
  const [adblueStats, setAdblueStats] = useState<Record<string, AdBlueStats>>({});
  useEffect(() => { adblueApi.getAllStats().then(setAdblueStats).catch(() => {}); }, []);

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

  // branchName → Cleaner Batta Fee (per day) for the trip's vehicle type
  const vehicleType = HALT_CONTAINER_TYPES.find((t) => t.spec === tripDetails.vehicleType) ?? HALT_CONTAINER_TYPES[0];
  const cleanerBattaFeeMap = Object.fromEntries(
    branches.map((b) => [b.name, b[vehicleType.cleaner]])
  );

  // tyre layout → km_per_day (used for maint cost cross-derivation in each card)
  const tyreLayoutKmPerDayMap: Record<string, number> = {};
  for (const c of runConfigs) {
    const v = c.km_per_day ? parseFloat(String(c.km_per_day)) : null;
    if (v && v > 0) tyreLayoutKmPerDayMap[c.tyre_layout] = v;
  }

  const filtered = truckView === "list"
    ? trucks.filter((t) => t.registrationNumber.toLowerCase().includes(truckSearch.toLowerCase()))
    : truckView === "compare"
    ? [trucks.find((t) => t.id === selectedTruckId), trucks.find((t) => t.id === selectedTruckIdB)].filter((t): t is Truck => !!t)
    : (() => {
        const t = trucks.find((t) => t.id === selectedTruckId);
        return t ? [t] : [];
      })();

  return (
    <div className="flex flex-col gap-6">

      {/* Modals */}
      {showGuide && <QuickStartGuideModal onClose={() => setShowGuide(false)} />}
      {showCalc  && <HowCalculatedModal  onClose={() => setShowCalc(false)}  />}

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-warning-border bg-warning-surface text-warning-text shadow-sm">
            <Calculator className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Trip Profitability Calculator</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Estimate and analyse profit margins per trip across your fleet.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setShowGuide(true)} className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-separator-border bg-background-primary-default px-5 text-body-medium text-text-primary shadow-sm transition duration-300 hover:border-accent-border-strong hover:text-accent-text hover:shadow-md">
            <BookOpen className="h-4 w-4" />
            Quick Start Guide
          </button>
          <button type="button" onClick={() => setShowCalc(true)} className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-separator-border bg-background-primary-default px-5 text-body-medium text-text-primary shadow-sm transition duration-300 hover:border-accent-border-strong hover:text-accent-text hover:shadow-md">
            <HelpCircle className="h-4 w-4" />
            How is this Calculated?
          </button>
        </div>
      </div>

      {/* Toolbar: truck view switch + vehicle picker(s) */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          size="md"
          label="Truck view"
          value={truckView}
          onChange={setTruckView}
          options={[{ value: "single", label: "Single" }, { value: "compare", label: "Compare" }, { value: "list", label: "List" }]}
        />
        {truckView === "single" && (
          <div className="w-full max-w-xs">
            <GlassCombobox
              value={selectedTruckId}
              onChange={setSelectedTruckId}
              placeholder="Select a vehicle…"
              strictSelect
              options={trucks.map((t) => ({ value: t.id, label: t.registrationNumber }))}
            />
          </div>
        )}
        {truckView === "compare" && (
          <>
            <div className="w-full max-w-xs">
              <GlassCombobox
                value={selectedTruckId}
                onChange={setSelectedTruckId}
                placeholder="Select vehicle A…"
                strictSelect
                options={trucks.filter((t) => t.id !== selectedTruckIdB).map((t) => ({ value: t.id, label: t.registrationNumber }))}
              />
            </div>
            <div className="w-full max-w-xs">
              <GlassCombobox
                value={selectedTruckIdB}
                onChange={setSelectedTruckIdB}
                placeholder="Select vehicle B…"
                strictSelect
                options={trucks.filter((t) => t.id !== selectedTruckId).map((t) => ({ value: t.id, label: t.registrationNumber }))}
              />
            </div>
          </>
        )}
        {truckView === "list" && (
          <PillSearch placeholder="Search reg. no…" value={truckSearch} onChange={setTruckSearch} />
        )}
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-4 gap-6 items-start">

        {/* Left — 75%: trip details + per-truck profitability cards */}
        <div className="col-span-3 flex flex-col gap-4">

          {/* Trip Details card */}
          <div className="rounded-xl border border-separator-border bg-background-primary-default px-5 py-4 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06),0_4px_16px_-4px_rgba(0,0,0,0.05)]">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-surface text-accent-text">
                <IndianRupee className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-body-semibold text-text-primary">Trip Details</h2>
            </div>
            <div className="grid grid-cols-6 gap-3">
              {[
                { label: "Origin Location",       key: "origin",       type: "text",   placeholder: "e.g. Chennai" },
                { label: "Destination Location",   key: "destination",  type: "text",   placeholder: "e.g. Mumbai"  },
                { label: "Total KM",               key: "totalKm",      type: "number", placeholder: "e.g. 1350"    },
                { label: "Total Hire Amount (₹)",  key: "hireAmount",   type: "number", placeholder: "e.g. 45000"   },
                { label: "Trip Duration (Days)",   key: "tripDuration", type: "number", placeholder: "e.g. 5"       },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-caption-2-semibold text-text-tertiary">{label}</label>
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
              <div className="flex flex-col gap-1.5">
                <label htmlFor="trip-vehicle-type" className="text-caption-2-semibold text-text-tertiary">Vehicle Type</label>
                <select
                  id="trip-vehicle-type"
                  value={vehicleType.spec}
                  onChange={(e) => setTripDetails((p) => ({ ...p, vehicleType: e.target.value }))}
                  className={inputClass}
                >
                  {HALT_CONTAINER_TYPES.map((t) => (
                    <option key={t.spec} value={t.spec}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Truck cards — 2-up grid (Compare/List), single column (Single) */}
          <div className={truckView === "single" ? "grid grid-cols-1 gap-4 items-start" : "grid grid-cols-2 gap-4 items-start"}>
          {trucksLoading ? (
            [1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-separator-border bg-fill-2" />
            ))
          ) : trucks.length === 0 ? (
            <EmptyState size="compact" illustration="logistics" title="No trucks found in fleet" />
          ) : filtered.length === 0 ? (
            <EmptyState size="compact" illustration="logistics" title={truckView === "list"
                ? `No trucks match "${truckSearch}".`
                : truckView === "compare" ? "Select both vehicles above to compare" : "Select a vehicle above to see its profitability breakdown"} />
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
                tyrePerKm={String(tyreCostPerKmMap[truck.id] ?? "0")}
                adbluePerKm={String(adblueStats[truck.id]?.costPerKm ?? "0")}
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
