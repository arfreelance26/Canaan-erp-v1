"use client";

import { useState, useEffect, useRef, useMemo, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { type TripSheetData, n, calcTripExpenses, calcDriverExpenses } from "@/types/trip-sheet";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { RepairType } from "@/types/repair-type";
import { repairTypesApi, fuelLogsApi, tripsApi } from "@/lib/api";
import { showError } from "@/lib/swal";
import { DecimalInput } from "@/components/ui/DecimalInput";

// Auto-fill rules: tripType → containerType → { type, amount }
const BATTA_RULES: Record<string, Record<string, { type: string; amount: string }>> = {
  "LOCAL":     { "20 FT CONTAINER":        { type: "FIXED", amount: "1000" },
                 "40 FT CONTAINER":         { type: "FIXED", amount: "1300" } },
  "LOCAL CFS": { "20 FT CONTAINER":        { type: "FIXED", amount: "1000" },
                 "2 X 20 FEET CONTAINERS": { type: "FIXED", amount: "1300" },
                 "40 FT CONTAINER":         { type: "FIXED", amount: "1000" } },
  "SHIFTING":  { "20 FT CONTAINER":        { type: "FIXED", amount: "300" },
                "40 FT CONTAINER":         { type: "FIXED", amount: "300" },
                "2 X 20 FEET CONTAINERS": { type: "FIXED", amount: "600" } },
};

const sh = "text-xs font-semibold uppercase tracking-wider text-blue-900 bg-blue-50 px-3 py-2 rounded-lg";
const subsh = "text-xs font-medium text-gray-400 uppercase tracking-wider mt-3 mb-1";

function recalcDerived(s: TripSheetData, haltPay: number): TripSheetData {
  const out = { ...s };
  const startKm = n(out.startKm);
  const endKm   = n(out.endKm);
  out.totalKm           = startKm > 0 && endKm > startKm ? String(endKm - startKm) : "";
  out.driverExpensesTotal = String(calcDriverExpenses(out).toFixed(2));
  out.driverBalance       = String((n(out.driverExpensesTotal) - n(out.driverAdvanceAmount)).toFixed(2));
  const tripExp           = calcTripExpenses(out) + haltPay;
  out.tripExpensesTotal   = String(tripExp.toFixed(2));
  out.totalExpense        = String(tripExp.toFixed(2));
  return out;
}

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
  startKm: "", endKm: "", totalKm: "", cargoWeight: "",
  driverCompensationType: "",
  driverPay: "",
  driverAdvanceAmount: "",
  driverBalance: "",
  totalHaltDays: "", haltRemarks: "", haltPay: "",
  portPassExpense: "", weightSheetExpense: "", mamolExpense: "", claimableMamolExpense: "",
  trafficRtoExpense: "",
  liftOnOffExpense: "", craneOperatorExpense: "", parkingExpense: "",
  majorRepairs: [],
  otherExpenses: "",
  tripExpensesTotal: "", driverExpensesTotal: "", totalExpense: "", fuelCostApprox: "",
  tollCharges: "",
  remarks: "",
});

type Props = {
  open: boolean;
  trip: Trip | null;
  closure: TripClosureData | undefined;
  existingSheet?: TripSheetData;
  readOnly?: boolean;
  /** Auto-fetched trip fields become editable (Admin, or approved TripData edit request) */
  autoEditable?: boolean;
  /** Called when a non-admin wants to request edit access for the auto-fetched fields */
  onRequestAutoEdit?: () => void;
  drivers: Driver[];
  trucks: Truck[];
  onClose: () => void;
  onSubmit: (data: TripSheetData) => void;
};

