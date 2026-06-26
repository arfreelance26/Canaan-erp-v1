"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import { type TripSheetData, n, calcTripExpenses, calcDriverExpenses } from "@/types/trip-sheet";
import { initialDrivers } from "@/lib/driver-data";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { initialTrucks } from "@/lib/truck-data";

const sh = "text-xs font-semibold uppercase tracking-wider text-gray-500 pt-4 pb-1 border-b border-gray-100 mb-3";
const subsh = "text-xs font-medium text-gray-400 uppercase tracking-wider mt-3 mb-1";

const LINE_OPTIONS = ["COSCO", "MSC", "Maersk", "Evergreen", "ONE", "CMA CGM", "Yang Ming", "Hapag-Lloyd", "PIL", "ZIM", "Other"];
const TRIP_TYPE_OPTIONS = ["Import", "Export", "Empty", "Local Shifting", "CFS", "Coastal"];
const CONTAINER_TYPE_OPTIONS = ["20 FT", "40 FT", "2X20", "OPEN LOAD CARGO"];

const emptySheet = (tripId: string): TripSheetData => ({
  tripId,
  tripSheetNo: "", serialNo: "", containerNo: "", containerType: "", line: "", tripType: "", vehicleId: "", date: "", driverId: "",
  from: "", to: "",
  hireAmount: "", driverAdvance: "", driverAdvanceAdditional: "",
  startKm: "", endKm: "", totalKm: "", cargoWeight: "", grossWeight: "", tareWeight: "", netWeight: "",
  driverPay: "", driverSettlementAdvance: "", driverSettlementAdvanceAdditional: "", driverBalance: "",
  totalHaltDays: "", haltRemarks: "", haltPay: "",
  portPassExpense: "", weightSheetExpense: "", mamolExpense: "", claimableMamolExpense: "",
  trafficRtoExpense: "",
  liftOnOffExpense: "", craneOperatorExpense: "",
  parkingExpense: "", punctureExpense: "", sparePartsExpense: "",
  otherExpenses: "",
  tripExpensesTotal: "", driverExpensesTotal: "", totalExpense: "",
  tollCharges: "", tollCount: "0",
  remarks: "",
});

type Props = {
  open: boolean;
  trip: Trip | null;
  closure: TripClosureData | undefined;
  existingSheet?: TripSheetData;
  readOnly?: boolean;
  onClose: () => void;
  onSubmit: (data: TripSheetData) => void;
};

