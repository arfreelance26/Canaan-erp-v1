"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { tyreRangeConfigApi, tyreApi, adblueApi, trucksApi, runningCostApi, financeApi, fuelLogsApi, maintenanceTypesApi, maintenanceApi, complianceCostApi, type AdBlueManufacturer } from "@/lib/api";
import type { EmiRecord } from "@/types/finance";
import { CircleDot, ChevronDown, Fuel, Droplets, Gauge, Truck as TruckIcon, Info, X, Search, BookOpen, CheckCircle2, ArrowRight } from "lucide-react";
import type { Truck } from "@/types/truck";
import { getFitmentForPosition } from "@/lib/tyre-fitment-data";
import { getTyreLayout, getTyrePositions } from "@/lib/tyre-layouts";

const MODES = ["Manual", "Basic", "Advanced"] as const;
type Mode = (typeof MODES)[number];

const STORAGE_KEY = "canaan_rcc_state";

type ModeData = {
  costPerLitre: string;
  tyreEntries: Record<string, TyreEntry>;
  runEntries: Record<string, { month: string; day: string }>;
  adbluePrices: Record<string, string>;
  truckMetrics: Record<string, Record<string, string>>;
};

function emptyModeData(): ModeData {
  return { costPerLitre: "", tyreEntries: {}, runEntries: {}, adbluePrices: {}, truckMetrics: {} };
}

type SavedStore = { mode: string; Manual: Partial<ModeData>; Basic: Partial<ModeData>; Advanced: Partial<ModeData> };

function loadSaved(): SavedStore {
  if (typeof window === "undefined") return { mode: "Manual", Manual: {}, Basic: {}, Advanced: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    // Migrate old flat format → Manual slot
    if (!raw.Manual && (raw.costPerLitre !== undefined || raw.truckMetrics !== undefined)) {
      return {
        mode: raw.mode ?? "Manual",
        Manual: { costPerLitre: raw.costPerLitre, tyreEntries: raw.tyreEntries, runEntries: raw.runEntries, adbluePrices: raw.adbluePrices, truckMetrics: raw.truckMetrics },
        Basic: {},
        Advanced: {},
      };
    }
    return { mode: raw.mode ?? "Manual", Manual: raw.Manual ?? {}, Basic: raw.Basic ?? {}, Advanced: raw.Advanced ?? {} };
  } catch { return { mode: "Manual", Manual: {}, Basic: {}, Advanced: {} }; }
}

function persistState(mode: string, allData: Record<string, ModeData>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, ...allData })); } catch {}
}

const MODE_STYLE: Record<Mode, { banner: string; dot: string; text: string }> = {
  Manual:   { banner: "border-amber-200 bg-amber-50",   dot: "bg-amber-400",  text: "text-amber-700" },
  Basic:    { banner: "border-teal-200 bg-teal-50",     dot: "bg-teal-500",   text: "text-teal-700"  },
  Advanced: { banner: "border-violet-200 bg-violet-50", dot: "bg-violet-500", text: "text-violet-700" },
};

type TyreEntry = { cost: string; range: string };

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 transition";

const TRUCK_METRICS = [
  { label: "EMI Amount",               key: "emiAmount",          calculated: false },
  { label: "EMI Per Day",              key: "emiPerDay",          calculated: true  },
  { label: "EMI Per Km",               key: "emiPerKm",           calculated: true  },
  { label: "Base Fuel Cost (₹/L)",     key: "baseFuelCost",       calculated: false },
  { label: "Mileage (L/KM)",           key: "mileage",            calculated: false },
  { label: "Mileage COST (Per/KM)",    key: "mileagePerKm",       calculated: true  },
  { label: "AdBlue (L / km)",          key: "adblueConsumeLKm",   calculated: false },
  { label: "AdBlue (L / 1000 km)",     key: "adblueConsumeL1000", calculated: false },
  { label: "AdBlue Manufacturer",      key: "adblueManufacturer", calculated: false },
  { label: "AdBlue Charges (Per/KM)",  key: "adbluePerKm",        calculated: false },
  { label: "Tyre Type",                key: "tyreType",           calculated: false },
  { label: "Tyre Charges (Per/KM)",    key: "tyrePerKm",          calculated: false },
  { label: "Maintenance Per KM",       key: "maintenancePerKm",      calculated: false },
  { label: "Compliance Cost / Year",   key: "complianceCostPerYear", calculated: false },
  { label: "Compliance Per KM",        key: "compliancePerKm",       calculated: true  },
] as const;

function parseTyreCount(layout: string): number {
  return layout.split("+").reduce((sum, p) => sum + (parseInt(p.trim()) || 0), 0);
}

type BasicEmi = {
  emiAmount: string;   // sum of emiAmount across all loans for this truck
  emiPerDay: string;   // sum of dailyFinanceCost
  emiPerKm: string;    // sum of emiCostPerKm
};

type BasicAdblue = {
  lPerKm: string;         // truck.adblueConsumption (L/km)
  manufacturerId: string; // AdBlue manufacturer ID whose name matches truck.manufacturer
  costPerKm: string;      // lPerKm × manufacturer.defaultPricePerLitre
};

