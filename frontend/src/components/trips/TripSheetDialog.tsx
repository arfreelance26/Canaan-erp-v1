"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { type TripSheetData, n, calcTripExpenses, calcDriverExpenses } from "@/types/trip-sheet";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";

const sh = "text-xs font-semibold uppercase tracking-wider text-blue-900 bg-blue-50 px-3 py-2 rounded-lg";
const subsh = "text-xs font-medium text-gray-400 uppercase tracking-wider mt-3 mb-1";

const emptySheet = (tripId: string): TripSheetData => ({
  tripId,
  tripSheetNo: "",
  bookingReferenceNo: "",
  containerNumber: "",
  containerType: "",
  line: "",
  tripType: "",
  vehicleId: "",
  driverId: "",
  bookingDate: "",
  tripScheduledDate: "",
  tripCompletedDate: "",
  tripClosedDate: "",
  tripSheetDate: "",
  from: "",
  to: "",
  clearingAgent: "",
  hireAmount: "",
  startKm: "", endKm: "", totalKm: "", cargoWeight: "", grossWeight: "", tareWeight: "", netWeight: "",
  driverPay: "",
  driverAdvanceAmount: "",
  driverBalance: "",
  totalHaltDays: "", haltRemarks: "", haltPay: "",
  portPassExpense: "", weightSheetExpense: "", mamolExpense: "", claimableMamolExpense: "",
  trafficRtoExpense: "",
  liftOnOffExpense: "", craneOperatorExpense: "",
  parkingExpense: "", punctureExpense: "", sparePartsExpense: "",
  majorRepairs: [],
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
  // Tracks which session has been initialized to prevent auto-refresh from resetting the form
  const initKeyRef = useRef<string>("");

  useEffect(() => {
    if (!open || !trip) {
      initKeyRef.current = "";
      return;
    }

    // Key uniquely identifies this dialog session: same trip + same sheet = same session
    const key = `${trip.id}::${existingSheet?.tripSheetNo ?? "new"}`;
    if (initKeyRef.current === key) return;
    initKeyRef.current = key;

    if (existingSheet) {
      setForm({ ...existingSheet });
    } else {
      const sheet = emptySheet(trip.id);
      sheet.bookingReferenceNo  = trip.bookingReferenceNo ?? "";
      sheet.containerNumber     = trip.containerNumber ?? "";
      sheet.containerType       = trip.containerSpecification ?? "";
      sheet.line                = trip.shippingLine ?? "";
      sheet.tripType            = trip.tripCategory ?? "";
      sheet.vehicleId           = trip.vehicleId ?? "";
      sheet.driverId            = trip.driverId ?? "";
      sheet.bookingDate         = trip.bookingCreatedDate ?? "";
      sheet.tripScheduledDate   = trip.scheduledDate ?? "";
      sheet.from                = trip.origin ?? "";
      sheet.to                  = trip.destination ?? "";
      sheet.hireAmount          = trip.transportHireAmount ?? "";
      sheet.driverPay           = trip.driverAdvanceAmount ?? "";
      sheet.driverAdvanceAmount = trip.driverAdvance ?? "";
      if (closure) {
        sheet.tripCompletedDate = closure.tripCompletedDate ?? "";
      }
      setForm(sheet);
    }
  }, [open, trip, existingSheet, closure]);

  function set<K extends keyof TripSheetData>(key: K, value: TripSheetData[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      // Auto-calc total km
      const startKm = n(next.startKm);
      const endKm   = n(next.endKm);
      next.totalKm  = startKm > 0 && endKm > startKm ? String(endKm - startKm) : "";

      // Auto-calc driver balance
      next.driverBalance = String((n(next.driverPay) - n(next.driverAdvanceAmount)).toFixed(2));

      // Auto-calc driver expenses (what driver paid out of pocket)
      next.driverExpensesTotal = String(calcDriverExpenses(next).toFixed(2));

      // Auto-calc trip expenses: driverPay + haltPay (from closure) + operational + toll
      const tripExp = calcTripExpenses(next) + haltPay;
      next.tripExpensesTotal = String(tripExp.toFixed(2));

      // Total expense = trip expenses + major repairs (tracked separately from trip expenses)
      const majorTotal = (next.majorRepairs || []).reduce((sum, r) => sum + n(r.cost), 0);
      next.totalExpense = String((tripExp + majorTotal).toFixed(2));

      return next;
    });
  }

  // Halt values — read directly from stored closure (set when trip was closed)
  const haltTotalDays = closure
    ? Number(closure.companyHaltDays || 0) + Number(closure.partyHaltDays || 0)
    : 0;
  const haltPay     = closure ? Number(closure.driverHaltCompensation || 0) : 0;
  const haltRemarks = closure?.haltRemarks ?? "";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      ...form,
      tripClosedDate: closure?.closedAt ?? "",
      totalHaltDays:  haltTotalDays > 0 ? String(haltTotalDays) : "",
      haltPay:        haltPay > 0       ? String(haltPay)       : "",
      haltRemarks,
    });
  }

  if (!trip) return null;

  const ro = readOnly;
  const fc = ro ? `${inputClass} bg-gray-50 cursor-default` : inputClass;
  const roClass = `w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-not-allowed`;
  const fmt = (v: string) => v ? `₹${n(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "₹0.00";

  return (
    <Dialog open={open} onClose={onClose} title={ro ? `View Trip Sheet — ${trip.tripId}` : `Trip Sheet — ${trip.tripId}`} className="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* ── 1. Trip Information ── */}
        <p className={sh}>Trip Information</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Trip Sheet No *">
            <input className={fc} value={form.tripSheetNo} readOnly={ro} onChange={(e) => set("tripSheetNo", e.target.value)} placeholder="e.g. TS-2026-001" />
          </Field>
          <Field label="Booking Reference Number">
            <input className={roClass} value={form.bookingReferenceNo} readOnly disabled />
          </Field>
          <Field label="Container Number">
            <input className={roClass} value={form.containerNumber} readOnly disabled />
          </Field>
          <Field label="Container Specification">
            <input className={roClass} value={form.containerType} readOnly disabled />
          </Field>
          <Field label="Shipping Line">
            <input className={roClass} value={form.line} readOnly disabled />
          </Field>
          <Field label="Trip Category">
            <input className={roClass} value={form.tripType} readOnly disabled />
          </Field>
          <Field label="Assigned Vehicle">
            <input className={roClass} value={form.vehicleId} readOnly disabled />
          </Field>
          <Field label="Assigned Driver">
            <input className={roClass} value={form.driverId} readOnly disabled />
          </Field>
          <Field label="Booking Date">
            <input className={roClass} value={form.bookingDate} readOnly disabled />
          </Field>
          <Field label="Trip Scheduled Date">
            <input className={roClass} value={form.tripScheduledDate} readOnly disabled />
          </Field>
          <Field label="Trip Completed Date">
            <input className={roClass} value={form.tripCompletedDate} readOnly disabled />
          </Field>
          <Field label="Trip Closed Date">
            <input className={roClass} value={closure?.closedAt ?? ""} readOnly disabled placeholder="Auto-fetched on close" />
          </Field>
          <Field label="Trip Sheet Date *">
            <input type="date" value={form.tripSheetDate} readOnly={ro} onChange={(e) => set("tripSheetDate", e.target.value)} className={fc} />
          </Field>
        </div>

        {/* ── 2. Route Information ── */}
        <p className={sh}>Route Information</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="From">
            <input className={roClass} value={form.from} readOnly disabled />
          </Field>
          <Field label="To">
            <input className={roClass} value={form.to} readOnly disabled />
          </Field>
          <Field label="Clearing Agent">
            <input className={fc} value={form.clearingAgent} readOnly={ro} onChange={(e) => set("clearingAgent", e.target.value)} placeholder="e.g. ABC Clearing" />
          </Field>
        </div>

        {/* ── 3. Hire ── */}
        <p className={sh}>Hire</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Hire Amount *">
            <input type="number" min="0" className={fc} value={form.hireAmount} readOnly={ro} onChange={(e) => set("hireAmount", e.target.value)} placeholder="e.g. 35000" />
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

        {/* ── 5. Driver Settlement ── */}
        <p className={sh}>Driver Settlement</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Driver Batta Amount">
            <input type="number" className={roClass} value={form.driverPay} readOnly disabled />
          </Field>
          <Field label="Advance Paid">
            <input type="number" min="0" className={fc} value={form.driverAdvanceAmount} readOnly={ro} onChange={(e) => set("driverAdvanceAmount", e.target.value)} placeholder="e.g. 2000" />
          </Field>
          <Field label="Driver Balance *">
            <input type="number" className={`${fc} bg-gray-50 font-semibold`} value={form.driverBalance} readOnly placeholder="Auto-calculated" />
          </Field>
        </div>

        {/* ── 6. Halt Information ── */}
        <p className={sh}>Halt Information</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Total Halt Days">
            <input className={roClass} value={haltTotalDays > 0 ? String(haltTotalDays) : ""} readOnly disabled placeholder="Auto-fetched" />
          </Field>
          <Field label="Halt Pay (₹)">
            <input className={roClass} value={haltPay > 0 ? String(haltPay) : ""} readOnly disabled placeholder="Auto-calculated" />
          </Field>
          <Field label="Halt Remarks">
            <input className={roClass} value={haltRemarks} readOnly disabled placeholder="Auto-fetched" />
          </Field>
        </div>

        {/* ── 7. Trip Expenses ── */}
        <p className={sh}>Trip Expenses</p>

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

        <p className={subsh}>Major Repairs</p>
        {form.majorRepairs.map((repair, idx) => (
          <div key={idx} className="flex gap-2 items-end">
            <div className="flex-1">
              <Field label={`Repair Name ${idx + 1}`}>
                <input
                  type="text"
                  className={fc}
                  value={repair.name}
                  readOnly={ro}
                  onChange={(e) => {
                    const updated = form.majorRepairs.map((r, i) => i === idx ? { ...r, name: e.target.value } : r);
                    set("majorRepairs", updated);
                  }}
                  placeholder="e.g. Engine overhaul"
                />
              </Field>
            </div>
            <div className="w-36">
              <Field label="Cost (₹)">
                <input
                  type="number"
                  min="0"
                  className={fc}
                  value={repair.cost}
                  readOnly={ro}
                  onChange={(e) => {
                    const updated = form.majorRepairs.map((r, i) => i === idx ? { ...r, cost: e.target.value } : r);
                    set("majorRepairs", updated);
                  }}
                  placeholder="e.g. 0"
                />
              </Field>
            </div>
            {!ro && (
              <button
                type="button"
                onClick={() => set("majorRepairs", form.majorRepairs.filter((_, i) => i !== idx))}
                className="mb-0.5 rounded-lg border border-red-200 px-2 py-2 text-xs text-red-500 hover:bg-red-50"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {!ro && (
          <button
            type="button"
            onClick={() => set("majorRepairs", [...form.majorRepairs, { name: "", cost: "" }])}
            className="self-start rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
          >
            + Add Repair
          </button>
        )}

        <p className={subsh}>Miscellaneous</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Other Expenses *">
            <input type="number" min="0" className={fc} value={form.otherExpenses} readOnly={ro} onChange={(e) => set("otherExpenses", e.target.value)} placeholder="e.g. 0" />
            <p className="mt-1 text-xs text-amber-600">Note: Please don&apos;t add maintenance charges here.</p>
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