export function TripSheetDialog({ open, trip, closure, existingSheet, readOnly, autoEditable, onRequestAutoEdit, drivers, trucks, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<TripSheetData>(emptySheet(""));
  const [repairTypes, setRepairTypes] = useState<RepairType[]>([]);
  const [costPerKm, setCostPerKm] = useState<string>("");
  const [saving, setSaving] = useState(false);
  // Tracks which session has been initialized to prevent auto-refresh from resetting the form
  const initKeyRef = useRef<string>("");

  useEffect(() => {
    repairTypesApi.list().then(setRepairTypes).catch(() => setRepairTypes([]));
  }, []);

  const truckDbId = useMemo(
    () => trucks.find((t) => t.truckId === form.vehicleId)?.id ?? "",
    [trucks, form.vehicleId],
  );

  useEffect(() => {
    if (!truckDbId) { setCostPerKm(""); return; }
    fuelLogsApi.getFuelStats(truckDbId)
      .then((stats) => setCostPerKm(stats.costPerKm ?? ""))
      .catch(() => setCostPerKm(""));
  }, [truckDbId]);

  useEffect(() => {
    if (!open || !trip) {
      initKeyRef.current = "";
      return;
    }

    // Key uniquely identifies this dialog session: same trip + same sheet = same session
    const key = `${trip.id}::${existingSheet?.tripSheetNo ?? "new"}`;
    if (initKeyRef.current === key) return;
    initKeyRef.current = key;

    const compHD  = closure ? Number(closure.companyHaltDays || 0) : 0;
    const partHD  = closure ? Number(closure.partyHaltDays   || 0) : 0;
    const totalHD = compHD + partHD;
    const totalComp = closure ? Number(closure.driverHaltCompensation || 0) : 0;
    // Only company-caused halt days go into trip expenses
    const hp = totalHD > 0 ? (compHD / totalHD) * totalComp : 0;

    const battaCompType =
      BATTA_RULES[trip.tripCategory ?? ""]?.[trip.containerSpecification ?? ""]?.type ?? "";

    if (existingSheet) {
      setForm(recalcDerived({
        ...existingSheet,
        driverCompensationType: existingSheet.driverCompensationType || trip.driverCompensationType || battaCompType,
      }, hp));
    } else {
      const sheet = emptySheet(trip.id);
      sheet.bookingReferenceNo  = trip.bookingReferenceNo ?? "";
      sheet.tripSheetNo         = (trip.bookingReferenceNo ?? "").replace(/^CGI/, "TS");
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
      sheet.cargoWeight         = trip.cargoWeight ?? "";
      sheet.hireAmount              = trip.transportHireAmount ?? "";
      sheet.driverCompensationType  = trip.driverCompensationType || battaCompType;
      sheet.driverPay               = trip.driverAdvanceAmount ?? "";
      sheet.driverAdvanceAmount = String(
        (Number(closure?.driverAdvance || 0) + Number(closure?.additionalDriverAdvance || 0)).toFixed(2)
      );
      if (closure) {
        sheet.tripCompletedDate = closure.tripCompletedDate ?? "";
      }
      setForm(recalcDerived(sheet, hp));
    }
  }, [open, trip, existingSheet, closure]);

  function set<K extends keyof TripSheetData>(key: K, value: TripSheetData[K]) {
    setForm((prev) => recalcDerived({ ...prev, [key]: value }, haltPay));
  }

  // Halt values — read directly from stored closure (set when trip was closed)
  const companyHaltDays = closure ? Number(closure.companyHaltDays || 0) : 0;
  const partyHaltDays   = closure ? Number(closure.partyHaltDays   || 0) : 0;
  const haltTotalDays   = companyHaltDays + partyHaltDays;
  const totalHaltComp   = closure ? Number(closure.driverHaltCompensation || 0) : 0;
  const perDayRate      = haltTotalDays > 0 ? totalHaltComp / haltTotalDays : 0;
  const companyHaltPay  = companyHaltDays * perDayRate;
  const partyHaltPay    = partyHaltDays   * perDayRate;
  // Only company-caused halt goes into trip expenses
  const haltPay     = companyHaltPay;
  const haltRemarks = closure?.haltRemarks ?? "";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (trip) {
      setSaving(true);
      try {
        await tripsApi.update(trip.id, {
          ...trip,
          containerNumber: form.containerNumber,
          containerSpecification: form.containerType as Trip["containerSpecification"],
          shippingLine: form.line,
          tripCategory: form.tripType as Trip["tripCategory"],
          bookingCreatedDate: form.bookingDate,
          scheduledDate: form.tripScheduledDate,
          origin: form.from,
          destination: form.to,
          cargoWeight: form.cargoWeight,
          ...(autoEditable ? {
            vehicleId: form.vehicleId,
            driverId: form.driverId,
            transportHireAmount: form.hireAmount,
            driverCompensationType: form.driverCompensationType as Trip["driverCompensationType"],
          } : {}),
        });
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : "Failed to save trip details.");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    onSubmit({
      ...form,
      tripClosedDate:  closure?.closedAt ?? "",
      totalHaltDays:   haltTotalDays > 0   ? String(haltTotalDays)               : "",
      haltPay:         companyHaltPay > 0  ? companyHaltPay.toFixed(2)           : "",
      haltRemarks,
    });
  }

  const autoFuelCost =
    n(form.totalKm) > 0 && Number(costPerKm) > 0
      ? (n(form.totalKm) * Number(costPerKm)).toFixed(2)
      : "";

  // Auto-fill from computed value when km or cost-per-km changes; user can override between km edits
  useEffect(() => {
    setForm((prev) => ({ ...prev, fuelCostApprox: autoFuelCost }));
  }, [form.totalKm, costPerKm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill driver batta based on BATTA_RULES
  useEffect(() => {
    const rule = BATTA_RULES[form.tripType]?.[form.containerType];
    if (rule) {
      setForm((prev) => recalcDerived({ ...prev, driverPay: rule.amount }, haltPay));
    }
  }, [form.tripType, form.containerType]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!trip) return null;

  const ro = readOnly;
  const fc = ro ? `${inputClass} bg-gray-50 cursor-default` : inputClass;
  const roClass = `w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-not-allowed`;
  // Auto-fetched fields: editable only with autoEditable (Admin or approved request)
  const auto = !!autoEditable && !ro;
  const ac = auto ? inputClass : roClass;
  const fmt = (v: string) => v ? `₹${n(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "₹0.00";

  const currentTruck   = trucks.find((t) => t.truckId === form.vehicleId);
  const displayVehicle = currentTruck?.registrationNumber ?? form.vehicleId;
  const displayDriver  = drivers.find((d) => d.driverId === form.driverId)?.name ?? form.driverId;
  // Only validate against the live odometer for a NEW sheet. When editing an existing
  // sheet, the truck's odometer was already advanced to this sheet's end km on save,
  // so comparing its start km against the odometer would always false-positive.
  const startKmTooLow  = !ro && !existingSheet && !!currentTruck && n(form.startKm) > 0 && n(form.startKm) < Number(currentTruck.odometer);

  return (
    <Dialog open={open} onClose={onClose} title={ro ? `View Trip Sheet — ${trip.tripId}` : `Trip Sheet — ${trip.tripId}`} className="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* ── 1. Trip Information ── */}
        <p className={sh}>Trip Information</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Trip Sheet No">
            <input className={roClass} value={form.tripSheetNo} readOnly disabled placeholder="Auto-generated from booking reference" />
          </Field>
          <Field label="Booking Reference Number">
            <input className={roClass} value={form.bookingReferenceNo} readOnly disabled />
          </Field>
          <Field label="Container Number">
            <input className={ac} value={form.containerNumber} readOnly={!auto} disabled={!auto} onChange={(e) => set("containerNumber", e.target.value)} />
          </Field>
          <Field label="Container Specification">
            <input className={ac} value={form.containerType} readOnly={!auto} disabled={!auto} onChange={(e) => set("containerType", e.target.value)} />
          </Field>
          <Field label="Shipping Line">
            <input className={ac} value={form.line} readOnly={!auto} disabled={!auto} onChange={(e) => set("line", e.target.value)} />
          </Field>
          <Field label="Trip Category">
            <input className={ac} value={form.tripType} readOnly={!auto} disabled={!auto} onChange={(e) => set("tripType", e.target.value)} />
          </Field>
          <Field label="Assigned Vehicle">
            {auto ? (
              <select className={inputClass} value={form.vehicleId} onChange={(e) => set("vehicleId", e.target.value)}>
                <option value="">Select truck</option>
                {trucks.map((t) => (
                  <option key={t.truckId} value={t.truckId}>{t.registrationNumber} ({t.truckId})</option>
                ))}
              </select>
            ) : (
              <input className={roClass} value={displayVehicle} readOnly disabled />
            )}
          </Field>
          <Field label="Assigned Driver">
            {auto ? (
              <select className={inputClass} value={form.driverId} onChange={(e) => set("driverId", e.target.value)}>
                <option value="">Select driver</option>
                {drivers.map((d) => (
                  <option key={d.driverId} value={d.driverId}>{d.name} ({d.driverId})</option>
                ))}
              </select>
            ) : (
              <input className={roClass} value={displayDriver} readOnly disabled />
            )}
          </Field>
          <Field label="Booking Date">
            {auto ? (
              <DatePickerInput value={form.bookingDate} onChange={(v) => set("bookingDate", v)} />
            ) : (
              <input className={roClass} value={form.bookingDate ? form.bookingDate.split("-").reverse().join("-") : ""} readOnly disabled />
            )}
          </Field>
          <Field label="Trip Scheduled Date">
            {auto ? (
              <DatePickerInput value={form.tripScheduledDate} onChange={(v) => set("tripScheduledDate", v)} />
            ) : (
              <input className={roClass} value={form.tripScheduledDate ? form.tripScheduledDate.split("-").reverse().join("-") : ""} readOnly disabled />
            )}
          </Field>
          <Field label="Trip Completed Date">
            {auto ? (
              <DatePickerInput value={form.tripCompletedDate} onChange={(v) => set("tripCompletedDate", v)} />
            ) : (
              <input className={roClass} value={form.tripCompletedDate ? form.tripCompletedDate.split("-").reverse().join("-") : ""} readOnly disabled />
            )}
          </Field>
          <Field label="Trip Closed Date">
            <input className={roClass} value={closure?.closedAt ? closure.closedAt.split("-").reverse().join("-") : ""} readOnly disabled placeholder="Auto-fetched on close" />
          </Field>
          <Field label="Date of Trip Sheet Entry *">
            <DatePickerInput value={form.tripSheetDate} onChange={(v) => set("tripSheetDate", v)} disabled={ro} />
          </Field>
        </div>

        {/* ── 2. Route Information ── */}
        <p className={sh}>Route Information</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="From">
            <input className={ac} value={form.from} readOnly={!auto} disabled={!auto} onChange={(e) => set("from", e.target.value)} />
          </Field>
          <Field label="To">
            <input className={ac} value={form.to} readOnly={!auto} disabled={!auto} onChange={(e) => set("to", e.target.value)} />
          </Field>
          <Field label="Clearing Agent">
            <input className={fc} value={form.clearingAgent} readOnly={ro} onChange={(e) => set("clearingAgent", e.target.value)} placeholder="e.g. ABC Clearing" />
          </Field>
        </div>

        {/* ── 3. Hire ── */}
        <p className={sh}>Hire</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Hire Amount *">
            <DecimalInput type="number" min="0" className={ac} value={form.hireAmount} readOnly={!auto} disabled={!auto} onChange={(e) => set("hireAmount", e.target.value)} />
          </Field>
        </div>

        {/* ── 4. Trip Distance & Cargo ── */}
        <p className={sh}>Trip Distance & Cargo</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start km *">
            <DecimalInput type="number" min="0" className={fc} value={form.startKm} readOnly={ro} onChange={(e) => set("startKm", e.target.value)} placeholder="e.g. 84000" />
            {startKmTooLow && (
              <p className="mt-1 text-xs text-red-500">
                Below current odometer ({Number(currentTruck!.odometer).toLocaleString()} km). Please Check the Value.
              </p>
            )}
          </Field>
          <Field label="End km *">
            <DecimalInput type="number" min="0" className={fc} value={form.endKm} readOnly={ro} onChange={(e) => set("endKm", e.target.value)} placeholder="e.g. 84500" />
            {n(form.endKm) > 0 && n(form.startKm) > 0 && n(form.endKm) <= n(form.startKm) && (
              <p className="mt-1 text-xs text-red-500">End Km must be greater than Start Km.</p>
            )}
          </Field>
          <Field label="Total km *">
            <DecimalInput type="number" className={`${fc} bg-gray-50`} value={form.totalKm} readOnly placeholder="Auto-calculated" />
          </Field>
          <Field label="Fuel Cost for this Trip — approx (₹)">
            <DecimalInput type="number"
              min="0"
              className={fc}
              value={form.fuelCostApprox}
              readOnly={ro}
              onChange={(e) => set("fuelCostApprox", e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder={costPerKm ? "Auto-calculated — you can override" : "Enter fuel cost manually"}
            />
            {costPerKm && Number(costPerKm) > 0 && (
              <p className="mt-1 text-xs text-gray-400">
                {n(form.totalKm) > 0 ? `${n(form.totalKm)} km × ₹${Number(costPerKm).toFixed(2)}/km (auto-filled — edit to override)` : `₹${Number(costPerKm).toFixed(2)}/km from fuel history`}
              </p>
            )}
          </Field>
          <Field label="Cargo Weight (tons)">
            <input className={ac} value={form.cargoWeight} readOnly={!auto} disabled={!auto} onChange={(e) => set("cargoWeight", e.target.value)} placeholder="Auto-fetched from trip" />
          </Field>
        </div>

        {/* ── 5. Halt Information ── */}
        <p className={sh}>Halt Information</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Company Halt Days (Driver)">
            <input className={roClass} value={companyHaltDays > 0 ? String(companyHaltDays) : ""} readOnly disabled placeholder="Auto-fetched" />
            <p className="mt-1 text-xs text-gray-400">Included in trip expenses</p>
          </Field>
          <Field label="Company Halt Pay (₹)">
            <input className={roClass} value={companyHaltPay > 0 ? companyHaltPay.toFixed(2) : ""} readOnly disabled placeholder="Auto-calculated" />
          </Field>
          <Field label="Party Halt Days (Customer)">
            <input className={`${roClass} ${partyHaltDays > 0 ? "border-amber-200 bg-amber-50 text-amber-700" : ""}`} value={partyHaltDays > 0 ? String(partyHaltDays) : ""} readOnly disabled placeholder="Auto-fetched" />
            <p className="mt-1 text-xs text-amber-500">Not included in trip expenses — recoverable from customer</p>
          </Field>
          <Field label="Party Halt Pay (₹)">
            <input className={`${roClass} ${partyHaltPay > 0 ? "border-amber-200 bg-amber-50 text-amber-700" : ""}`} value={partyHaltPay > 0 ? partyHaltPay.toFixed(2) : ""} readOnly disabled placeholder="Auto-calculated" />
          </Field>
          <Field label="Halt Remarks" className="sm:col-span-2">
            <input className={roClass} value={haltRemarks} readOnly disabled placeholder="Auto-fetched" />
          </Field>
        </div>

        {/* ── 7. Trip Expenses ── */}
        <p className={sh}>Trip Expenses</p>

        <p className={subsh}>Port & Operational Charges</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Port Pass Expense (பாஸ்) *">
            <DecimalInput type="number" min="0" className={fc} value={form.portPassExpense} readOnly={ro} onChange={(e) => set("portPassExpense", e.target.value)} placeholder="e.g. 500" />
          </Field>
          <Field label="Weight Sheet Expense (எடை) *">
            <DecimalInput type="number" min="0" className={fc} value={form.weightSheetExpense} readOnly={ro} onChange={(e) => set("weightSheetExpense", e.target.value)} placeholder="e.g. 200" />
          </Field>
          <Field label="Mamol Expense (இறக்கு / ஏற்று மாமூல்) *">
            <DecimalInput type="number" min="0" className={fc} value={form.mamolExpense} readOnly={ro} onChange={(e) => set("mamolExpense", e.target.value)} placeholder="e.g. 300" />
          </Field>
          <Field label="Claimable Mamol Expense *">
            <DecimalInput type="number" min="0" className={fc} value={form.claimableMamolExpense} readOnly={ro} onChange={(e) => set("claimableMamolExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
        </div>

        <p className={subsh}>Government & Compliance</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Traffic, RTO / Police Expense *">
            <DecimalInput type="number" min="0" className={fc} value={form.trafficRtoExpense} readOnly={ro} onChange={(e) => set("trafficRtoExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
        </div>

        <p className={subsh}>Loading & Handling</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Lift On / Off (லிப்டான்) *">
            <DecimalInput type="number" min="0" className={fc} value={form.liftOnOffExpense} readOnly={ro} onChange={(e) => set("liftOnOffExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
          <Field label="Crane Operator Expense *">
            <DecimalInput type="number" min="0" className={fc} value={form.craneOperatorExpense} readOnly={ro} onChange={(e) => set("craneOperatorExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
          <Field label="Parking Expenses *">
            <DecimalInput type="number" min="0" className={fc} value={form.parkingExpense} readOnly={ro} onChange={(e) => set("parkingExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
        </div>

        <p className={subsh}>Major Repairs</p>
        {!ro && repairTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {repairTypes.map((rt) => (
              <button
                key={rt.id}
                type="button"
                onClick={() => set("majorRepairs", [...form.majorRepairs, { name: rt.name, cost: rt.defaultCost !== "0" ? rt.defaultCost : "" }])}
                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
              >
                + {rt.name}
              </button>
            ))}
          </div>
        )}
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
                <DecimalInput type="number"
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
        {(form.majorRepairs || []).length > 0 && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-orange-800">Major Repairs Total</span>
              <span className="text-sm font-bold text-orange-800">
                {fmt(String((form.majorRepairs || []).reduce((sum, r) => sum + n(r.cost), 0)))}
              </span>
            </div>
            <p className="text-xs text-orange-600 leading-relaxed">
              Note: These maintenance charges will be recorded for this truck but will not be included in the cost of this trip.
            </p>
          </div>
        )}

        <p className={subsh}>Miscellaneous</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Other Expenses *">
            <DecimalInput type="number" min="0" className={fc} value={form.otherExpenses} readOnly={ro} onChange={(e) => set("otherExpenses", e.target.value)} placeholder="e.g. 0" />
            <p className="mt-1 text-xs text-amber-600">Note: Please don&apos;t add maintenance charges here.</p>
          </Field>
        </div>

        {/* ── 8. Toll Details ── */}
        <p className={sh}>Toll Details</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Toll Charges (டோல்) *">
            <DecimalInput type="number" min="0" className={fc} value={form.tollCharges} readOnly={ro} onChange={(e) => set("tollCharges", e.target.value)} placeholder="e.g. 1200" />
          </Field>
        </div>

        {/* ── 8. Driver Settlement ── */}
        <p className={sh}>Driver Settlement</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Driver Batta Amount (₹)">
            <DecimalInput type="number" min="0" className={fc} value={form.driverPay} readOnly={ro} onChange={(e) => set("driverPay", e.target.value)} placeholder="e.g. 1000" />
            {(() => {
              const rule = BATTA_RULES[form.tripType]?.[form.containerType];
              if (rule) return <p className="mt-1 text-xs text-blue-500">Auto-set to ₹{Number(rule.amount).toLocaleString("en-IN")} — {form.tripType} with {form.containerType} ({rule.type} rate). Edit to override.</p>;
              if (form.driverCompensationType === "FIXED") return <p className="mt-1 text-xs text-gray-400">Fixed batta amount based on compensation type.</p>;
              if (form.driverCompensationType === "PER KM" && n(form.totalKm) > 0) return <p className="mt-1 text-xs text-gray-400">Per-km rate × {n(form.totalKm).toLocaleString()} km. Edit to set amount.</p>;
              return <p className="mt-1 text-xs text-gray-400">Batta paid to driver for this trip.</p>;
            })()}
          </Field>
          <Field label="Advance Paid">
            <DecimalInput type="number" className={roClass} value={form.driverAdvanceAmount} readOnly disabled />
            <p className="mt-1 text-xs text-gray-400">Driver Advance + Additional Driver Advance from trip closure.</p>
          </Field>
          <Field label="Driver Balance">
            <DecimalInput type="number" className={`${fc} bg-gray-50 font-semibold`} value={form.driverBalance} readOnly placeholder="Auto-calculated" />
            {(() => {
              const bal = n(form.driverBalance);
              const amt = `₹${Math.abs(bal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
              if (bal > 0)  return <p className="mt-1 text-xs font-medium text-emerald-600">Company owes {amt} to the driver.</p>;
              if (bal < 0)  return <p className="mt-1 text-xs font-medium text-amber-600">Driver owes {amt} to the company.</p>;
              if (n(form.driverAdvanceAmount) > 0) return <p className="mt-1 text-xs text-gray-400">Settled — expenses equal advance.</p>;
              return null;
            })()}
          </Field>
        </div>

        {/* ── 9. Expense Summary ── */}
        <p className={sh}>Expense Summary</p>
        <div className="rounded-xl border border-gray-200 overflow-hidden text-sm">
          {[
            { label: "Driver Batta",              value: form.driverPay },
            { label: "Halt Pay",                  value: String(haltPay) },
            { label: "Port Pass Expense",          value: form.portPassExpense },
            { label: "Weight Sheet Expense",       value: form.weightSheetExpense },
            { label: "Mamol Expense",              value: form.mamolExpense },
            { label: "Claimable Mamol Expense",    value: form.claimableMamolExpense },
            { label: "Traffic / RTO / Police",     value: form.trafficRtoExpense },
            { label: "Lift On / Off",              value: form.liftOnOffExpense },
            { label: "Crane Operator",             value: form.craneOperatorExpense },
            { label: "Parking",                    value: form.parkingExpense },
            { label: "Toll Charges",               value: form.tollCharges },
            { label: "Other Expenses",             value: form.otherExpenses },
          ].map(({ label, value }) => {
            const amt = n(value);
            return (
              <div key={label} className={`flex justify-between items-center px-4 py-2.5 border-b border-gray-100 ${amt === 0 ? "text-gray-400" : "text-gray-700"}`}>
                <span>{label}</span>
                <span className={amt > 0 ? "font-semibold" : ""}>{fmt(value)}</span>
              </div>
            );
          })}
          <div className="bg-gray-50 px-4 py-3 flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="font-semibold text-blue-700">Trip Expenses</span>
              <span className="font-semibold text-blue-700">{fmt(form.tripExpensesTotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span className="font-medium">Driver Expenses <span className="text-xs font-normal text-gray-400">(out-of-pocket)</span></span>
              <span className="font-medium">{fmt(form.driverExpensesTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2 mt-0.5">
              <span className="font-bold text-emerald-700 text-base">Total Expense</span>
              <span className="font-bold text-emerald-700 text-base">{fmt(form.totalExpense)}</span>
            </div>
          </div>
        </div>

        {partyHaltPay > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <span className="mt-0.5 text-amber-500">⚠</span>
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Party Halt has been mentioned</span> — make sure to pay{" "}
              <span className="font-semibold">₹{partyHaltPay.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>{" "}
              to the Driver for {partyHaltDays} party halt {partyHaltDays === 1 ? "day" : "days"} (this amount is recoverable from the customer).
            </p>
          </div>
        )}

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
            <button type="submit" disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? "Saving…" : "Save Trip Sheet"}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