function TruckCostCard({
  truck,
  metrics,
  onMetricChange,
  basicMaintenancePerKm,
  basicCompliance,
  costPerLitre,
  kmPerDay,
  tyreTypes,
  tyreEntries,
  adblueManufacturers,
  adbluePrices,
  basicEmi,
  basicAdblue,
  advancedAdblue,
  basicTyrePerKm,
  advancedTyrePerKm,
  advancedMaintenancePerKm,
  advancedComplianceCost,
  advancedCompliancePerKm,
  advancedEmi,
  advancedMileage,
  mode,
}: {
  truck: Truck;
  metrics: Record<string, string>;
  onMetricChange: (key: string, value: string) => void;
  costPerLitre: string;
  kmPerDay: string;
  tyreTypes: string[];
  tyreEntries: Record<string, TyreEntry>;
  adblueManufacturers: AdBlueManufacturer[];
  adbluePrices: Record<string, string>;
  basicEmi?: BasicEmi | null;
  basicAdblue?: BasicAdblue | null;
  advancedAdblue?: BasicAdblue | null;
  basicTyrePerKm?: string;
  advancedTyrePerKm?: string | null;
  basicMaintenancePerKm?: string;
  advancedMaintenancePerKm?: string | null;
  advancedComplianceCost?: string | null;
  advancedCompliancePerKm?: string | null;
  basicCompliance?: { totalCost: string; perKm: string };
  advancedEmi?: BasicEmi | null;
  advancedMileage?: string | null;
  mode: string;
}) {
  const isAdvancedMode = mode === "Advanced";
  const isBasicMode    = mode === "Basic";

  // ── Advanced mode EMI (read-only, strictly fetched — no fallback formulas) ──
  // EMI Amount   → emiAmount         from Finance → EMI Tracking
  // EMI Per Day  → dailyFinanceCost  from Finance → EMI Tracking
  // EMI Per Km   → emiCostPerKm      from Finance → EMI Tracking
  // If a value is absent in the DB, the field shows "NIL" — no arithmetic substitution.
  const advEmiAmount: number | null = (() => {
    const v = parseFloat(advancedEmi?.emiAmount ?? "");
    return !isNaN(v) && v > 0 ? v : null;
  })();
  const advEmiPerDay: number | null = (() => {
    const v = parseFloat(advancedEmi?.emiPerDay ?? "");
    return !isNaN(v) && v > 0 ? v : null;
  })();
  const advEmiPerKm: number | null = (() => {
    const v = parseFloat(advancedEmi?.emiPerKm ?? "");
    return !isNaN(v) && v > 0 ? v : null;
  })();

  // EMI Amount: Basic → manual override → fetched; Manual → typed value; Advanced handled above.
  const rawEmiAmount = isBasicMode
    ? (parseFloat(metrics["emiAmount"]) || parseFloat(basicEmi?.emiAmount ?? "") || 0)
    : isAdvancedMode
      ? (advEmiAmount ?? 0)
      : parseFloat(metrics["emiAmount"]);
  const emiAmount = isNaN(rawEmiAmount) ? 0 : rawEmiAmount;
  const hasEmi    = emiAmount > 0;

  const mileageVal            = parseFloat(metrics["mileage"]);
  const hasMileage            = !isNaN(mileageVal) && mileageVal > 0;
  const hasTyreType           = !!metrics["tyreType"];
  const adblueManufacturerId  = metrics["adblueManufacturer"]
    || (isBasicMode    ? (basicAdblue?.manufacturerId    ?? "") : "")
    || (isAdvancedMode ? (advancedAdblue?.manufacturerId ?? "") : "");
  const hasAdblueManufacturer = !!adblueManufacturerId;

  // EMI Per Day: Basic → manual → fetched → emiAmount÷26; Manual → emiAmount÷26; Advanced → advEmiPerDay.
  const emiPerDay: number | null = (() => {
    if (isAdvancedMode) return advEmiPerDay;
    if (isBasicMode) {
      const manual = parseFloat(metrics["emiPerDay"]);
      if (!isNaN(manual) && manual > 0) return manual;
      const fetched = parseFloat(basicEmi?.emiPerDay ?? "");
      if (!isNaN(fetched) && fetched > 0) return fetched;
      return emiAmount > 0 ? emiAmount / 26 : null;
    }
    return hasEmi ? emiAmount / 26 : null;
  })();

  // EMI Per Km: Basic → manual → fetched → emiPerDay÷kmPerDay; Manual → emiPerDay÷kmPerDay; Advanced → advEmiPerKm.
  const emiPerKm: number | null = (() => {
    if (isAdvancedMode) return advEmiPerKm;
    if (isBasicMode) {
      const manual = parseFloat(metrics["emiPerKm"]);
      if (!isNaN(manual) && manual > 0) return manual;
      const fetched = parseFloat(basicEmi?.emiPerKm ?? "");
      if (!isNaN(fetched) && fetched > 0) return fetched;
      if (!emiPerDay) return null;
      const kpd = parseFloat(kmPerDay);
      return kpd > 0 ? emiPerDay / kpd : null;
    }
    if (!emiPerDay) return null;
    const kpd = parseFloat(kmPerDay);
    return kpd > 0 ? emiPerDay / kpd : null;
  })();
  const mileageCostPerKm = (() => {
    const m = isAdvancedMode ? parseFloat(advancedMileage ?? "") : parseFloat(metrics["mileage"]);
    const c = parseFloat(costPerLitre);
    if (!m || m <= 0 || !c || c <= 0) return null;
    return c / m;  // m is km/L; c/m = ₹/L ÷ km/L = ₹/km
  })();

  // Auto-calculation (used as placeholder when no manual override is typed)
  const tyreChargesCalc = (() => {
    const tyreType = metrics["tyreType"];
    if (!tyreType) return null;
    const entry = tyreEntries[tyreType];
    if (!entry) return null;
    const cost  = parseFloat(entry.cost);
    const range = parseFloat(entry.range);
    if (!cost || !range || range <= 0) return null;
    const tyreCount = parseTyreCount(truck.tyreLayout ?? "");
    if (tyreCount <= 0) return null;
    return (cost / range) * tyreCount;
  })();

  const hasTyreOverride = !!(metrics["tyrePerKm"]);
  const tyreChargesPerKm = (() => {
    if (isAdvancedMode) {
      // Advanced: strictly use total tyre cost per km from Tyre Management → View Tyre Data
      const v = parseFloat(advancedTyrePerKm ?? "");
      return !isNaN(v) && v > 0 ? v : null;
    }
    if (hasTyreOverride) {
      const v = parseFloat(metrics["tyrePerKm"]);
      return !isNaN(v) && v > 0 ? v : null;
    }
    if (isBasicMode) {
      // Basic mode: use pre-fetched layout cost from Admin → Tyre Cost Config
      const v = parseFloat(basicTyrePerKm ?? "");
      return !isNaN(v) && v > 0 ? v : null;
    }
    return tyreChargesCalc;
  })();

  // Pure auto-calculation (L/km × manufacturer price) — used as placeholder when no override.
  // Basic mode: L/km falls back to fetched adblueConsumption; price uses manufacturer defaultPricePerLitre
  // (the right-panel adbluePrices is hidden in Basic mode so we go direct to the manufacturer record).
  const adblueChargesCalc = (() => {
    // Advanced: strictly use the pre-computed costPerKm from the AdBlue Management page — no fallback
    if (isAdvancedMode) {
      const v = parseFloat(advancedAdblue?.costPerKm ?? "");
      return !isNaN(v) && v > 0 ? v : null;
    }
    const manualLkm = parseFloat(metrics["adblueConsumeLKm"]);
    const lkm = (!isNaN(manualLkm) && manualLkm > 0)
      ? manualLkm
      : isBasicMode ? parseFloat(basicAdblue?.lPerKm ?? "") : NaN;
    if (!lkm || lkm <= 0 || isNaN(lkm)) return null;
    if (isBasicMode) {
      if (!adblueManufacturerId) return null;
      const mfr = adblueManufacturers.find((m) => String(m.id) === adblueManufacturerId);
      if (!mfr) return null;
      const price = parseFloat(mfr.defaultPricePerLitre);
      return price > 0 ? lkm * price : null;
    }
    const price = parseFloat(adbluePrices[adblueManufacturerId] ?? "");
    if (!price || price <= 0) return null;
    return lkm * price;
  })();

  // If user typed an override, use it; otherwise fall back to auto-calc
  const hasAdblueOverride = !!(metrics["adbluePerKm"]);
  const adblueChargesPerKm = (() => {
    if (hasAdblueOverride) {
      const v = parseFloat(metrics["adbluePerKm"]);
      return !isNaN(v) && v > 0 ? v : null;
    }
    return adblueChargesCalc;
  })();

  const maintenanceVal = (() => {
    if (isAdvancedMode) {
      // Advanced: strictly use pre-computed cost/km from Truck Maintenance → Full Status — no fallback
      const v = parseFloat(advancedMaintenancePerKm ?? "");
      return !isNaN(v) && v > 0 ? v : null;
    }
    const manual = parseFloat(metrics["maintenancePerKm"]);
    if (!isNaN(manual) && manual > 0) return manual;
    if (isBasicMode) {
      const fetched = parseFloat(basicMaintenancePerKm ?? "");
      return !isNaN(fetched) && fetched > 0 ? fetched : null;
    }
    return null;
  })();

  const hasManualCompliance = (() => {
    const v = parseFloat(metrics["complianceCostPerYear"]);
    return !isNaN(v) && v > 0;
  })();
  const complianceCostPerYear = (() => {
    if (isAdvancedMode) {
      // Advanced: strictly use total compliance cost from Compliance & Renewals → View Cost Breakdown
      const v = parseFloat(advancedComplianceCost ?? "");
      return !isNaN(v) && v > 0 ? v : NaN;
    }
    const manual = parseFloat(metrics["complianceCostPerYear"]);
    if (!isNaN(manual) && manual > 0) return manual;
    if (isBasicMode) {
      const fetched = parseFloat(basicCompliance?.totalCost ?? "");
      return !isNaN(fetched) && fetched > 0 ? fetched : NaN;
    }
    return NaN;
  })();
  const hasCompliance = !isNaN(complianceCostPerYear) && complianceCostPerYear > 0;
  const compliancePerKm = (() => {
    if (isAdvancedMode) {
      const v = parseFloat(advancedCompliancePerKm ?? "");
      return !isNaN(v) && v > 0 ? v : null;
    }
    // In Basic mode without a manual override, use pre-computed perKm (avoids needing kmPerDay)
    if (isBasicMode && !hasManualCompliance) {
      const fetched = parseFloat(basicCompliance?.perKm ?? "");
      return !isNaN(fetched) && fetched > 0 ? fetched : null;
    }
    if (!hasCompliance) return null;
    const kpd = parseFloat(kmPerDay);
    if (!kpd || kpd <= 0) return null;
    return complianceCostPerYear / 12 / 26 / kpd;
  })();

  const calcValue: Record<string, number | null> = {
    emiPerDay:       emiPerDay,
    emiPerKm:        emiPerKm,
    mileagePerKm:    mileageCostPerKm,
    compliancePerKm: compliancePerKm,
  };

  const costComponents = [emiPerKm, mileageCostPerKm, adblueChargesPerKm, tyreChargesPerKm, maintenanceVal, compliancePerKm];
  const hasAnyComponent = costComponents.some((v) => v !== null);
  const totalCostPerKm = hasAnyComponent
    ? costComponents.reduce<number>((sum, v) => sum + (v ?? 0), 0)
    : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-4 border-b border-gray-100 bg-gray-50 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
          <TruckIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-gray-900 truncate">{truck.registrationNumber}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
              {truck.manufacturer}
            </span>
            {truck.tyreLayout && (
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                {truck.tyreLayout}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div className="flex bg-gray-50">
        {TRUCK_METRICS.map(({ label, key, calculated }, index) => {
          // Base Fuel Cost is Advanced-mode only — skip rendering in other modes
          if (key === "baseFuelCost" && !isAdvancedMode) return null;
          // Tyre Type does not exist in Advanced mode
          if (key === "tyreType" && isAdvancedMode) return null;

          const isEmiField = key === "emiAmount" || key === "emiPerDay" || key === "emiPerKm";
          const cv    = calculated ? calcValue[key] ?? null : null;
          const cvStr = cv !== null ? cv.toFixed(key === "emiPerDay" ? 2 : 4) : null;

          return (
            <div
              key={key}
              className={`flex flex-col flex-1 min-w-0 py-3 px-2.5 ${index > 0 ? "border-l border-gray-100" : ""}`}
            >
              <div className="flex h-9 items-end justify-center pb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 leading-tight text-center">
                  {label}
                </span>
              </div>
              {isAdvancedMode && isEmiField ? (
                // Advanced mode — read-only display; no manual entry allowed.
                // Uses computed values so Per Day / Per Km fall back to arithmetic
                // even when the DB only stores the raw EMI Amount.
                (() => {
                  const computed = key === "emiAmount" ? advEmiAmount
                    : key === "emiPerDay" ? advEmiPerDay
                    : advEmiPerKm;
                  const display = computed !== null
                    ? (key === "emiAmount" ? computed.toFixed(2) : key === "emiPerDay" ? computed.toFixed(2) : computed.toFixed(4))
                    : null;
                  return (
                    <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                      display
                        ? "border-teal-200 bg-teal-50 text-teal-600"
                        : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>
                      {display ?? "NIL"}
                    </div>
                  );
                })()
              ) : isBasicMode && isEmiField ? (
                // Basic mode — all three EMI fields are editable inputs.
                // Fetched value (from EMI Tracking) acts as placeholder; user can override by typing.
                // emiPerDay ↔ emiAmount are kept in sync: typing either one updates the other.
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={
                    key === "emiAmount"
                      ? (parseFloat(basicEmi?.emiAmount ?? "") > 0 ? basicEmi!.emiAmount : "0")
                      : key === "emiPerDay"
                        ? (parseFloat(basicEmi?.emiPerDay ?? "") > 0
                            ? parseFloat(basicEmi!.emiPerDay).toFixed(2)
                            : emiPerDay ? emiPerDay.toFixed(2) : "0")
                        : (parseFloat(basicEmi?.emiPerKm ?? "") > 0
                            ? parseFloat(basicEmi!.emiPerKm).toFixed(4)
                            : emiPerKm ? emiPerKm.toFixed(4) : "0")
                  }
                  value={metrics[key] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onMetricChange(key, v);
                    // Typing emiPerDay back-calculates emiAmount (× 26)
                    if (key === "emiPerDay") {
                      onMetricChange("emiAmount", v ? String(+(parseFloat(v) * 26).toFixed(2)) : "");
                    }
                  }}
                  className={`w-full rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold shadow-sm outline-none focus:ring-2 transition tabular-nums ${
                    metrics[key]
                      ? "border-amber-300 bg-amber-50 text-amber-700 placeholder:text-amber-300 focus:border-amber-400 focus:ring-amber-100"
                      : basicEmi && (
                          key === "emiAmount" ? parseFloat(basicEmi.emiAmount) > 0
                          : key === "emiPerDay" ? parseFloat(basicEmi.emiPerDay) > 0
                          : parseFloat(basicEmi.emiPerKm) > 0
                        )
                        ? "border-teal-200 bg-teal-50 text-teal-600 placeholder:text-teal-400 focus:border-teal-400 focus:ring-teal-100"
                        : "border-gray-200 bg-white text-gray-800 placeholder:text-blue-300 focus:border-blue-400 focus:ring-blue-100"
                  }`}
                />
              ) : key === "baseFuelCost" ? (
                // Advanced mode — read-only fetch from Maintenance → Fuel History → Set Base Litre Cost
                (() => {
                  const val = parseFloat(costPerLitre);
                  const display = !isNaN(val) && val > 0 ? `₹${val.toFixed(2)}` : null;
                  return (
                    <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                      display
                        ? "border-teal-200 bg-teal-50 text-teal-600"
                        : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>
                      {display ?? "NIL"}
                    </div>
                  );
                })()
              ) : isAdvancedMode && key === "mileage" ? (
                // Advanced mode — read-only: Lifetime Average (km/L) from Fuel History
                (() => {
                  const val = parseFloat(advancedMileage ?? "");
                  const display = !isNaN(val) && val > 0 ? val.toFixed(2) : null;
                  return (
                    <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                      display
                        ? "border-teal-200 bg-teal-50 text-teal-600"
                        : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>
                      {display ?? "NIL"}
                    </div>
                  );
                })()
              ) : isAdvancedMode && key === "mileagePerKm" ? (
                // Advanced mode — derived from Fuel History "Cost Per Kilometer"
                // = Base Fuel Cost Per Litre ÷ Lifetime Average (km/L)
                (() => {
                  const display = cvStr ?? null;
                  return (
                    <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                      display
                        ? "border-teal-200 bg-teal-50 text-teal-600"
                        : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>
                      {display ?? "NIL"}
                    </div>
                  );
                })()
              ) : isAdvancedMode && key === "compliancePerKm" ? (() => {
                const val = parseFloat(advancedCompliancePerKm ?? "");
                const display = !isNaN(val) && val > 0 ? val.toFixed(4) : null;
                return (
                  <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                    display
                      ? "border-teal-200 bg-teal-50 text-teal-600"
                      : "border-gray-200 bg-gray-50 text-gray-400"
                  }`}>
                    {display ?? "NIL"}
                  </div>
                );
              })() : calculated ? (
                <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                  cvStr
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-300 shadow-sm"
                }`}>
                  {cvStr ?? "—"}
                </div>
              ) : key === "tyreType" ? (
                isBasicMode ? (
                  <div className="flex w-full items-center justify-center rounded-lg border border-gray-100 bg-gray-50 px-1.5 py-1.5 text-center text-xs font-bold text-gray-300">
                    —
                  </div>
                ) : (
                  <select
                    value={metrics[key] ?? ""}
                    onChange={(e) => onMetricChange(key, e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-1 py-1.5 text-center text-xs font-bold text-gray-800 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition cursor-pointer"
                  >
                    <option value="">—</option>
                    {tyreTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                )
              ) : key === "adblueManufacturer" ? (
                isAdvancedMode ? (() => {
                  const mfr = advancedAdblue?.manufacturerId
                    ? adblueManufacturers.find((m) => String(m.id) === advancedAdblue.manufacturerId)
                    : null;
                  const display = mfr?.name ?? null;
                  return (
                    <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                      display ? "border-teal-200 bg-teal-50 text-teal-600" : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>{display ?? "NIL"}</div>
                  );
                })() : (
                <select
                  value={metrics[key] || (isBasicMode ? (basicAdblue?.manufacturerId ?? "") : "")}
                  onChange={(e) => onMetricChange(key, e.target.value)}
                  className={`w-full rounded-lg border px-1 py-1.5 text-center text-xs font-bold shadow-sm outline-none focus:ring-2 transition cursor-pointer ${
                    metrics[key]
                      ? "border-amber-300 bg-amber-50 text-amber-700 focus:border-amber-400 focus:ring-amber-100"
                      : (isBasicMode && !metrics[key] && !!basicAdblue?.manufacturerId)
                        ? "border-teal-200 bg-teal-50 text-teal-600 focus:border-teal-400 focus:ring-teal-100"
                        : "border-gray-200 bg-white text-gray-800 focus:border-blue-400 focus:ring-blue-100"
                  }`}
                >
                  <option value="">—</option>
                  {adblueManufacturers.map((m) => (
                    <option key={m.id} value={String(m.id)}>{m.name}</option>
                  ))}
                </select>)
              ) : key === "adblueConsumeLKm" ? (
                isAdvancedMode ? (() => {
                  const val = parseFloat(advancedAdblue?.lPerKm ?? "");
                  const display = !isNaN(val) && val > 0 ? val.toFixed(5) : null;
                  return (
                    <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                      display ? "border-teal-200 bg-teal-50 text-teal-600" : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>{display ?? "NIL"}</div>
                  );
                })() : (
                <input
                  type="number" min="0" step="any"
                  placeholder={isBasicMode && parseFloat(basicAdblue?.lPerKm ?? "") > 0 ? parseFloat(basicAdblue!.lPerKm).toFixed(5) : "0"}
                  value={metrics[key] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onMetricChange("adblueConsumeLKm", v);
                    onMetricChange("adblueConsumeL1000", v ? String(+(parseFloat(v) * 1000).toFixed(4)) : "");
                  }}
                  className={`w-full rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold shadow-sm outline-none focus:ring-2 transition tabular-nums ${
                    metrics[key]
                      ? "border-amber-300 bg-amber-50 text-amber-700 placeholder:text-amber-300 focus:border-amber-400 focus:ring-amber-100"
                      : (isBasicMode && parseFloat(basicAdblue?.lPerKm ?? "") > 0)
                        ? "border-teal-200 bg-teal-50 text-teal-600 placeholder:text-teal-400 focus:border-teal-400 focus:ring-teal-100"
                        : "border-gray-200 bg-white text-gray-800 placeholder:text-gray-300 focus:border-blue-400 focus:ring-blue-100"
                  }`}
                />)
              ) : key === "adblueConsumeL1000" ? (
                isAdvancedMode ? (() => {
                  const lkm = parseFloat(advancedAdblue?.lPerKm ?? "");
                  const display = !isNaN(lkm) && lkm > 0 ? (lkm * 1000).toFixed(3) : null;
                  return (
                    <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                      display ? "border-teal-200 bg-teal-50 text-teal-600" : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>{display ?? "NIL"}</div>
                  );
                })() : (
                <input
                  type="number" min="0" step="any"
                  placeholder={isBasicMode && parseFloat(basicAdblue?.lPerKm ?? "") > 0 ? (parseFloat(basicAdblue!.lPerKm) * 1000).toFixed(4) : "0"}
                  value={metrics[key] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onMetricChange("adblueConsumeL1000", v);
                    onMetricChange("adblueConsumeLKm", v ? String(+(parseFloat(v) / 1000).toFixed(6)) : "");
                  }}
                  className={`w-full rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold shadow-sm outline-none focus:ring-2 transition tabular-nums ${
                    metrics[key]
                      ? "border-amber-300 bg-amber-50 text-amber-700 placeholder:text-amber-300 focus:border-amber-400 focus:ring-amber-100"
                      : (isBasicMode && parseFloat(basicAdblue?.lPerKm ?? "") > 0)
                        ? "border-teal-200 bg-teal-50 text-teal-600 placeholder:text-teal-400 focus:border-teal-400 focus:ring-teal-100"
                        : "border-gray-200 bg-white text-gray-800 placeholder:text-gray-300 focus:border-blue-400 focus:ring-blue-100"
                  }`}
                />)
              ) : key === "adbluePerKm" ? (
                isAdvancedMode ? (() => {
                  const display = adblueChargesCalc !== null ? adblueChargesCalc.toFixed(4) : null;
                  return (
                    <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                      display ? "border-teal-200 bg-teal-50 text-teal-600" : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>{display ?? "NIL"}</div>
                  );
                })() : (
                <input
                  type="number" min="0" step="any"
                  placeholder={adblueChargesCalc !== null ? adblueChargesCalc.toFixed(4) : "0"}
                  value={metrics[key] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onMetricChange("adbluePerKm", v);
                    if (!v) onMetricChange("adblueConsumeLKm", metrics["adblueConsumeLKm"] ?? "");
                  }}
                  className={`w-full rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold shadow-sm outline-none focus:ring-2 transition tabular-nums ${
                    hasAdblueOverride
                      ? "border-amber-300 bg-amber-50 text-amber-700 placeholder:text-amber-300 focus:border-amber-400 focus:ring-amber-100"
                      : adblueChargesCalc !== null && isBasicMode
                        ? "border-teal-200 bg-teal-50 text-teal-600 placeholder:text-teal-400 focus:border-teal-400 focus:ring-teal-100"
                        : "border-gray-200 bg-white text-gray-800 placeholder:text-blue-300 focus:border-blue-400 focus:ring-blue-100"
                  }`}
                />)
              ) : key === "tyrePerKm" ? (
                isAdvancedMode ? (() => {
                  const val = parseFloat(advancedTyrePerKm ?? "");
                  const display = !isNaN(val) && val > 0 ? val.toFixed(4) : null;
                  return (
                    <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                      display
                        ? "border-teal-200 bg-teal-50 text-teal-600"
                        : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>
                      {display ?? "NIL"}
                    </div>
                  );
                })() : (
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={
                    isBasicMode
                      ? (parseFloat(basicTyrePerKm ?? "") > 0 ? parseFloat(basicTyrePerKm!).toFixed(4) : "0")
                      : (tyreChargesCalc !== null ? tyreChargesCalc.toFixed(4) : "0")
                  }
                  value={metrics[key] ?? ""}
                  onChange={(e) => onMetricChange("tyrePerKm", e.target.value)}
                  className={`w-full rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold shadow-sm outline-none focus:ring-2 transition tabular-nums ${
                    hasTyreOverride
                      ? "border-amber-300 bg-amber-50 text-amber-700 placeholder:text-amber-300 focus:border-amber-400 focus:ring-amber-100"
                      : (isBasicMode && parseFloat(basicTyrePerKm ?? "") > 0)
                        ? "border-teal-200 bg-teal-50 text-teal-600 placeholder:text-teal-400 focus:border-teal-400 focus:ring-teal-100"
                        : "border-gray-200 bg-white text-gray-800 placeholder:text-blue-300 focus:border-blue-400 focus:ring-blue-100"
                  }`}
                />)
              ) : key === "complianceCostPerYear" ? (
                isAdvancedMode ? (() => {
                  const val = parseFloat(advancedComplianceCost ?? "");
                  const display = !isNaN(val) && val > 0 ? `₹${val.toFixed(2)}` : null;
                  return (
                    <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                      display
                        ? "border-teal-200 bg-teal-50 text-teal-600"
                        : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>
                      {display ?? "NIL"}
                    </div>
                  );
                })() : (
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={
                    isBasicMode
                      ? (parseFloat(basicCompliance?.totalCost ?? "") > 0
                          ? parseFloat(basicCompliance!.totalCost).toFixed(2)
                          : "0")
                      : "0"
                  }
                  value={metrics[key] ?? ""}
                  onChange={(e) => onMetricChange(key, e.target.value)}
                  className={`w-full rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold shadow-sm outline-none focus:ring-2 transition tabular-nums ${
                    metrics[key]
                      ? "border-amber-300 bg-amber-50 text-amber-700 placeholder:text-amber-300 focus:border-amber-400 focus:ring-amber-100"
                      : (isBasicMode && parseFloat(basicCompliance?.totalCost ?? "") > 0)
                        ? "border-teal-200 bg-teal-50 text-teal-600 placeholder:text-teal-400 focus:border-teal-400 focus:ring-teal-100"
                        : "border-gray-200 bg-white text-gray-800 placeholder:text-gray-300 focus:border-blue-400 focus:ring-blue-100"
                  }`}
                />)
              ) : key === "maintenancePerKm" ? (
                isAdvancedMode ? (() => {
                  const val = parseFloat(advancedMaintenancePerKm ?? "");
                  const display = !isNaN(val) && val > 0 ? val.toFixed(4) : null;
                  return (
                    <div className={`flex w-full items-center justify-center rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold tabular-nums ${
                      display
                        ? "border-teal-200 bg-teal-50 text-teal-600"
                        : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>
                      {display ?? "NIL"}
                    </div>
                  );
                })() : (
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={
                    isBasicMode
                      ? (parseFloat(basicMaintenancePerKm ?? "") > 0 ? parseFloat(basicMaintenancePerKm!).toFixed(4) : "0")
                      : "0"
                  }
                  value={metrics[key] ?? ""}
                  onChange={(e) => onMetricChange(key, e.target.value)}
                  className={`w-full rounded-lg border px-1.5 py-1.5 text-center text-xs font-bold shadow-sm outline-none focus:ring-2 transition tabular-nums ${
                    metrics[key]
                      ? "border-amber-300 bg-amber-50 text-amber-700 placeholder:text-amber-300 focus:border-amber-400 focus:ring-amber-100"
                      : (isBasicMode && parseFloat(basicMaintenancePerKm ?? "") > 0)
                        ? "border-teal-200 bg-teal-50 text-teal-600 placeholder:text-teal-400 focus:border-teal-400 focus:ring-teal-100"
                        : "border-gray-200 bg-white text-gray-800 placeholder:text-gray-300 focus:border-blue-400 focus:ring-blue-100"
                  }`}
                />)
              ) : (
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={metrics[key] ?? ""}
                  onChange={(e) => onMetricChange(key, e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-1.5 py-1.5 text-center text-xs font-bold text-gray-800 shadow-sm outline-none placeholder:text-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition tabular-nums"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Total Cost Per Km footer */}
      <div className="flex items-center justify-between border-t border-gray-100 bg-white px-5 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total Running Cost Per Km</p>
          <p className="mt-0.5 text-[10px] text-gray-300">EMI + Mileage + AdBlue + Tyres + Maintenance + Compliance</p>
        </div>
        <div className={`flex items-center gap-1.5 rounded-xl px-4 py-2 ${
          totalCostPerKm !== null ? "bg-blue-600" : "bg-gray-100"
        }`}>
          <span className={`text-sm font-extrabold tabular-nums ${
            totalCostPerKm !== null ? "text-white" : "text-gray-400"
          }`}>
            {totalCostPerKm !== null ? `₹ ${totalCostPerKm.toFixed(4)}` : "—"}
          </span>
          {totalCostPerKm !== null && (
            <span className="text-[10px] font-semibold text-blue-200">/ km</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage guide modal — step-by-step walkthrough, content varies by mode
// ---------------------------------------------------------------------------

type GuideStep = {
  icon: React.ElementType | null;
  color: string;
  panel: string;
  title: string;
  description: string;
  fields: string[];
  tip: string;
  isTotal?: boolean;
};

const MANUAL_GUIDE_STEPS: GuideStep[] = [
  {
    icon: Fuel,
    color: "amber",
    panel: "Fuel Details — Right Panel",
    title: "Set the Diesel Price",
    description: "Open the Fuel Details card on the right and enter the current diesel price per litre. This single value powers the Mileage Cost calculation across all truck cards instantly.",
    fields: ["Cost Per Litre (₹)"],
    tip: "Update this whenever fuel prices change — every truck card refreshes in real time.",
  },
  {
    icon: CircleDot,
    color: "blue",
    panel: "Tyre Details — Right Panel",
    title: "Configure Tyre Types",
    description: "Open Tyre Details and enter the purchase cost and expected lifespan (km) for each tyre type in your fleet. The calculator derives Cost per Km automatically.",
    fields: ["Tyre Cost (₹)", "Expected Range (km)  →  auto: Cost per Km"],
    tip: "Each type (R22.5, R20…) can have different numbers. The per-truck card picks the right one based on whichever type you select there.",
  },
  {
    icon: Gauge,
    color: "emerald",
    panel: "Truck Run Details — Right Panel",
    title: "Enter Monthly Distance per Layout",
    description: "Open Truck Run Details and fill in the average km per month for each tyre layout group. Km per Day is auto-calculated (÷ 26 working days) and is used by EMI Per Km and Compliance Per Km.",
    fields: ["Expected Km / Month  →  auto: Km / Day (÷ 26)"],
    tip: "Trucks sharing the same tyre layout share the same run profile. You can also type Km/Day directly — it back-fills Month automatically.",
  },
  {
    icon: Droplets,
    color: "cyan",
    panel: "AdBlue Details — Right Panel",
    title: "Add AdBlue Prices",
    description: "Open AdBlue Details and set the price per litre for each manufacturer. The per-truck AdBlue Charges column uses whichever brand you select on that truck.",
    fields: ["AdBlue Price Per Litre (₹)  —  one row per brand"],
    tip: "Different brands can carry different prices. Set them all here once — no need to revisit unless prices change.",
  },
  {
    icon: TruckIcon,
    color: "slate",
    panel: "Per-Truck Cards — Left Column",
    title: "Fill in Each Truck's Data",
    description: "Now go truck by truck. Columns slide in automatically as data becomes available — you only ever see what's relevant for that card.",
    fields: [
      "EMI Amount  →  auto: EMI / Day  and  EMI / Km",
      "Mileage (L/km)  →  auto: Mileage Cost / km",
      "Select Tyre Type  →  auto: Tyre Charges / km",
      "AdBlue (L/km) + Manufacturer  →  auto: AdBlue Charges / km",
      "Maintenance Per Km  (direct entry)",
      "Compliance Cost / Year  →  auto: Compliance / km",
    ],
    tip: "You don't need to fill every field. Blanks contribute ₹0 to the total — fill only the cost components you track.",
  },
  {
    icon: null,
    color: "indigo",
    panel: "Footer — Each Truck Card",
    title: "Read the Total",
    description: "The blue footer at the bottom of every truck card shows Total Running Cost Per Km — the live sum of all filled components. It updates on every keystroke.",
    fields: ["EMI/km  +  Mileage/km  +  AdBlue/km  +  Tyre/km  +  Maintenance/km  +  Compliance/km"],
    tip: "The total is always a lower bound — partial data means a partial cost. Fill all six components for a complete picture.",
    isTotal: true,
  },
];

const BASIC_GUIDE_STEPS: GuideStep[] = [
  {
    icon: Gauge,
    color: "emerald",
    panel: "Admin → Truck Run Config",
    title: "Set Km / Day per Layout (Prerequisite)",
    description: "Before anything else, confirm that km/day is configured for every tyre layout in Admin → Truck Run Config. This single value drives two auto-calculations: EMI Per Km (EMI/day ÷ km/day) and Compliance Per Km (annual doc cost ÷ 12 ÷ 26 ÷ km/day). Without it those columns will be blank.",
    fields: ["Km per Month  →  auto: Km per Day (÷ 26 working days)"],
    tip: "Trucks sharing the same tyre layout share the same run profile. Set it once per layout — all trucks in that group inherit it.",
  },
  {
    icon: CircleDot,
    color: "blue",
    panel: "Finance → EMI Tracking",
    title: "EMI auto-fetched per Truck",
    description: "Basic Mode pulls EMI Amount, EMI Per Day, and EMI Per Km directly from Finance → EMI Tracking, matched to each truck by registration number. Fields appear teal when auto-filled. Type a value to override (turns amber) — the override saves with the card.",
    fields: [
      "EMI Amount  —  fetched from the active EMI record for this truck",
      "EMI Per Day  —  fetched (or auto: EMI Amount ÷ 26 if not stored)",
      "EMI Per Km  —  fetched (or auto: EMI Per Day ÷ km/day if not stored)",
    ],
    tip: "If a truck has no EMI record in Finance → EMI Tracking, all three fields show 0. Add the record there first, then reload the calculator.",
  },
  {
    icon: Fuel,
    color: "amber",
    panel: "Maintenance → Fuel History",
    title: "Fuel Price auto-fetched — Mileage entered per Truck",
    description: "The diesel price (₹/litre) is read from the global \"Set Base Litre Cost\" config in Maintenance → Fuel History. The Fuel Details card is hidden in Basic Mode — you only enter Mileage (L/km) per truck and the calculator computes Mileage Cost automatically.",
    fields: [
      "Cost Per Litre  —  fetched from Maintenance → Fuel History → Set Base Litre Cost",
      "Mileage (L/km)  —  enter per truck  →  auto: Mileage Cost Per KM",
    ],
    tip: "Update the base litre cost whenever fuel prices change. All truck cards recalculate instantly without any per-truck input.",
  },
  {
    icon: Droplets,
    color: "cyan",
    panel: "Admin → AdBlue",
    title: "AdBlue auto-fetched by Truck Manufacturer",
    description: "AdBlue consumption (L/km), the matched Manufacturer, and AdBlue Charges (Per/KM) are all fetched from Admin → AdBlue. Each truck's manufacturer name is matched against the AdBlue page to find the right consumption profile. The default price per litre from the manufacturer record is used for the charges calculation.",
    fields: [
      "AdBlue (L/km)  —  fetched from the truck's AdBlue profile in Admin → AdBlue",
      "AdBlue (L/1000 km)  —  auto: L/km × 1000",
      "AdBlue Manufacturer  —  matched by truck manufacturer name",
      "AdBlue Charges (Per/KM)  —  auto: L/km × manufacturer default price per litre",
    ],
    tip: "The truck's manufacturer in Resources → Fleet must match the name in Admin → AdBlue exactly (case-insensitive). If they differ, no AdBlue data will appear.",
  },
  {
    icon: CheckCircle2,
    color: "teal",
    panel: "Admin → Tyre Cost Config",
    title: "Tyre Charges auto-fetched by Layout",
    description: "Tyre Charges (Per/KM) are fetched from Admin → Tyre Cost Config keyed by the truck's tyre layout (e.g. \"10+1\", \"6+1\"). The Tyre Type field does not exist in Basic Mode — the cost comes directly from the layout-level base rate, not a specific tyre brand.",
    fields: [
      "Tyre Charges Per KM  —  fetched from Admin → Tyre Cost Config for this truck's layout",
    ],
    tip: "Set a base cost per km for each layout in Admin → Tyre Cost Config. Trucks with the same layout share the same rate automatically.",
  },
  {
    icon: Info,
    color: "slate",
    panel: "Maintenance + Admin → Compliance Cost Config",
    title: "Maintenance & Compliance auto-fetched",
    description: "Maintenance Per KM is fetched from the global base rate set via \"Set Base Maintenance Cost\" in the Maintenance page — the same value for every truck. Compliance Cost/Year and Compliance Per KM are fetched from Admin → Compliance Cost Config, matched by each truck's tyre layout (sum of all 7 annual document costs).",
    fields: [
      "Maintenance Per KM  —  fetched from Maintenance → Set Base Maintenance Cost (global)",
      "Compliance Cost / Year  —  sum of RC + FC + Road Tax + Permits + Pollution Cert + Insurance (per layout)",
      "Compliance Per KM  —  auto: Compliance Cost/Year ÷ 12 ÷ 26 ÷ km/day",
    ],
    tip: "Compliance Per KM requires km/day to be set in Admin → Truck Run Config for the truck's layout. Without it the per-km figure will be blank.",
  },
  {
    icon: null,
    color: "teal",
    panel: "Footer — Each Truck Card",
    title: "Full Cost Picture — All 6 Components",
    description: "In Basic Mode all six cost components are auto-filled from their respective data sources. The footer shows the live total — the sum of every filled component. Any field can be manually overridden by typing a value (turns amber). Override values are saved per truck.",
    fields: ["EMI/km  +  Mileage/km  +  AdBlue/km  +  Tyre/km  +  Maintenance/km  +  Compliance/km"],
    tip: "Teal = auto-fetched. Amber = manually overridden. Blank = data not configured yet (contributes ₹0 to the total). For a complete cost picture, ensure all six data sources are configured.",
    isTotal: true,
  },
];

const ADVANCED_GUIDE_STEPS: GuideStep[] = [
  {
    icon: Gauge,
    color: "emerald",
    panel: "Admin → Truck Run Config  (prerequisite)",
    title: "Confirm Km / Day is Set",
    description: "Before anything else, verify that km/day is configured for every tyre layout in Admin → Truck Run Config. Advanced Mode uses it to compute Compliance Per KM (total daily compliance cost ÷ km/day). Without it, that field shows NIL.",
    fields: ["Km per Month  →  auto: Km per Day (÷ 26 working days)"],
    tip: "Trucks sharing the same tyre layout share the same run profile. Set it once per layout — all trucks in that group inherit it automatically.",
  },
  {
    icon: CircleDot,
    color: "blue",
    panel: "Finance → EMI Tracking",
    title: "EMI — Fully Fetched per Truck",
    description: "Advanced Mode reads EMI Amount, EMI Per Day, and EMI Per Km directly from Finance → EMI Tracking, matched by registration number. All three fields are read-only (teal). There is no manual override in Advanced Mode — update the source record in Finance → EMI Tracking to change the value.",
    fields: [
      "EMI Amount  —  fetched from the active EMI record",
      "EMI Per Day  —  fetched from the EMI record",
      "EMI Per Km  —  fetched from the EMI record",
    ],
    tip: "If a truck has no EMI record, all three fields show NIL. Add the record in Finance → EMI Tracking, then reload the calculator.",
  },
  {
    icon: Fuel,
    color: "amber",
    panel: "Maintenance → Fuel History",
    title: "Fuel Cost + Mileage — Fetched from Fuel History",
    description: "Base Fuel Cost (₹/litre) is fetched from the global Set Base Litre Cost config. Mileage (km/L) is the Lifetime Average from each truck's full fuel log history — the total km driven divided by total litres consumed across all recorded fill-ups. Both are read-only.",
    fields: [
      "Base Fuel Cost (₹/L)  —  fetched from Fuel History → Set Base Litre Cost (global)",
      "Mileage (L/km)  —  fetched as Lifetime Average from this truck's full fuel log history",
      "Mileage Cost Per KM  —  auto: Base Fuel Cost ÷ Mileage (km/L)",
    ],
    tip: "Mileage accuracy improves with more fuel log entries. A truck with fewer than 3–4 fill-ups may show an unrepresentative average.",
  },
  {
    icon: Droplets,
    color: "cyan",
    panel: "Admin → AdBlue",
    title: "AdBlue — Fully Fetched by Manufacturer",
    description: "AdBlue consumption (L/km), the matched manufacturer, and AdBlue Charges Per KM are all fetched from Admin → AdBlue. The truck's manufacturer name in Resources → Fleet is matched against the AdBlue profiles (case-insensitive). All fields are read-only in Advanced Mode.",
    fields: [
      "AdBlue (L/km)  —  fetched from the truck's matched AdBlue profile",
      "AdBlue (L/1000 km)  —  auto: L/km × 1000",
      "AdBlue Manufacturer  —  matched by truck manufacturer name",
      "AdBlue Charges (Per/KM)  —  auto: L/km × manufacturer default price per litre",
    ],
    tip: "The truck's manufacturer in Resources → Fleet must match the AdBlue profile name exactly (case-insensitive). If they differ, AdBlue fields will show NIL.",
  },
  {
    icon: CircleDot,
    color: "teal",
    panel: "Maintenance → Tyre Management → View Tyre Data",
    title: "Tyre Charges — Fetched from Tyre Data",
    description: "Tyre Charges Per KM is fetched from the \"Total Tyre Cost Per KM\" figure in the View Tyre Data dialog in Tyre Management. It is computed per truck from the actual fitted tyres: for each position, tyre purchase cost ÷ expected range (km), summed across all positions. Read-only in Advanced Mode.",
    fields: [
      "Tyre Charges (Per/KM)  —  fetched as: Σ (tyre cost ÷ range km) across all fitted positions",
    ],
    tip: "For a truck to show a value, each fitted tyre must have a cost and expected range recorded in the Tyre Inventory. Missing either shows NIL for that position.",
  },
  {
    icon: Info,
    color: "slate",
    panel: "Truck Maintenance → Full Status dialog",
    title: "Maintenance Per KM — Fetched from Full Status",
    description: "Maintenance Per KM is fetched from the \"Cost / Km\" figure shown in the Full Status dialog in Truck Maintenance. The backend sums all maintenance costs for this truck over the past 12 months, then converts to a per-km rate using the truck's km/day from Truck Run Config.",
    fields: [
      "Maintenance Per KM  —  fetched as: 12-month maintenance total ÷ 12 ÷ 26 ÷ km/day",
    ],
    tip: "A truck with no maintenance records in the past 12 months will show NIL. The rate updates automatically as new records are added in Truck Maintenance.",
  },
  {
    icon: CheckCircle2,
    color: "violet",
    panel: "Compliance & Renewals → View Cost Breakdown",
    title: "Compliance — Fetched from Cost Breakdown",
    description: "Both compliance fields are fetched from the View Cost Breakdown dialog in Compliance & Renewals. Compliance Cost/Year is the total of all 7 stored document expenses. Compliance Per KM mirrors the dialog's \"Per KM\" footer: each document's expense is amortized over its validity period (issue date → expiry date), summed, then divided by km/day.",
    fields: [
      "Compliance Cost / Year  —  fetched as: RC + FC + Road Tax + National Permit + Local Permit + Pollution Cert + Insurance",
      "Compliance Per KM  —  fetched as: Σ (expense ÷ validity days) ÷ km/day",
    ],
    tip: "Compliance Per KM requires each document to have an expiry date and at least one history entry (set when the document was registered through the app). Documents missing either will not contribute to the per-km figure.",
  },
  {
    icon: null,
    color: "violet",
    panel: "Footer — Each Truck Card",
    title: "Total — All 6 Components Fetched",
    description: "In Advanced Mode every field is fetched automatically from its data source. The teal footer shows Total Running Cost Per Km — the live sum of all six components. Teal = data present. NIL = data source not yet configured (contributes ₹0 to the total). No manual entry or overrides exist in Advanced Mode.",
    fields: ["EMI/km  +  Mileage/km  +  AdBlue/km  +  Tyre/km  +  Maintenance/km  +  Compliance/km"],
    tip: "NIL means the underlying data source has no record for this truck yet — not that the cost is zero. Configure each source to get a complete picture.",
    isTotal: true,
  },
];

const GUIDE_STEPS_BY_MODE: Record<Mode, GuideStep[]> = {
  Manual:   MANUAL_GUIDE_STEPS,
  Basic:    BASIC_GUIDE_STEPS,
  Advanced: ADVANCED_GUIDE_STEPS,
};

const GUIDE_MODE_STYLE: Record<Mode, { sidebar: string; sidebarHeader: string; dot: string; progressBar: string }> = {
  Manual:   { sidebar: "bg-amber-50",   sidebarHeader: "bg-amber-100 text-amber-700",  dot: "bg-amber-500",   progressBar: "bg-amber-500" },
  Basic:    { sidebar: "bg-teal-50",    sidebarHeader: "bg-teal-100 text-teal-700",    dot: "bg-teal-500",    progressBar: "bg-teal-500" },
  Advanced: { sidebar: "bg-violet-50",  sidebarHeader: "bg-violet-100 text-violet-700",dot: "bg-violet-500",  progressBar: "bg-violet-500" },
};

const GUIDE_COLOR_MAP: Record<string, { bg: string; border: string; icon: string; badge: string; dot: string; tip: string }> = {
  amber:  { bg: "bg-amber-50",   border: "border-amber-200",  icon: "text-amber-600 bg-amber-100",   badge: "bg-amber-100 text-amber-700",   dot: "bg-amber-400",   tip: "bg-amber-50 border-amber-200 text-amber-700" },
  blue:   { bg: "bg-blue-50",    border: "border-blue-200",   icon: "text-blue-600 bg-blue-100",     badge: "bg-blue-100 text-blue-700",     dot: "bg-blue-400",    tip: "bg-blue-50 border-blue-200 text-blue-700" },
  emerald:{ bg: "bg-emerald-50", border: "border-emerald-200",icon: "text-emerald-600 bg-emerald-100",badge: "bg-emerald-100 text-emerald-700",dot: "bg-emerald-400", tip: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  teal:   { bg: "bg-teal-50",    border: "border-teal-200",   icon: "text-teal-600 bg-teal-100",     badge: "bg-teal-100 text-teal-700",     dot: "bg-teal-400",    tip: "bg-teal-50 border-teal-200 text-teal-700" },
  cyan:   { bg: "bg-cyan-50",    border: "border-cyan-200",   icon: "text-cyan-600 bg-cyan-100",     badge: "bg-cyan-100 text-cyan-700",     dot: "bg-cyan-400",    tip: "bg-cyan-50 border-cyan-200 text-cyan-700" },
  slate:  { bg: "bg-slate-50",   border: "border-slate-200",  icon: "text-slate-600 bg-slate-100",   badge: "bg-slate-100 text-slate-700",   dot: "bg-slate-400",   tip: "bg-slate-50 border-slate-200 text-slate-700" },
  indigo: { bg: "bg-indigo-50",  border: "border-indigo-200", icon: "text-indigo-600 bg-indigo-100", badge: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-400",  tip: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  violet: { bg: "bg-violet-50",  border: "border-violet-200", icon: "text-violet-600 bg-violet-100", badge: "bg-violet-100 text-violet-700", dot: "bg-violet-400",  tip: "bg-violet-50 border-violet-200 text-violet-700" },
};

function UsageGuideModal({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const steps = GUIDE_STEPS_BY_MODE[mode];
  const modeStyle = GUIDE_MODE_STYLE[mode];

  const [activeStep, setActiveStep] = useState(0);
  const [enteredSteps, setEnteredSteps] = useState<Set<number>>(new Set([0]));
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset step when mode changes (shouldn't happen while open, but defensive)
  useEffect(() => {
    setActiveStep(0);
    setEnteredSteps(new Set([0]));
  }, [mode]);

  function goTo(idx: number) {
    setActiveStep(idx);
    setEnteredSteps((prev) => new Set([...prev, idx]));
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goNext() { if (activeStep < steps.length - 1) goTo(activeStep + 1); }
  function goPrev() { if (activeStep > 0) goTo(activeStep - 1); }

  const step = steps[activeStep];
  const c = GUIDE_COLOR_MAP[step.color];
  const IconComponent = step.icon;
  const isLast = activeStep === steps.length - 1;
  const isAdvanced = mode === "Advanced";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-3xl max-h-[90vh] rounded-2xl bg-white shadow-2xl overflow-hidden"
        style={{ minHeight: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left sidebar — step navigator */}
        <div className={`flex w-56 shrink-0 flex-col border-r border-white/60 py-6 transition-colors duration-300 ${modeStyle.sidebar}`}>
          <div className="flex items-center gap-2.5 px-5 pb-5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${modeStyle.sidebarHeader}`}>
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-800">Quick Start</p>
              <p className="text-[10px] text-gray-500">{mode} Mode</p>
            </div>
          </div>

          <div className="flex flex-col gap-1 px-3">
            {steps.map((s, i) => {
              const sc = GUIDE_COLOR_MAP[s.color];
              const isActive = i === activeStep;
              const isDone = enteredSteps.has(i) && i < activeStep;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all duration-200 ${
                    isActive ? "bg-white shadow-sm" : "hover:bg-white/60"
                  }`}
                >
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 ${
                    isDone
                      ? "bg-emerald-100 text-emerald-600"
                      : isActive
                        ? `${sc.dot} text-white`
                        : "bg-white/70 text-gray-400"
                  }`}>
                    {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[11px] font-semibold leading-tight ${isActive ? "text-gray-900" : "text-gray-500"}`}>
                      {s.title}
                    </p>
                    <p className={`truncate text-[10px] leading-tight ${isActive ? "text-gray-400" : "text-gray-300"}`}>
                      {s.panel.split("—")[0].trim()}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="mt-auto px-5 pt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-gray-400">Progress</span>
              <span className="text-[10px] font-bold text-gray-500">{activeStep + 1} / {steps.length}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/60">
              <div
                className={`h-full rounded-full transition-all duration-500 ${modeStyle.progressBar}`}
                style={{ width: `${((activeStep + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right content panel */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Modal top bar */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c.badge}`}>
                {isAdvanced ? "Preview" : `Step ${activeStep + 1}`}
              </span>
              <span className="text-[11px] text-gray-400">{step.panel}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Step content — keyed so it remounts (re-animates) on step change */}
          <div ref={contentRef} key={`${mode}-${activeStep}`} className="flex-1 overflow-y-auto px-7 py-6" style={{ animation: "guideSlideIn 0.3s ease both" }}>
            {/* Icon + title */}
            <div className="flex items-start gap-4">
              {IconComponent ? (
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${c.icon}`}>
                  <IconComponent className="h-6 w-6" />
                </div>
              ) : (
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${c.icon || "bg-indigo-100 text-indigo-600"}`}>
                  <span className="text-xl font-extrabold">Σ</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-gray-900">{step.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{step.description}</p>
              </div>
            </div>

            {/* Fields list */}
            <div className={`mt-5 rounded-2xl border p-5 ${c.border} ${c.bg}`}>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {isAdvanced ? "Planned capabilities" : step.isTotal ? "Formula" : "What to enter"}
              </p>
              <div className="flex flex-col gap-2.5">
                {step.fields.map((field, fi) => (
                  <div
                    key={fi}
                    className="flex items-start gap-2.5"
                    style={{ animation: `guideSlideIn ${0.15 + fi * 0.08}s ease both` }}
                  >
                    <ArrowRight className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${c.dot.replace("bg-", "text-")}`} />
                    <span className="text-[12px] font-semibold leading-snug text-gray-700">{field}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tip */}
            <div className={`mt-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 ${c.tip} ${c.border}`}>
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="text-[11px] leading-relaxed">{step.tip}</p>
            </div>

            {/* Total footer mock — only for total steps */}
            {step.isTotal && (
              <div className={`mt-5 rounded-2xl px-6 py-5 ${
                mode === "Basic"
                  ? "border border-teal-200 bg-teal-600"
                  : "border border-blue-200 bg-blue-600"
              }`}>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${mode === "Basic" ? "text-teal-200" : "text-blue-200"}`}>Result</p>
                <p className="mt-1 text-base font-extrabold text-white">Total Running Cost Per Km</p>
                <p className={`mt-1 font-mono text-[11px] ${mode === "Basic" ? "text-teal-300" : "text-blue-300"}`}>
                  {"= EMI + Mileage + AdBlue + Tyre + Maintenance + Compliance"}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="rounded-xl bg-white/20 px-4 py-2 text-xl font-extrabold tabular-nums text-white">₹ —.——</span>
                  <span className={`text-xs font-semibold ${mode === "Basic" ? "text-teal-300" : "text-blue-300"}`}>per km</span>
                </div>
              </div>
            )}
          </div>

          {/* Nav footer */}
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={goPrev}
              disabled={activeStep === 0}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-30"
            >
              ← Previous
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {isAdvanced ? "Close" : "Got it, let's go!"}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-gray-700"
              >
                Next Step
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes guideSlideIn {
          from { opacity: 0; transform: translateX(-14px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calculation info modal — per-mode explanation of every field
// ---------------------------------------------------------------------------

type FieldRow = { label: string; type: "manual" | "calculated" | "fetched"; formula?: string; note?: string };
type Section = { title: string; color: string; fields: FieldRow[] };

const MANUAL_MODE_SECTIONS: Section[] = [
  {
    title: "Tyre Details — Right Panel",
    color: "blue",
    fields: [
      { label: "Tyre Cost (₹)",      type: "manual",     note: "Purchase cost of one tyre for a given tyre type. Enter separately for each type used in your fleet (e.g. R22.5, R20)." },
      { label: "Expected Range (km)", type: "manual",     note: "Estimated lifespan of this tyre type before replacement, in km (e.g. 80,000 km)." },
      { label: "Cost per Km",         type: "calculated", formula: "Tyre Cost ÷ Expected Range", note: "Auto-calculated as soon as both fields above are filled. This per-km value is used in the Tyre Charges calculation on each truck card." },
    ],
  },
  {
    title: "Truck Run Details — Right Panel",
    color: "emerald",
    fields: [
      { label: "Expected Km / Month", type: "manual",     note: "Average distance per month for trucks with this tyre layout. Grouped by layout (e.g. 10+1, 6+2) since trucks with the same layout share similar run profiles." },
      { label: "Expected Km / Day",   type: "calculated", formula: "Expected Km / Month ÷ 26  (26 working days)", note: "You can also type directly in this field — it back-calculates Km / Month automatically. This value feeds the EMI Per Km calculation on each truck card." },
    ],
  },
  {
    title: "Fuel Details — Right Panel (Manual) / Base Config (Basic)",
    color: "amber",
    fields: [
      { label: "Cost Per Litre (₹)", type: "manual", note: "Current diesel price per litre (e.g. ₹97.3). In Manual mode: enter it in the Fuel Details right-panel card. In Basic mode: auto-fetched from Maintenance → Fuel History → Set Base Litre Cost — no manual entry needed here. Applied uniformly to all trucks." },
    ],
  },
  {
    title: "AdBlue Details — Right Panel",
    color: "cyan",
    fields: [
      { label: "AdBlue Price Per Litre (₹)", type: "manual", note: "Price per litre for each AdBlue manufacturer (e.g. Yara, BASF). Each brand can have a different price. The per-truck calculation uses the price of whichever brand is selected on that truck card." },
    ],
  },
  {
    title: "EMI Fields — Per-Truck Card",
    color: "slate",
    fields: [
      { label: "EMI Amount",  type: "manual",     note: "Total monthly EMI payable for this truck's loan. Entering a value slides in the two auto-calculated columns to its right." },
      { label: "EMI Per Day", type: "calculated", formula: "EMI Amount ÷ 26", note: "Assumes 26 working days per month. Slides in once EMI Amount is entered." },
      { label: "EMI Per Km",  type: "calculated", formula: "EMI Per Day ÷ Expected Km / Day", note: "Km / Day is taken from Truck Run Details for this truck's tyre layout. Requires both EMI Amount and Km / Month (Run Details) to be filled." },
    ],
  },
  {
    title: "Fuel / Mileage Fields — Per-Truck Card",
    color: "amber",
    fields: [
      { label: "Mileage (L/KM)",        type: "manual",     note: "Fuel consumption rate for this truck — litres of diesel per km (e.g. 0.28 L/km means the truck covers ~3.6 km per litre)." },
      { label: "Mileage COST (Per/KM)", type: "calculated", formula: "Cost Per Litre ÷ Mileage (L/KM)", note: "Slides in once Mileage is entered. Updates automatically whenever Cost Per Litre (Fuel Details) is changed." },
    ],
  },
  {
    title: "AdBlue Fields — Per-Truck Card",
    color: "cyan",
    fields: [
      { label: "AdBlue (L / km)",          type: "manual",     note: "AdBlue consumed per km by this truck (e.g. 0.015 L/km). Entering this auto-fills AdBlue (L / 1000 km) by multiplying ×1000." },
      { label: "AdBlue (L / 1000 km)",     type: "manual",     note: "Same consumption rate expressed per 1000 km (e.g. 15 L/1000 km). Entering this auto-fills AdBlue (L / km) by dividing ÷1000. Both fields stay in sync — edit either one." },
      { label: "AdBlue Manufacturer",      type: "manual",     note: "The AdBlue brand fitted on this truck (e.g. Yara, BASF). Selecting a brand unlocks the AdBlue Charges column and uses that brand's price from the right panel." },
      { label: "AdBlue Charges (Per/KM)",  type: "calculated", formula: "AdBlue Consumption (L/km) × AdBlue Price Per Litre (selected manufacturer)", note: "Slides in once a manufacturer is selected. Requires AdBlue (L/km) and the selected brand's price to be non-zero." },
    ],
  },
  {
    title: "Tyre Fields — Per-Truck Card",
    color: "blue",
    fields: [
      { label: "Tyre Type",            type: "manual",     note: "The tyre type currently fitted on this truck (e.g. R22.5). Selecting one unlocks the Tyre Charges column using that type's cost and range from the right panel." },
      { label: "Tyre Charges (Per/KM)", type: "calculated", formula: "(Tyre Cost ÷ Expected Range) × Number of Tyres in Layout", note: "Slides in once a Tyre Type is selected. Number of tyres is parsed from the layout string — e.g. '10+1' = 11 tyres, '6+2' = 8 tyres. Requires Tyre Details (Cost and Range) to be filled for the selected type." },
    ],
  },
  {
    title: "Other — Per-Truck Card",
    color: "slate",
    fields: [
      { label: "Maintenance Per KM", type: "manual", note: "Estimated maintenance cost per km covering parts, labour, and scheduled servicing (e.g. oil changes, brake pads, general repairs). Use historical spend data or a budget figure." },
    ],
  },
  {
    title: "Compliance — Per-Truck Card",
    color: "violet",
    fields: [
      { label: "Compliance Cost / Year",  type: "manual",     note: "Total annual cost of all compliance documents for this truck — RC, FC, Road Tax, National Permit, Local Permit, Pollution Certificate, and Insurance. Enter the combined yearly spend." },
      { label: "Compliance Per KM",       type: "calculated", formula: "Compliance Cost / Year ÷ 12 ÷ 26 ÷ Expected Km / Day", note: "Converts the yearly compliance spend into a per-km figure. Dividing by 12 gives monthly cost, dividing by 26 gives daily cost (26 working days), then dividing by Km/Day gives the per-km rate. Requires Compliance Cost / Year and Expected Km / Day (Truck Run Details) to be filled." },
    ],
  },
  {
    title: "Summary — Per-Truck Card",
    color: "indigo",
    fields: [
      {
        label: "Total Running Cost Per Km",
        type: "calculated",
        formula: "EMI Per Km + Mileage COST (Per/KM) + AdBlue Charges (Per/KM) + Tyre Charges (Per/KM) + Maintenance Per KM + Compliance Per KM",
        note: "Shown as a highlighted footer on every truck card. Components that are blank or not yet computable contribute ₹0 — the total updates in real time as you fill in each field. Fill in all six components for a complete per-km cost picture.",
      },
    ],
  },
];

const BASIC_MODE_SECTIONS: Section[] = [
  {
    title: "Admin → Truck Run Config  (prerequisite)",
    color: "emerald",
    fields: [
      { label: "Km per Month", type: "fetched", note: "Fetched from Admin → Truck Run Config for each tyre layout. Drives two auto-calculations: EMI Per Km and Compliance Per Km. Must be set before those columns can appear." },
      { label: "Km per Day",   type: "calculated", formula: "Km per Month ÷ 26", note: "Auto-derived from the monthly figure. Used as the divisor for both EMI Per Km and Compliance Per Km." },
    ],
  },
  {
    title: "Finance → EMI Tracking  (per truck)",
    color: "blue",
    fields: [
      { label: "EMI Amount",  type: "fetched",     note: "Fetched from Finance → EMI Tracking, matched to this truck by registration number. Override by typing — the override saves with the card (amber field)." },
      { label: "EMI Per Day", type: "fetched",     formula: "EMI Amount ÷ 26  (if not stored)", note: "Fetched from the EMI record when available. Falls back to EMI Amount ÷ 26 if only the amount is stored." },
      { label: "EMI Per Km",  type: "fetched",     formula: "EMI Per Day ÷ Km / Day  (if not stored)", note: "Fetched from the EMI record when available. Falls back to EMI Per Day ÷ Km/Day (from Truck Run Config) if not stored." },
    ],
  },
  {
    title: "Maintenance → Fuel History  (global) + per-truck mileage",
    color: "amber",
    fields: [
      { label: "Cost Per Litre (₹)", type: "fetched",     note: "Fetched from the global base config set via Maintenance → Fuel History → Set Base Litre Cost. The Fuel Details card is hidden in Basic Mode — this value is read automatically for all trucks." },
      { label: "Mileage (L/km)",     type: "manual",      note: "The only field in Basic Mode that requires manual entry per truck. Enter fuel consumption in litres per km (e.g. 0.28 L/km)." },
      { label: "Mileage Cost Per KM", type: "calculated", formula: "Cost Per Litre ÷ Mileage (L/km)", note: "Auto-computed once Mileage is entered. Updates instantly when the global fuel price changes." },
    ],
  },
  {
    title: "Admin → AdBlue  (per truck, matched by manufacturer)",
    color: "cyan",
    fields: [
      { label: "AdBlue (L / km)",         type: "fetched",     note: "Fetched from Admin → AdBlue for the truck's AdBlue profile. Matched by the truck's manufacturer name (case-insensitive). The manufacturer in Resources → Fleet must match the name in Admin → AdBlue." },
      { label: "AdBlue (L / 1000 km)",    type: "calculated",  formula: "AdBlue (L/km) × 1000", note: "Auto-derived from L/km. Both fields stay in sync — editing either one updates the other." },
      { label: "AdBlue Manufacturer",     type: "fetched",     note: "Auto-matched to the truck's manufacturer name from Admin → AdBlue. Override by selecting a different brand (turns amber)." },
      { label: "AdBlue Charges (Per/KM)", type: "calculated",  formula: "AdBlue (L/km) × Manufacturer default price per litre", note: "Computed from the fetched consumption rate and the manufacturer's default price per litre set in Admin → AdBlue." },
    ],
  },
  {
    title: "Admin → Tyre Cost Config  (per layout)",
    color: "teal",
    fields: [
      { label: "Tyre Charges (Per/KM)", type: "fetched", note: "Fetched from Admin → Tyre Cost Config keyed by the truck's tyre layout (e.g. 10+1, 6+1). The Tyre Type field does not exist in Basic Mode — cost comes from the layout-level base rate, not a specific tyre brand. Trucks sharing the same layout get the same rate." },
    ],
  },
  {
    title: "Maintenance → Set Base Maintenance Cost  (global)",
    color: "slate",
    fields: [
      { label: "Maintenance Per KM", type: "fetched", note: "Fetched from the global base rate set via the Set Base Maintenance Cost button in the Maintenance page. The same value applies to every truck in Basic Mode. Override by typing to set a truck-specific rate (turns amber)." },
    ],
  },
  {
    title: "Admin → Compliance Cost Config  (per layout)",
    color: "violet",
    fields: [
      { label: "Compliance Cost / Year",  type: "fetched",     note: "Sum of all 7 annual document costs (RC + FC + Road Tax + National Permit + Local Permit + Pollution Cert + Insurance) from Admin → Compliance Cost Config, matched by the truck's tyre layout. Override by typing to enter a custom annual figure (turns amber)." },
      { label: "Compliance Per KM",       type: "calculated",  formula: "Compliance Cost / Year ÷ 12 ÷ 26 ÷ Km / Day", note: "Converts the yearly compliance spend to a per-km rate. Requires Km/Day to be set in Admin → Truck Run Config for the truck's layout." },
    ],
  },
  {
    title: "Summary — Per-Truck Card",
    color: "indigo",
    fields: [
      {
        label: "Total Running Cost Per Km",
        type: "calculated",
        formula: "EMI Per Km + Mileage Cost Per KM + AdBlue Charges Per KM + Tyre Charges Per KM + Maintenance Per KM + Compliance Per KM",
        note: "All six components are auto-filled from their data sources. Teal = fetched automatically. Amber = manually overridden. Blank = data source not configured (contributes ₹0). The total updates in real time.",
      },
    ],
  },
];

const ADVANCED_MODE_SECTIONS: Section[] = [
  {
    title: "Admin → Truck Run Config  (prerequisite for Compliance Per KM)",
    color: "emerald",
    fields: [
      { label: "Km per Month", type: "fetched",    note: "Fetched from Admin → Truck Run Config for each tyre layout. Required for the Compliance Per KM calculation. Set once per layout — all trucks in that group inherit it." },
      { label: "Km per Day",   type: "calculated", formula: "Km per Month ÷ 26", note: "Auto-derived from the monthly figure. Used as the divisor for Compliance Per KM." },
    ],
  },
  {
    title: "Finance → EMI Tracking  (per truck — fully fetched, read-only)",
    color: "blue",
    fields: [
      { label: "EMI Amount",  type: "fetched", note: "Fetched from Finance → EMI Tracking, matched by registration number. Read-only in Advanced Mode — update the source record to change the value." },
      { label: "EMI Per Day", type: "fetched", note: "Fetched directly from the EMI record. Shows NIL if no EMI record exists for this truck." },
      { label: "EMI Per Km",  type: "fetched", note: "Fetched directly from the EMI record. Shows NIL if no EMI record exists for this truck." },
    ],
  },
  {
    title: "Maintenance → Fuel History  (global cost + per-truck lifetime average)",
    color: "amber",
    fields: [
      { label: "Base Fuel Cost (₹/L)", type: "fetched",     note: "Fetched from the global Set Base Litre Cost config in Maintenance → Fuel History. Applies to all trucks." },
      { label: "Mileage (L/km)",       type: "fetched",     note: "Fetched as the Lifetime Average from this truck's complete fuel log history: total km driven ÷ total litres consumed across all recorded fill-ups." },
      { label: "Mileage Cost Per KM",  type: "calculated",  formula: "Base Fuel Cost ÷ Mileage (km/L)", note: "Auto-computed from the two fetched values above. Shows NIL if either source is missing." },
    ],
  },
  {
    title: "Admin → AdBlue  (per truck — matched by manufacturer, fully fetched)",
    color: "cyan",
    fields: [
      { label: "AdBlue (L / km)",         type: "fetched",    note: "Fetched from Admin → AdBlue matched to this truck's manufacturer name (case-insensitive). Shows NIL if no matching AdBlue profile exists." },
      { label: "AdBlue (L / 1000 km)",    type: "calculated", formula: "AdBlue (L/km) × 1000", note: "Auto-derived. Displayed for readability alongside the L/km figure." },
      { label: "AdBlue Manufacturer",     type: "fetched",    note: "Auto-matched to the truck's manufacturer name from Admin → AdBlue. Read-only in Advanced Mode." },
      { label: "AdBlue Charges (Per/KM)", type: "calculated", formula: "AdBlue (L/km) × manufacturer default price per litre", note: "Computed from the fetched consumption rate and the manufacturer's default price set in Admin → AdBlue." },
    ],
  },
  {
    title: "Maintenance → Tyre Management → View Tyre Data",
    color: "teal",
    fields: [
      { label: "Tyre Charges (Per/KM)", type: "fetched", formula: "Σ (tyre cost ÷ expected range km) across all fitted positions", note: "Mirrors \"Total Tyre Cost Per KM\" in the View Tyre Data dialog. Summed from actual fitted tyres: each tyre's purchase cost divided by its expected range. Requires cost and range to be set in Tyre Inventory for each fitted position." },
    ],
  },
  {
    title: "Truck Maintenance → Full Status dialog",
    color: "slate",
    fields: [
      { label: "Maintenance Per KM", type: "fetched", formula: "12-month maintenance total ÷ 12 ÷ 26 ÷ km/day", note: "Mirrors \"Cost / Km\" in the Full Status dialog. The backend sums all maintenance costs for this truck over the past 12 months, then converts to a per-km rate using km/day from Truck Run Config. Shows NIL if no maintenance records exist in the past 12 months." },
    ],
  },
  {
    title: "Compliance & Renewals → View Cost Breakdown",
    color: "violet",
    fields: [
      { label: "Compliance Cost / Year", type: "fetched",    formula: "RC + FC + Road Tax + National Permit + Local Permit + Pollution Cert + Insurance", note: "Mirrors \"Total Compliance Cost\" in the Cost Breakdown dialog. Sum of all 7 stored document expense fields on the truck record." },
      { label: "Compliance Per KM",      type: "fetched",    formula: "Σ (expense ÷ validity days) per document ÷ km/day", note: "Mirrors \"Per KM\" in the Cost Breakdown footer. Each document's expense is amortized over its validity period (issue date → expiry date from history), totalled as a daily cost, then divided by km/day. Requires expiry dates and history entries for each document." },
    ],
  },
  {
    title: "Summary — Per-Truck Card",
    color: "indigo",
    fields: [
      {
        label: "Total Running Cost Per Km",
        type: "calculated",
        formula: "EMI Per Km + Mileage Cost Per KM + AdBlue Charges Per KM + Tyre Charges Per KM + Maintenance Per KM + Compliance Per KM",
        note: "All six components are fetched automatically from their data sources. Teal = data present. NIL = data source not configured (contributes ₹0). No manual entry or overrides exist in Advanced Mode.",
      },
    ],
  },
];

const COLOR_MAP: Record<string, { badge: string; dot: string; section: string }> = {
  blue:    { badge: "bg-blue-100 text-blue-700",       dot: "bg-blue-400",    section: "border-blue-100 bg-blue-50/40" },
  emerald: { badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400", section: "border-emerald-100 bg-emerald-50/40" },
  amber:   { badge: "bg-amber-100 text-amber-700",     dot: "bg-amber-400",   section: "border-amber-100 bg-amber-50/40" },
  cyan:    { badge: "bg-cyan-100 text-cyan-700",       dot: "bg-cyan-400",    section: "border-cyan-100 bg-cyan-50/40" },
  teal:    { badge: "bg-teal-100 text-teal-700",       dot: "bg-teal-400",    section: "border-teal-100 bg-teal-50/40" },
  slate:   { badge: "bg-slate-100 text-slate-700",     dot: "bg-slate-400",   section: "border-slate-100 bg-slate-50/40" },
  indigo:  { badge: "bg-indigo-100 text-indigo-700",   dot: "bg-indigo-400",  section: "border-indigo-200 bg-indigo-50/60" },
  violet:  { badge: "bg-violet-100 text-violet-700",   dot: "bg-violet-400",  section: "border-violet-100 bg-violet-50/40" },
};

// ---------------------------------------------------------------------------
// Animated flow visualization
// ---------------------------------------------------------------------------

function CalcFlowVisualization({ replayKey }: { replayKey: number }) {
  const [phase, setPhase] = useState(-1);

  useEffect(() => {
    setPhase(-1);
    const timers = [
      setTimeout(() => setPhase(0), 80),
      setTimeout(() => setPhase(1), 480),
      setTimeout(() => setPhase(2), 880),
      setTimeout(() => setPhase(3), 1280),
      setTimeout(() => setPhase(4), 1680),
      setTimeout(() => setPhase(5), 2080),
      setTimeout(() => setPhase(6), 2580),
    ];
    return () => timers.forEach(clearTimeout);
  }, [replayKey]);

  const ROWS = [
    {
      inputs: ["EMI Amount", "Km / Day"],
      formula: "EMI ÷ 26 ÷ Km/Day",
      output: "EMI Per Km",
      inputCls: "bg-slate-100 text-slate-600 border-slate-200",
      outputCls: "bg-slate-50 text-slate-700 border-slate-300",
    },
    {
      inputs: ["Cost / Litre", "Mileage (L/km)"],
      formula: "Cost ÷ Mileage",
      output: "Mileage Cost / km",
      inputCls: "bg-amber-100 text-amber-700 border-amber-200",
      outputCls: "bg-amber-50 text-amber-700 border-amber-300",
    },
    {
      inputs: ["AdBlue (L/km)", "AdBlue Price"],
      formula: "L/km × Price / Litre",
      output: "AdBlue Charges / km",
      inputCls: "bg-cyan-100 text-cyan-700 border-cyan-200",
      outputCls: "bg-cyan-50 text-cyan-700 border-cyan-300",
    },
    {
      inputs: ["Tyre Cost", "Range", "Layout"],
      formula: "(Cost ÷ Range) × Tyres",
      output: "Tyre Charges / km",
      inputCls: "bg-blue-100 text-blue-700 border-blue-200",
      outputCls: "bg-blue-50 text-blue-700 border-blue-300",
    },
    {
      inputs: ["Maintenance / km"],
      formula: "Direct entry",
      output: "Maintenance / km",
      inputCls: "bg-gray-100 text-gray-600 border-gray-200",
      outputCls: "bg-gray-50 text-gray-700 border-gray-200",
    },
    {
      inputs: ["Compliance Cost / Year", "Km / Day"],
      formula: "Cost ÷ 12 ÷ 26 ÷ Km/Day",
      output: "Compliance / km",
      inputCls: "bg-violet-100 text-violet-700 border-violet-200",
      outputCls: "bg-violet-50 text-violet-700 border-violet-300",
    },
  ];

  return (
    <div className="flex flex-col select-none">
      {ROWS.map((row, i) => (
        <div key={row.output}>
          {/* Row */}
          <div
            className="flex items-center gap-4 px-6 py-3.5"
            style={{
              opacity: phase >= i ? 1 : 0,
              transform: phase >= i ? "translateX(0)" : "translateX(-22px)",
              transition: "opacity 0.42s ease, transform 0.42s ease",
            }}
          >
            {/* Input badges */}
            <div className="flex w-[160px] shrink-0 flex-col gap-1.5">
              {row.inputs.map((inp) => (
                <span key={inp} className={`rounded-lg border px-3 py-1 text-[11px] font-bold leading-snug ${row.inputCls}`}>
                  {inp}
                </span>
              ))}
            </div>

            {/* Arrow + formula */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="shrink-0 whitespace-nowrap rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 font-mono text-[11px] text-gray-500 shadow-sm">
                {row.formula}
              </span>
              <div className="h-px flex-1 bg-gray-200" />
              <svg width="8" height="12" viewBox="0 0 8 12" fill="none" className="shrink-0">
                <path d="M0 0 L8 6 L0 12 Z" fill="#d1d5db" />
              </svg>
            </div>

            {/* Output badge */}
            <div className={`w-[164px] shrink-0 rounded-xl border px-3.5 py-2 text-center text-[12px] font-bold ${row.outputCls}`}>
              {row.output}
            </div>
          </div>

          {/* "+" separator */}
          {i < ROWS.length - 1 && (
            <div
              className="flex items-center justify-center py-1"
              style={{
                opacity: phase >= i + 1 ? 1 : 0,
                transition: "opacity 0.3s ease 0.1s",
              }}
            >
              <span className="text-sm font-bold text-gray-200">+</span>
            </div>
          )}
        </div>
      ))}

      {/* Sum divider */}
      <div
        className="mx-6 mt-5 mb-4 flex items-center gap-3"
        style={{ opacity: phase >= 6 ? 1 : 0, transition: "opacity 0.4s ease" }}
      >
        <div className="h-px flex-1 bg-blue-200" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-blue-400">Total</span>
        <div className="h-px flex-1 bg-blue-200" />
      </div>

      {/* Total box */}
      <div
        className="mx-6 flex items-center gap-5 rounded-2xl bg-blue-600 px-6 py-5"
        style={{
          opacity: phase >= 6 ? 1 : 0,
          transform: phase >= 6 ? "none" : "translateY(10px)",
          transition: "opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s, box-shadow 0.9s ease 0.4s",
          boxShadow: phase >= 6
            ? "0 0 40px rgba(37,99,235,0.38), 0 8px 24px rgba(37,99,235,0.22)"
            : "none",
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-blue-200">Result</p>
          <p className="mt-1 text-base font-extrabold text-white">Total Running Cost Per Km</p>
          <p className="mt-1 font-mono text-[11px] text-blue-300">
            = EMI + Mileage + AdBlue + Tyre + Maintenance + Compliance
          </p>
        </div>
        <div className="shrink-0 rounded-xl bg-white/15 px-6 py-3 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-200">Per Km</p>
          <p className="mt-0.5 text-xl font-extrabold tabular-nums text-white">₹ —</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calculation info modal
// ---------------------------------------------------------------------------

function CalcInfoModal({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const [tab, setTab] = useState<"flow" | "breakdown">("flow");
  const [replayKey, setReplayKey] = useState(0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-3xl max-h-[88vh] flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center gap-4 border-b border-gray-100 px-7 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Info className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">How is this calculated?</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              <span className="font-semibold text-gray-500">{mode} Mode</span> — cost breakdown per km
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex shrink-0 rounded-xl border border-gray-200 bg-gray-50 p-1">
            {(["flow", "breakdown"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  tab === t
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {t === "flow" ? "▶  Flow" : "≡  Details"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto">
          {tab === "flow" ? (
            <div className="pt-6">
              <CalcFlowVisualization replayKey={replayKey} />
              {/* Replay */}
              <div className="flex justify-center pb-7 pt-5">
                <button
                  type="button"
                  onClick={() => setReplayKey((k) => k + 1)}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2 text-xs font-semibold text-gray-500 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                >
                  ↺ &nbsp;Replay animation
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5 px-7 py-6">
              {(mode === "Basic" ? BASIC_MODE_SECTIONS : mode === "Advanced" ? ADVANCED_MODE_SECTIONS : MANUAL_MODE_SECTIONS).map((section) => {
                const c = COLOR_MAP[section.color];
                return (
                  <div key={section.title} className={`rounded-2xl border px-5 py-5 ${c.section}`}>
                    <p className="mb-4 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      {section.title}
                    </p>
                    <div className="flex flex-col gap-3.5">
                      {section.fields.map((field) => (
                        <div key={field.label} className="flex items-start gap-3.5">
                          <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            field.type === "fetched"
                              ? "bg-teal-100 text-teal-700"
                              : field.type === "calculated"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-500"
                          }`}>
                            {field.type === "fetched" ? "Fetched" : field.type === "calculated" ? "Auto" : "Manual"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800">{field.label}</p>
                            {(field.type === "calculated" || field.type === "fetched") && field.formula && (
                              <p className={`mt-1 font-mono text-[11px] ${field.type === "fetched" ? "text-teal-600" : "text-blue-600"}`}>= {field.formula}</p>
                            )}
                            {field.note && (
                              <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{field.note}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RunningCostCalculatorPage() {
  const [mode, setMode] = useState<Mode>(() => {
    const s = loadSaved();
    return (MODES as readonly string[]).includes(s.mode) ? (s.mode as Mode) : "Manual";
  });
  const [showCalcInfo, setShowCalcInfo] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const activeIndex = MODES.indexOf(mode);

  // Tyre Details state
  const [tyreTypes, setTyreTypes] = useState<string[]>([]);
  const [tyreCardOpen, setTyreCardOpen] = useState(false);

  // Truck Run Details state
  const [tyreLayouts, setTyreLayouts] = useState<string[]>([]);
  const [runCardOpen, setRunCardOpen] = useState(false);
  const [fuelCardOpen, setFuelCardOpen] = useState(false);

  // AdBlue Details state
  const [adblueManufacturers, setAdblueManufacturers] = useState<AdBlueManufacturer[]>([]);
  const [adblueCardOpen, setAdblueCardOpen] = useState(false);

  // Fleet trucks
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [trucksLoading, setTrucksLoading] = useState(true);
  const [truckSearch, setTruckSearch] = useState("");

  // EMI records — used by Basic mode to populate EMI fields automatically
  const [emiRecords, setEmiRecords] = useState<EmiRecord[]>([]);

  // Truck Run Config fetched from Admin → Truck Run Config (km/day per tyre layout).
  // Used in Basic mode as the kmPerDay divisor for emiPerKm auto-calc instead of the
  // manual Truck Run Details card (which is hidden in Basic mode).
  const [basicRunConfig, setBasicRunConfig] = useState<Record<string, string>>({});

  // Fuel base cost fetched from Maintenance → Fuel History → "Set Base Litre Cost".
  // Used in Basic mode instead of the manual Fuel Details card (which is hidden in Basic).
  const [basicFuelCost, setBasicFuelCost] = useState<string>("");

  // Base tyre cost per km fetched from Admin → Tyre Cost Config (keyed by tyre layout).
  // Used in Basic mode; "Tyre Type" column is hidden and cost comes directly from this config.
  const [basicTyreCostMap, setBasicTyreCostMap] = useState<Record<string, string>>({});

  // Base maintenance cost per km fetched from Maintenance → Set Base Maintenance Cost.
  // Shared across all trucks in Basic mode (global config, not per-truck).
  const [basicMaintenanceCostPerKm, setBasicMaintenanceCostPerKm] = useState<string>("");

  // Advanced mode: per-truck mileage (L/km) derived from Fuel History lifetime average (km/L → inverted).
  const [advancedMileageMap, setAdvancedMileageMap] = useState<Record<string, string>>({});

  // Advanced mode: per-truck total tyre cost per km from Tyre Management → View Tyre Data.
  // Sum of (tyre.cost / rangeConfig[tyreType]) for all currently installed tyres on the truck.
  const [advancedTyreCostMap, setAdvancedTyreCostMap] = useState<Record<string, string>>({});

  // Advanced mode: per-truck maintenance cost per km from Truck Maintenance → Full Status → Cost / Km.
  // Formula: (12-month total maintenance cost) / 12 / 26 / kmPerDay
  const [advancedMaintenanceCostMap, setAdvancedMaintenanceCostMap] = useState<Record<string, string>>({});

  // Advanced mode: per-truck total compliance cost from Compliance & Renewals → View Cost Breakdown.
  // Sum of all 7 stored document expenses on the truck record (same as "Total Compliance Cost" in the dialog).
  const [advancedComplianceCostMap, setAdvancedComplianceCostMap] = useState<Record<string, string>>({});
  const [advancedCompliancePerKmMap, setAdvancedCompliancePerKmMap] = useState<Record<string, string>>({});

  // Compliance cost data fetched from Admin → Compliance Cost Config (per tyre layout).
  // totalCost = sum of all 7 doc costs/year; perKm = totalCost / 12 / 26 / kmPerDay.
  const [basicComplianceMap, setBasicComplianceMap] = useState<Record<string, { totalCost: string; perKm: string }>>({});

  // Per-mode isolated data — Manual / Basic / Advanced never share values
  const [allModeData, setAllModeData] = useState<Record<Mode, ModeData>>({
    Manual: emptyModeData(),
    Basic: emptyModeData(),
    Advanced: emptyModeData(),
  });
  const modeData = allModeData[mode];

  function patchModeData(patch: Partial<ModeData>) {
    setAllModeData((prev) => ({ ...prev, [mode]: { ...prev[mode], ...patch } }));
  }

  function updateTruckMetric(truckId: string, key: string, value: string) {
    setAllModeData((prev) => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        truckMetrics: { ...prev[mode].truckMetrics, [truckId]: { ...prev[mode].truckMetrics[truckId], [key]: value } },
      },
    }));
  }

  const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Read localStorage synchronously BEFORE the first await so the persist effect
    // (which fires with empty state on mount) cannot overwrite it first.
    const localSaved = loadSaved();

    async function fetchAll() {
      const [tyreResult, configResult, adblueResult, truckResult, backendResult, emiResult, fuelBaseResult, tyreCostResult, maintCostResult, complianceResult, allFuelStatsResult, tyreInventoryResult, tyreFitmentsResult, allMaintenanceResult, compliancePerKmResult] = await Promise.allSettled([
        tyreRangeConfigApi.list(),
        trucksApi.getRunConfig(),
        adblueApi.listManufacturers(),
        trucksApi.list(),
        runningCostApi.getState(),
        financeApi.listEmi(),
        fuelLogsApi.getBaseConfig(),
        trucksApi.getBaseTyreCost(),
        maintenanceTypesApi.getBaseConfig(),
        complianceCostApi.list(),
        fuelLogsApi.getAllFuelStats(),
        tyreApi.listInventory(),
        tyreApi.listFitments(undefined, true),
        maintenanceApi.getMaintenanceCostPerKm(),
        trucksApi.getCompliancePerKmAll(),
      ]);

      const backendData = backendResult.status === "fulfilled" ? backendResult.value : null;

      // localStorage is saved immediately on every keystroke; backend is debounced 1500ms.
      // Prefer localStorage when it has any entered data; fall back to backend for empty slots
      // (covers cross-device sync or cleared localStorage).
      function hasAnyData(slot: Partial<ModeData>): boolean {
        return !!(slot.costPerLitre) ||
          Object.values(slot.tyreEntries  ?? {}).some((e) => e.cost || e.range) ||
          Object.values(slot.runEntries   ?? {}).some((e) => e.month || e.day) ||
          Object.values(slot.adbluePrices ?? {}).some((p) => p) ||
          Object.values(slot.truckMetrics ?? {}).some((m) => Object.values(m).some((v) => v));
      }

      function pickSaved(local: Partial<ModeData>, remote: Partial<ModeData> | undefined): Partial<ModeData> {
        if (hasAnyData(local)) return local;
        if (remote && hasAnyData(remote)) return remote;
        return local;
      }

      const manualSaved = pickSaved(localSaved.Manual ?? {}, backendData?.Manual);
      const basicSaved  = pickSaved(localSaved.Basic  ?? {}, backendData?.Basic);
      const advSaved    = pickSaved(localSaved.Advanced ?? {}, backendData?.Advanced);

      if (localSaved.mode && (MODES as readonly string[]).includes(localSaved.mode)) {
        setMode(localSaved.mode as Mode);
      }

      const types: string[] = tyreResult.status === "fulfilled"
        ? tyreResult.value.map((r: any) => r.tyre_type)
        : [];
      if (types.length) setTyreTypes(types);

      let layouts: string[] = [];
      const runConfigMap: Record<string, string> = {};
      if (configResult.status === "fulfilled" && configResult.value.length > 0) {
        layouts = [...new Set(configResult.value.map((c: Record<string, any>) => c.tyre_layout as string).filter(Boolean))].sort();
        for (const c of configResult.value as Record<string, any>[]) {
          if (c.tyre_layout && c.km_per_day) {
            runConfigMap[c.tyre_layout] = String(parseFloat(c.km_per_day));
          }
        }
      } else if (truckResult.status === "fulfilled") {
        layouts = [...new Set(truckResult.value.map((t) => t.tyreLayout).filter(Boolean))].sort();
      }
      if (layouts.length) setTyreLayouts(layouts);
      setBasicRunConfig(runConfigMap);

      if (fuelBaseResult.status === "fulfilled" && fuelBaseResult.value.cost_per_litre != null) {
        setBasicFuelCost(String(fuelBaseResult.value.cost_per_litre));
      }

      if (tyreCostResult.status === "fulfilled") {
        const tyreCostMap: Record<string, string> = {};
        for (const r of tyreCostResult.value) {
          if (r.tyre_layout && r.cost) tyreCostMap[r.tyre_layout] = r.cost;
        }
        setBasicTyreCostMap(tyreCostMap);
      }

      if (maintCostResult.status === "fulfilled" && maintCostResult.value.cost_per_km != null) {
        setBasicMaintenanceCostPerKm(String(maintCostResult.value.cost_per_km));
      }

      if (complianceResult.status === "fulfilled") {
        const DOC_KEYS = ["rc_cost", "fc_cost", "road_tax_cost", "national_permit_cost", "local_permit_cost", "pollution_cert_cost", "insurance_cost"] as const;
        const compMap: Record<string, { totalCost: string; perKm: string }> = {};
        for (const r of complianceResult.value) {
          const total = DOC_KEYS.reduce((sum, k) => sum + (parseFloat(((r as unknown) as Record<string, string>)[k] || "0") || 0), 0);
          const kpd = parseFloat(runConfigMap[r.tyre_layout] ?? "");
          const perKm = total > 0 && kpd > 0 ? total / 12 / 26 / kpd : 0;
          compMap[r.tyre_layout] = {
            totalCost: total > 0 ? String(total) : "",
            perKm: perKm > 0 ? String(perKm) : "",
          };
        }
        setBasicComplianceMap(compMap);
      }

      // Advanced mode mileage: backend returns km/L keyed by truck ID (string).
      // Convert to L/km (inverted) for the Mileage (L/KM) field.
      if (allFuelStatsResult.status === "fulfilled") {
        const mileageMap: Record<string, string> = {};
        for (const [tid, kmPerL] of Object.entries(allFuelStatsResult.value)) {
          if (kmPerL > 0) mileageMap[tid] = kmPerL.toFixed(4);
        }
        setAdvancedMileageMap(mileageMap);
      }

      const manufacturers: AdBlueManufacturer[] = adblueResult.status === "fulfilled" ? adblueResult.value : [];
      if (manufacturers.length) setAdblueManufacturers(manufacturers);

      const truckList: Truck[] = truckResult.status === "fulfilled" ? truckResult.value : [];
      if (truckList.length) setTrucks(truckList);
      else if (truckResult.status === "rejected") console.error("Failed to load trucks:", truckResult.reason);

      // Advanced mode: compute total tyre cost per km per truck (mirrors ViewTyreDataDialog logic).
      // Formula: sum of (tyre.cost / rangeConfig[tyreType]) for all currently installed tyres.
      if (
        tyreInventoryResult.status === "fulfilled" &&
        tyreFitmentsResult.status === "fulfilled" &&
        tyreResult.status === "fulfilled"
      ) {
        const inventory = tyreInventoryResult.value;
        const fitments  = tyreFitmentsResult.value;
        const rangeMap: Record<string, number | null> = {};
        for (const r of tyreResult.value) {
          rangeMap[(r.tyre_type ?? "").toUpperCase()] = r.range_km ?? null;
        }
        const tCostMap: Record<string, string> = {};
        for (const truck of truckList) {
          const layout    = getTyreLayout(truck.tyreLayout);
          const positions = layout ? getTyrePositions(layout) : [];
          let total = 0;
          let hasData = false;
          for (const pos of positions) {
            const fitment = getFitmentForPosition(truck.id, pos, fitments);
            if (!fitment) continue;
            const tyre = inventory.find((t) => t.id === fitment.tyreId);
            if (!tyre) continue;
            const range = rangeMap[(tyre.tyreType ?? "").toUpperCase()] ?? null;
            const cost  = Number(tyre.cost);
            if (cost > 0 && range && range > 0) {
              total += cost / range;
              hasData = true;
            }
          }
          if (hasData && total > 0) tCostMap[truck.id] = total.toFixed(6);
        }
        setAdvancedTyreCostMap(tCostMap);
      }

      // Advanced mode: maintenance cost per km fetched directly from backend.
      // Backend computes: (12-month total) / 12 / 26 / km_per_day — same as TruckStatusDialog Cost/Km.
      if (allMaintenanceResult.status === "fulfilled") {
        const maintCostMap: Record<string, string> = {};
        for (const [truckId, costPerKm] of Object.entries(allMaintenanceResult.value)) {
          if (costPerKm > 0) maintCostMap[truckId] = costPerKm.toFixed(6);
        }
        setAdvancedMaintenanceCostMap(maintCostMap);
      }

      // Advanced mode: total compliance cost per truck — sum of all 7 document expense fields.
      // Matches exactly "Total Compliance Cost" shown in Compliance & Renewals → View Cost Breakdown.
      {
        const compCostMap: Record<string, string> = {};
        const EXPENSE_KEYS = [
          "rcExpenses", "fcExpenses", "roadTaxExpenses",
          "nationalPermitExpenses", "localPermitExpenses",
          "pollutionCertificateExpenses", "insuranceExpenses",
        ] as const;
        for (const truck of truckList) {
          const total = EXPENSE_KEYS.reduce(
            (sum, k) => sum + (parseFloat((truck as unknown as Record<string, string>)[k] || "0") || 0),
            0
          );
          if (total > 0) compCostMap[truck.id] = total.toFixed(2);
        }
        setAdvancedComplianceCostMap(compCostMap);
      }

      // Advanced mode: compliance cost per km from /trucks/compliance-per-km/all
      // Mirrors "Per KM" in Compliance & Renewals → View Cost Breakdown footer.
      if (compliancePerKmResult.status === "fulfilled") {
        const perKmMap: Record<string, string> = {};
        for (const [truckId, perKm] of Object.entries(compliancePerKmResult.value)) {
          if (perKm > 0) perKmMap[truckId] = perKm.toFixed(6);
        }
        setAdvancedCompliancePerKmMap(perKmMap);
      }

      // Build isolated ModeData for a given saved slot
      function buildModeData(saved: Partial<ModeData>): ModeData {
        const emptyMetrics = Object.fromEntries(
          TRUCK_METRICS.filter((m) => !m.calculated).map(({ key }) => [key, ""])
        );
        return {
          costPerLitre: saved.costPerLitre ?? "",
          tyreEntries: Object.fromEntries(types.map((t) => [t, saved.tyreEntries?.[t] ?? { cost: "", range: "" }])),
          runEntries: Object.fromEntries(layouts.map((l) => [l, saved.runEntries?.[l] ?? { month: "", day: "" }])),
          adbluePrices: Object.fromEntries(manufacturers.map((m) => [String(m.id), saved.adbluePrices?.[String(m.id)] ?? ""])),
          truckMetrics: Object.fromEntries(truckList.map((t) => {
            const savedM = saved.truckMetrics?.[t.id] ?? {};
            const lkm = savedM.adblueConsumeLKm ?? "";
            const l1000 = lkm && !savedM.adblueConsumeL1000
              ? String(+(parseFloat(lkm) * 1000).toFixed(4))
              : (savedM.adblueConsumeL1000 ?? "");
            return [t.id, { ...emptyMetrics, ...savedM, adblueConsumeL1000: l1000 }];
          })),
        };
      }

      if (emiResult.status === "fulfilled") setEmiRecords(emiResult.value);

      initializedRef.current = true;
      setAllModeData({
        Manual:   buildModeData(manualSaved),
        Basic:    buildModeData(basicSaved),
        Advanced: buildModeData(advSaved),
      });

      setTrucksLoading(false);
    }

    fetchAll();
  }, []);

  // Persist per-mode data to localStorage immediately; debounce backend save (all modes).
  // Guard via ref (not state) so dep array size stays constant: skip until fetchAll sets the flag.
  useEffect(() => {
    if (!initializedRef.current) return;
    persistState(mode, allModeData);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      runningCostApi.saveState(allModeData as unknown as import("@/lib/api").RccState).catch(() => {});
    }, 1500);
  }, [mode, allModeData]);

  function updateRunMonth(layout: string, value: string) {
    const day = value ? String(+(parseFloat(value) / 26).toFixed(2)) : "";
    setAllModeData((prev) => ({ ...prev, [mode]: { ...prev[mode], runEntries: { ...prev[mode].runEntries, [layout]: { month: value, day } } } }));
  }

  function updateRunDay(layout: string, value: string) {
    const month = value ? String(+(parseFloat(value) * 26).toFixed(2)) : "";
    setAllModeData((prev) => ({ ...prev, [mode]: { ...prev[mode], runEntries: { ...prev[mode].runEntries, [layout]: { month, day: value } } } }));
  }

  function updateEntry(tyreType: string, field: keyof TyreEntry, value: string) {
    setAllModeData((prev) => ({
      ...prev,
      [mode]: { ...prev[mode], tyreEntries: { ...prev[mode].tyreEntries, [tyreType]: { ...prev[mode].tyreEntries[tyreType], [field]: value } } },
    }));
  }

  function getCostPerKm(entry: TyreEntry): string | null {
    const cost = parseFloat(entry.cost);
    const range = parseFloat(entry.range);
    if (!cost || !range || range <= 0) return null;
    return (cost / range).toFixed(4);
  }

  // Build per-truck AdBlue data for Basic and Advanced modes.
  // Matches truck.manufacturer to the AdBlue manufacturer name to get ID and default price.
  const adblueByTruck = new Map<string, BasicAdblue>();
  if (mode === "Basic" || mode === "Advanced") {
    for (const truck of trucks) {
      const mfr = adblueManufacturers.find(
        (m) => m.name.trim().toLowerCase() === (truck.manufacturer ?? "").trim().toLowerCase()
      );
      const lPerKm = truck.adblueConsumption ?? "";
      const manufacturerId = mfr ? String(mfr.id) : "";
      const lPerKmNum = parseFloat(lPerKm);
      const priceNum = mfr ? parseFloat(mfr.defaultPricePerLitre) : 0;
      const costPerKm = lPerKmNum > 0 && priceNum > 0
        ? (lPerKmNum * priceNum).toFixed(6)
        : "";
      if (lPerKm || manufacturerId) {
        adblueByTruck.set(truck.id, { lPerKm, manufacturerId, costPerKm });
      }
    }
  }

  // Build per-truck EMI aggregate for Basic mode.
  // A truck can have multiple loans — sum emiAmount, dailyFinanceCost, and emiCostPerKm.
  const emiByTruck = new Map<string, BasicEmi>();
  if (mode === "Basic" || mode === "Advanced") {
    for (const rec of emiRecords) {
      if (!rec.truckRegistration) continue;
      const prev = emiByTruck.get(rec.truckRegistration);
      const amount  = parseFloat(rec.emiAmount)       || 0;
      const perDay  = parseFloat(rec.dailyFinanceCost) || 0;
      const perKm   = parseFloat(rec.emiCostPerKm)    || 0;
      emiByTruck.set(rec.truckRegistration, {
        emiAmount: String(((parseFloat(prev?.emiAmount ?? "0") || 0) + amount).toFixed(2)),
        emiPerDay: String(((parseFloat(prev?.emiPerDay ?? "0") || 0) + perDay).toFixed(2)),
        emiPerKm:  String(((parseFloat(prev?.emiPerKm  ?? "0") || 0) + perKm).toFixed(4)),
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {showCalcInfo && <CalcInfoModal mode={mode} onClose={() => setShowCalcInfo(false)} />}
      {showGuide && <UsageGuideModal mode={mode} onClose={() => setShowGuide(false)} />}

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Running Cost Calculator</h1>
          <p className="mt-1 text-sm text-gray-500">
            Calculate and analyse the per-kilometre running cost for your fleet.
          </p>
        </div>

        <div className="mt-1 flex shrink-0 items-center gap-2">
          {/* Truck search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search reg. no."
              value={truckSearch}
              onChange={(e) => setTruckSearch(e.target.value)}
              className="w-40 rounded-xl border border-gray-200 bg-white py-1.5 pl-8 pr-7 text-xs text-gray-800 shadow-sm outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
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

          {/* Mode segmented control */}
          <div
            className="relative flex rounded-xl border p-1"
            style={{
              backgroundColor: isDark ? "#141929" : "#f3f4f6",
              borderColor:     isDark ? "#2d3660" : "#e5e7eb",
            }}
          >
            <span
              className="absolute top-1 bottom-1 rounded-lg transition-all duration-300 ease-in-out"
              style={{
                backgroundColor: isDark ? "#2d3660" : "#ffffff",
                boxShadow: isDark ? "none" : "0 1px 3px rgba(0,0,0,0.1)",
                width: `calc((100% - 8px) / 3)`,
                left:  `calc(4px + ${activeIndex} * (100% - 8px) / 3)`,
              }}
            />
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="relative z-10 w-24 rounded-lg py-1.5 text-xs font-semibold transition-colors duration-200"
                style={{
                  color: mode === m
                    ? (isDark ? "#edf3fb" : "#111827")
                    : (isDark ? "#7d92b0" : "#6b7280"),
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mode banner + info button */}
      <div className="flex items-center gap-3">
        <div className={`flex flex-1 items-center gap-3 rounded-xl border px-5 py-3 transition-colors duration-300 ${MODE_STYLE[mode].banner}`}>
          <span className={`h-2 w-2 rounded-full ${MODE_STYLE[mode].dot}`} />
          <p className={`text-sm font-medium ${MODE_STYLE[mode].text}`}>
            Currently in <span className="font-bold">{mode} Mode</span> for Calculation
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Quick Start Guide
        </button>
        <button
          type="button"
          onClick={() => setShowCalcInfo(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-semibold text-gray-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          <Info className="h-3.5 w-3.5" />
          How is this calculated?
        </button>
      </div>

      {/* ── Main layout — all three modes ── */}
      {(mode === "Manual" || mode === "Basic" || mode === "Advanced") && (
        <div className="grid grid-cols-4 gap-6 items-start">

          {/* Left — 75% (3 cols): per-truck cost cards */}
          <div className="col-span-3 flex flex-col gap-4">
            {(() => {
              const filtered = trucks.filter((t) =>
                t.registrationNumber.toLowerCase().includes(truckSearch.toLowerCase())
              );
              if (trucksLoading) {
                return [1, 2, 3].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-2xl border border-gray-200 bg-gray-100" />
                ));
              }
              if (trucks.length === 0) {
                return (
                  <div className="flex items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-sm text-gray-400">
                    No trucks found in fleet.
                  </div>
                );
              }
              if (filtered.length === 0) {
                return (
                  <div className="flex items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white py-10 text-sm text-gray-400">
                    No trucks match &quot;{truckSearch}&quot;.
                  </div>
                );
              }
              return filtered.map((truck) => (
                <TruckCostCard
                  key={truck.id}
                  truck={truck}
                  metrics={modeData.truckMetrics[truck.id] ?? {}}
                  onMetricChange={(key, value) => updateTruckMetric(truck.id, key, value)}
                  costPerLitre={(mode === "Basic" || mode === "Advanced") ? basicFuelCost : modeData.costPerLitre}
                  kmPerDay={mode === "Basic"
                    ? (basicRunConfig[truck.tyreLayout] ?? "")
                    : (modeData.runEntries[truck.tyreLayout]?.day ?? "")}
                  tyreTypes={tyreTypes}
                  tyreEntries={modeData.tyreEntries}
                  adblueManufacturers={adblueManufacturers}
                  adbluePrices={modeData.adbluePrices}
                  basicEmi={mode === "Basic" ? (emiByTruck.get(truck.registrationNumber) ?? null) : undefined}
                  advancedEmi={mode === "Advanced" ? (emiByTruck.get(truck.registrationNumber) ?? null) : undefined}
                  advancedMileage={mode === "Advanced" ? (advancedMileageMap[truck.id] ?? null) : undefined}
                  basicAdblue={mode === "Basic" ? (adblueByTruck.get(truck.id) ?? null) : undefined}
                  advancedAdblue={mode === "Advanced" ? (adblueByTruck.get(truck.id) ?? null) : undefined}
                  basicTyrePerKm={mode === "Basic" ? (basicTyreCostMap[truck.tyreLayout] ?? "") : undefined}
                  advancedTyrePerKm={mode === "Advanced" ? (advancedTyreCostMap[truck.id] ?? null) : undefined}
                  basicMaintenancePerKm={mode === "Basic" ? basicMaintenanceCostPerKm : undefined}
                  advancedMaintenancePerKm={mode === "Advanced" ? (advancedMaintenanceCostMap[truck.id] ?? null) : undefined}
                  advancedComplianceCost={mode === "Advanced" ? (advancedComplianceCostMap[truck.id] ?? null) : undefined}
                  advancedCompliancePerKm={mode === "Advanced" ? (advancedCompliancePerKmMap[truck.id] ?? null) : undefined}
                  basicCompliance={mode === "Basic" ? (basicComplianceMap[truck.tyreLayout] ?? undefined) : undefined}
                  mode={mode}
                />
              ));
            })()}
          </div>

          {/* Right — 25% (1 col): input cards */}
          <div className="col-span-1 flex flex-col gap-4">

            {/* Tyre Details card — Manual only */}
            {mode === "Manual" && <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              {/* Card header */}
              <button
                type="button"
                onClick={() => setTyreCardOpen((o) => !o)}
                className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${tyreCardOpen ? "border-b border-gray-100" : ""}`}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <CircleDot className="h-4 w-4" />
                </div>
                <h2 className="flex-1 text-sm font-bold text-gray-800">Tyre Details</h2>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${tyreCardOpen ? "rotate-180" : "rotate-0"}`}
                />
              </button>

              {/* Tyre rows */}
              <div className={`flex flex-col divide-y divide-gray-100 overflow-hidden transition-all duration-300 ${tyreCardOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
                {tyreTypes.length === 0 && (
                  <p className="px-4 py-6 text-center text-xs text-gray-400">
                    No tyre types configured.
                  </p>
                )}
                {tyreTypes.map((tyreType) => {
                  const entry = modeData.tyreEntries[tyreType] ?? { cost: "", range: "" };
                  const costPerKm = getCostPerKm(entry);
                  return (
                    <div key={tyreType} className="flex flex-col gap-3 px-4 py-4">
                      {/* Tyre type label */}
                      <div className="flex items-center gap-2">
                        <CircleDot className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                          {tyreType}
                        </span>
                      </div>

                      {/* Tyre Cost */}
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Tyre Cost (₹)
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 18500"
                          value={entry.cost}
                          onChange={(e) => updateEntry(tyreType, "cost", e.target.value)}
                          className={inputClass}
                        />
                      </div>

                      {/* Expected Range */}
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Expected Range (km)
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 80000"
                          value={entry.range}
                          onChange={(e) => updateEntry(tyreType, "range", e.target.value)}
                          className={inputClass}
                        />
                      </div>

                      {/* Cost per Km — calculated */}
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Cost per Km
                        </label>
                        <div className={`flex items-center rounded-lg border px-3 py-2 text-sm font-bold tabular-nums ${
                          costPerKm
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-gray-100 bg-gray-50 text-gray-400"
                        }`}>
                          {costPerKm ? `₹ ${costPerKm}` : "—"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>}

            {/* Truck Run Details card — Manual only */}
            {mode === "Manual" && <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setRunCardOpen((o) => !o)}
                className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${runCardOpen ? "border-b border-gray-100" : ""}`}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <Gauge className="h-4 w-4" />
                </div>
                <h2 className="flex-1 text-sm font-bold text-gray-800">Truck Run Details</h2>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${runCardOpen ? "rotate-180" : "rotate-0"}`}
                />
              </button>

              <div className={`flex flex-col divide-y divide-gray-100 overflow-hidden transition-all duration-300 ${runCardOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
                {tyreLayouts.length === 0 && (
                  <p className="px-4 py-6 text-center text-xs text-gray-400">
                    No tyre layouts found in fleet.
                  </p>
                )}
                {tyreLayouts.map((layout) => {
                  const entry = modeData.runEntries[layout] ?? { month: "", day: "" };
                  return (
                    <div key={layout} className="flex flex-col gap-3 px-4 py-4">
                      {/* Layout label */}
                      <div className="flex items-center gap-2">
                        <Gauge className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                          {layout}
                        </span>
                      </div>

                      {/* Km / Month */}
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Expected Km / Month
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 7800"
                          value={entry.month}
                          onChange={(e) => updateRunMonth(layout, e.target.value)}
                          className={inputClass}
                        />
                      </div>

                      {/* Km / Day */}
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Expected Km / Day
                          <span className="ml-1 normal-case tracking-normal text-gray-300">(÷ 26)</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 300"
                          value={entry.day}
                          onChange={(e) => updateRunDay(layout, e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>}

            {/* Fuel Details card — Manual only; Basic and Advanced auto-fetch or handle differently */}
            {mode === "Manual" && <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setFuelCardOpen((o) => !o)}
                className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${fuelCardOpen ? "border-b border-gray-100" : ""}`}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Fuel className="h-4 w-4" />
                </div>
                <h2 className="flex-1 text-sm font-bold text-gray-800">Fuel Details</h2>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${fuelCardOpen ? "rotate-180" : "rotate-0"}`}
                />
              </button>

              <div className={`overflow-hidden transition-all duration-300 ${fuelCardOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="px-4 py-4">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Cost Per Litre (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="e.g. 97.3"
                    value={modeData.costPerLitre}
                    onChange={(e) => patchModeData({ costPerLitre: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>}

            {/* AdBlue Details card — Manual only */}
            {mode === "Manual" && <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setAdblueCardOpen((o) => !o)}
                className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${adblueCardOpen ? "border-b border-gray-100" : ""}`}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
                  <Droplets className="h-4 w-4" />
                </div>
                <h2 className="flex-1 text-sm font-bold text-gray-800">AdBlue Details</h2>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${adblueCardOpen ? "rotate-180" : "rotate-0"}`}
                />
              </button>

              <div className={`flex flex-col divide-y divide-gray-100 overflow-hidden transition-all duration-300 ${adblueCardOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
                {adblueManufacturers.length === 0 && (
                  <p className="px-4 py-6 text-center text-xs text-gray-400">
                    No AdBlue manufacturers configured.
                  </p>
                )}
                {adblueManufacturers.map((m) => (
                  <div key={m.id} className="flex flex-col gap-3 px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Droplets className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                        {m.name}
                      </span>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                        AdBlue Price (Per Litre) (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="e.g. 35.0"
                        value={modeData.adbluePrices[m.id] ?? ""}
                        onChange={(e) =>
                          setAllModeData((prev) => ({ ...prev, [mode]: { ...prev[mode], adbluePrices: { ...prev[mode].adbluePrices, [m.id]: e.target.value } } }))
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>}

          </div>
        </div>
      )}
    </div>
  );
}