export function TripSheetDialog({ open, trip, closure, existingSheet, readOnly, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<TripSheetData>(emptySheet(""));

  useEffect(() => {
    if (open && trip) {
      setForm(existingSheet ? { ...existingSheet } : emptySheet(trip.id));
    }
  }, [open, trip, existingSheet]);

  function set<K extends keyof TripSheetData>(key: K, value: TripSheetData[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      // Auto-calcs
      const startKm = n(key === "startKm" ? (value as string) : next.startKm);
      const endKm   = n(key === "endKm"   ? (value as string) : next.endKm);
      next.totalKm  = endKm > startKm ? String(endKm - startKm) : next.totalKm;

      const dPay  = n(key === "driverPay"  ? (value as string) : next.driverPay);
      const dAdv  = n(key === "driverSettlementAdvance" ? (value as string) : next.driverSettlementAdvance);
      const dAddl = n(key === "driverSettlementAdvanceAdditional" ? (value as string) : next.driverSettlementAdvanceAdditional);
      next.driverBalance = String((dPay - dAdv - dAddl).toFixed(2));

      const tripExp   = calcTripExpenses(next);
      const driverExp = calcDriverExpenses(next);
      next.tripExpensesTotal   = String(tripExp.toFixed(2));
      next.driverExpensesTotal = String(driverExp.toFixed(2));
      next.totalExpense        = String((tripExp + driverExp).toFixed(2));

      return next;
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  if (!trip) return null;

  const ro = readOnly;
  const fc = ro ? `${inputClass} bg-gray-50 cursor-default` : inputClass;
  const fmt = (v: string) => v ? `₹${n(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "₹0.00";

  const selectClass = `${fc} appearance-none`;

  return (
    <Dialog open={open} onClose={onClose} title={ro ? `View Trip Sheet — ${trip.tripId}` : `Trip Sheet — ${trip.tripId}`} className="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* ── 1. Trip Information ── */}
        <p className={sh}>Trip Information</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Trip Sheet No *">
            <input className={fc} value={form.tripSheetNo} readOnly={ro} onChange={(e) => set("tripSheetNo", e.target.value)} placeholder="e.g. TS-2026-001" />
          </Field>
          <Field label="Serial No *">
            <input className={fc} value={form.serialNo} readOnly={ro} onChange={(e) => set("serialNo", e.target.value)} placeholder="e.g. SN-001" />
          </Field>
          <Field label="Container No *">
            <input className={fc} value={form.containerNo} readOnly={ro} onChange={(e) => set("containerNo", e.target.value)} placeholder="e.g. MSCU1234567" />
          </Field>
          <Field label="Select Container Type *">
            <GlassSelect
              value={form.containerType}
              onChange={(val) => set("containerType", val)}
              disabled={ro}
              options={[
                { value: "", label: "— Select —" },
                ...CONTAINER_TYPE_OPTIONS.map(o => ({ value: o, label: o }))
              ]}
            />
          </Field>
          <Field label="Select Line *">
            <GlassSelect
              value={form.line}
              onChange={(val) => set("line", val)}
              disabled={ro}
              options={[
                { value: "", label: "— Select —" },
                ...LINE_OPTIONS.map(o => ({ value: o, label: o }))
              ]}
            />
          </Field>
          <Field label="Trip Type *">
            <GlassSelect
              value={form.tripType}
              onChange={(val) => set("tripType", val)}
              disabled={ro}
              options={[
                { value: "", label: "— Select —" },
                ...TRIP_TYPE_OPTIONS.map(o => ({ value: o, label: o }))
              ]}
            />
          </Field>
          <Field label="Select Vehicle *">
            <GlassSelect
              value={form.vehicleId}
              onChange={(val) => set("vehicleId", val)}
              disabled={ro}
              options={[
                { value: "", label: "— Select —" },
                ...initialTrucks.map(t => ({ value: t.id, label: t.registrationNumber }))
              ]}
            />
          </Field>
          <Field label="Date *">
            <input type="date" className={fc} value={form.date} readOnly={ro} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label="Driver *" className="sm:col-span-2">
            <GlassSelect
              value={form.driverId}
              onChange={(val) => set("driverId", val)}
              disabled={ro}
              options={[
                { value: "", label: "— Select —" },
                ...initialDrivers.map(d => ({ value: d.id, label: d.name }))
              ]}
            />
          </Field>
        </div>

        {/* ── 2. Route Information ── */}
        <p className={sh}>Route Information</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="From *">
            <input className={fc} value={form.from} readOnly={ro} onChange={(e) => set("from", e.target.value)} placeholder="e.g. Kochi" />
          </Field>
          <Field label="To *">
            <input className={fc} value={form.to} readOnly={ro} onChange={(e) => set("to", e.target.value)} placeholder="e.g. Coimbatore" />
          </Field>
        </div>

        {/* ── 3. Hire & Driver Advance ── */}
        <p className={sh}>Hire & Driver Advance</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Hire Amount *">
            <input type="number" min="0" className={fc} value={form.hireAmount} readOnly={ro} onChange={(e) => set("hireAmount", e.target.value)} placeholder="e.g. 35000" />
          </Field>
          <Field label="Driver Advance *">
            <input type="number" min="0" className={fc} value={form.driverAdvance} readOnly={ro} onChange={(e) => set("driverAdvance", e.target.value)} placeholder="e.g. 5000" />
          </Field>
          <Field label="Driver Advance (additional) *">
            <input type="number" min="0" className={fc} value={form.driverAdvanceAdditional} readOnly={ro} onChange={(e) => set("driverAdvanceAdditional", e.target.value)} placeholder="e.g. 0" />
          </Field>
        </div>

        {/* ── 4. Trip Distance & Cargo ── */}
        <p className={sh}>Trip Distance & Cargo</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start km *">
            <input type="number" min="0" className={fc} value={form.startKm} readOnly={ro} onChange={(e) => set("startKm", e.target.value)} placeholder="e.g. 84000" />
          </Field>
          <Field label="End km *">
            <input type="number" min="0" className={fc} value={form.endKm} readOnly={ro} onChange={(e) => set("endKm", e.target.value)} placeholder="e.g. 84500" />
          </Field>
          <Field label="Total km *">
            <input type="number" className={`${fc} bg-gray-50`} value={form.totalKm} readOnly placeholder="Auto-calculated" />
          </Field>
          <Field label="Cargo Weight (tons)">
            <input type="number" min="0" className={fc} value={form.cargoWeight} readOnly={ro} onChange={(e) => set("cargoWeight", e.target.value)} placeholder="e.g. 22" />
          </Field>
          <Field label="Gross Weight (kg)">
            <input type="number" min="0" className={fc} value={form.grossWeight} readOnly={ro} onChange={(e) => set("grossWeight", e.target.value)} placeholder="e.g. 38000" />
          </Field>
          <Field label="Tare Weight (kg)">
            <input type="number" min="0" className={fc} value={form.tareWeight} readOnly={ro} onChange={(e) => set("tareWeight", e.target.value)} placeholder="e.g. 16000" />
          </Field>
          <Field label="Net Weight (kg)">
            <input type="number" min="0" className={fc} value={form.netWeight} readOnly={ro} onChange={(e) => set("netWeight", e.target.value)} placeholder="e.g. 22000" />
          </Field>
        </div>

        {/* ── 6. Driver Settlement ── */}
        <p className={sh}>Driver Settlement</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Driver Pay *">
            <input type="number" min="0" className={fc} value={form.driverPay} readOnly={ro} onChange={(e) => set("driverPay", e.target.value)} placeholder="e.g. 8000" />
          </Field>
          <Field label="Driver Advance *">
            <input type="number" min="0" className={fc} value={form.driverSettlementAdvance} readOnly={ro} onChange={(e) => set("driverSettlementAdvance", e.target.value)} placeholder="e.g. 5000" />
          </Field>
          <Field label="Driver Advance (additional) *">
            <input type="number" min="0" className={fc} value={form.driverSettlementAdvanceAdditional} readOnly={ro} onChange={(e) => set("driverSettlementAdvanceAdditional", e.target.value)} placeholder="e.g. 0" />
          </Field>
          <Field label="Driver Balance *">
            <input type="number" className={`${fc} bg-gray-50 font-semibold`} value={form.driverBalance} readOnly placeholder="Auto-calculated" />
          </Field>
        </div>

        {/* ── 7. Trip Expenses ── */}
        <p className={sh}>Trip Expenses</p>

        <p className={subsh}>Stay & Driver</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Total Halt Days *">
            <input type="number" min="0" className={fc} value={form.totalHaltDays} readOnly={ro} onChange={(e) => set("totalHaltDays", e.target.value)} placeholder="e.g. 2" />
          </Field>
          <Field label="Halt Pay (₹) *">
            <input type="number" min="0" className={fc} value={form.haltPay} readOnly={ro} onChange={(e) => set("haltPay", e.target.value)} placeholder="e.g. 1000" />
          </Field>
          <Field label="Halt Remarks *">
            <input className={fc} value={form.haltRemarks} readOnly={ro} onChange={(e) => set("haltRemarks", e.target.value)} placeholder="e.g. Port delay" />
          </Field>
        </div>

        <p className={subsh}>Port & Operational Charges</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Port Pass Expense (பாஸ்) *">
            <input type="number" min="0" className={fc} value={form.portPassExpense} readOnly={ro} onChange={(e) => set("portPassExpense", e.target.value)} placeholder="e.g. 500" />
          </Field>
          <Field label="Weight Sheet Expense (எடை) *">
            <input type="number" min="0" className={fc} value={form.weightSheetExpense} readOnly={ro} onChange={(e) => set("weightSheetExpense", e.target.value)} placeholder="e.g. 200" />
          </Field>
          <Field label="Mamol Expense (இறக்கு / ஏற்று மாமூல்) *">
            <input type="number" min="0" className={fc} value={form.mamolExpense} readOnly={ro} onChange={(e) => set("mamolExpense", e.target.value)} placeholder="e.g. 300" />
          </Field>
          <Field label="Claimable Mamol Expense *">
            <input type="number" min="0" className={fc} value={form.claimableMamolExpense} readOnly={ro} onChange={(e) => set("claimableMamolExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
        </div>

        <p className={subsh}>Government & Compliance</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Traffic, RTO / Police Expense *">
            <input type="number" min="0" className={fc} value={form.trafficRtoExpense} readOnly={ro} onChange={(e) => set("trafficRtoExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
        </div>

        <p className={subsh}>Loading & Handling</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Lift On / Off (லிப்டான்) *">
            <input type="number" min="0" className={fc} value={form.liftOnOffExpense} readOnly={ro} onChange={(e) => set("liftOnOffExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
          <Field label="Crane Operator Expense *">
            <input type="number" min="0" className={fc} value={form.craneOperatorExpense} readOnly={ro} onChange={(e) => set("craneOperatorExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
        </div>

        <p className={subsh}>Vehicle Maintenance</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Parking Expenses *">
            <input type="number" min="0" className={fc} value={form.parkingExpense} readOnly={ro} onChange={(e) => set("parkingExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
          <Field label="Puncture Expense *">
            <input type="number" min="0" className={fc} value={form.punctureExpense} readOnly={ro} onChange={(e) => set("punctureExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
          <Field label="Spare Parts Expense *">
            <input type="number" min="0" className={fc} value={form.sparePartsExpense} readOnly={ro} onChange={(e) => set("sparePartsExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
        </div>

        <p className={subsh}>Miscellaneous</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Other Expenses *">
            <input type="number" min="0" className={fc} value={form.otherExpenses} readOnly={ro} onChange={(e) => set("otherExpenses", e.target.value)} placeholder="e.g. 0" />
          </Field>
        </div>

        {/* ── 8. Expense Summary ── */}
        <p className={sh}>Expense Summary</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Trip Expenses *">
            <input className={`${fc} bg-gray-50 font-semibold text-blue-700`} value={fmt(form.tripExpensesTotal)} readOnly placeholder="Auto-calculated" />
          </Field>
          <Field label="Driver Expenses *">
            <input className={`${fc} bg-gray-50 font-semibold text-gray-700`} value={fmt(form.driverExpensesTotal)} readOnly placeholder="Auto-calculated" />
          </Field>
          <Field label="Total Expense *">
            <input className={`${fc} bg-gray-50 font-bold text-emerald-700`} value={fmt(form.totalExpense)} readOnly placeholder="Auto-calculated" />
          </Field>
        </div>

        {/* ── 9. Toll Details ── */}
        <p className={sh}>Toll Details</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Toll Charges (டோல்) *">
            <input type="number" min="0" className={fc} value={form.tollCharges} readOnly={ro} onChange={(e) => set("tollCharges", e.target.value)} placeholder="e.g. 1200" />
          </Field>
          <Field label="Selected Toll Count">
            <input type="number" min="0" className={fc} value={form.tollCount} readOnly={ro} onChange={(e) => set("tollCount", e.target.value)} placeholder="e.g. 4" />
          </Field>
        </div>

        {/* ── 10. Remarks ── */}
        <p className={sh}>Remarks</p>
        <Field label="Remarks *">
          <textarea rows={3} className={fc} value={form.remarks} readOnly={ro}
            onChange={(e) => set("remarks", e.target.value)}
            placeholder="Any additional notes…" />
        </Field>

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            {ro ? "Close" : "Cancel"}
          </button>
          {!ro && (
            <button type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Save Trip Sheet
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
