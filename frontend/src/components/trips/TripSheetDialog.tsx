"use client";

import { useState, useEffect, useRef, useMemo, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { type TripSheetData, type DieselEntry, emptyDieselEntry, n, calcTripExpenses, calcDriverExpenses } from "@/types/trip-sheet";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { RepairType } from "@/types/repair-type";
import { repairTypesApi, fuelLogsApi, tripsApi, tripExpenseRatesApi, type TripExpenseRate, type SheetKmCheck } from "@/lib/api";
import type { FuelLog } from "@/types/fuel-log";
import { showError, confirmAction, prompt } from "@/lib/feedback";
import { todayIst, formatDate } from "@/lib/format-date";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { RiDeleteBinLine as Trash2, RiAddCircleLine as PlusCircle, RiErrorWarningLine as WarnIcon } from "@remixicon/react";
import { haltPayFromClosure } from "@/lib/halt-pay";
import { GlassSelect } from "@/components/ui/GlassSelect";

const sh = "text-caption-1-semibold text-accent-text-strong bg-accent-surface px-3 py-2 rounded-lg";
const subsh = "text-caption-1-medium text-text-tertiary mt-3 mb-1";

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

// Single source of truth for every field the trip sheet *mirrors* from the Trip record.
// These are re-synced from the live trip every time the dialog opens — for BOTH new and
// existing sheets — so an edit made to the booking after a sheet was saved never leaves
// the sheet showing a stale value. Add any new "auto-fetched from trip" field here (and
// only here) so it can never drift out of sync in the future.
//
// NOTE: sheet-OWNED fields (start/end km, diesel, expenses, advances, remarks, computed
// batta/driverPay) are intentionally NOT listed — those belong to the sheet and must be
// preserved from the saved sheet, not overwritten by the trip.
function tripMirroredFields(trip: Trip): Partial<TripSheetData> {
  return {
    bookingReferenceNo:     trip.bookingReferenceNo ?? "",
    tripSheetNo:            (trip.bookingReferenceNo ?? "").replace(/^CGI/, "TS"),
    containerNumber:        trip.containerNumber ?? "",
    containerNumber1:       trip.containerNumber1 ?? "",
    containerNumber2:       trip.containerNumber2 ?? "",
    containerType:          trip.containerSpecification ?? "",
    line:                   trip.shippingLine ?? "",
    tripType:               trip.tripCategory ?? "",
    vehicleId:              trip.vehicleId ?? "",
    driverId:               trip.driverId ?? "",
    bookingDate:            trip.bookingCreatedDate ?? "",
    tripScheduledDate:      trip.scheduledDate ?? "",
    from:                   trip.origin ?? "",
    to:                     trip.destination ?? "",
    clearingAgent:          trip.chaName ?? "",
    // cargoWeight is intentionally NOT mirrored on re-open: trip.cargoWeight is a category
    // ("NORMAL", "Between 20-25 Tons") while the sheet's cargoWeight is numeric tons. It is
    // seeded once on new-sheet creation only (below), never re-synced from the trip.
    openLoadHireType:       trip.openLoadHireType ?? "",
    ratePerTon:             trip.ratePerTon ?? "",
    hireAmount:             trip.transportHireAmount ?? "",
    driverCompensationType: trip.driverCompensationType ?? "",
  };
}

const emptySheet = (tripId: string): TripSheetData => ({
  tripId,
  tripSheetNo: "",
  bookingReferenceNo: "",
  containerNumber: "",
  containerNumber1: "",
  containerNumber2: "",
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
  hireAmount: "", openLoadHireType: "", ratePerTon: "",
  startKm: "", endKm: "", totalKm: "", cargoWeight: "", kmVarianceRemark: "",
  dieselEntries: [emptyDieselEntry()],
  dieselLitres: "", dieselRate: "", dieselTotal: "", dieselRemarks: "",
  driverCompensationType: "",
  driverPay: "",
  driverAdvance: "",
  additionalDriverAdvance: "",
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

// A single trip this long is almost certainly a typo (an extra digit). The
// checks against the truck's other trips (before/after this one, its highest
// other reading) come from the server — tripsApi.checkSheetKm — and work the
// same for new sheets and edits.
const TRIP_KM_WARN = 5000;

/** A fill goes to Fuel History only with litres > 0 (lib/api.ts fromSheet + the server). */
const fillRecorded = (e: DieselEntry) => n(e.litres) > 0;
const fillTouched = (e: DieselEntry) => !!(e.date || e.odometer || e.litres || e.costPerLitre || e.totalCost || e.fuelStation);

/** Diesel fills that won't save the way the user probably expects. */
function dieselWarnings(entries: DieselEntry[]): string[] {
  const out: string[] = [];
  entries.forEach((e, i) => {
    if (fillRecorded(e) && !(n(e.totalCost) > 0)) {
      out.push(`Fill #${i + 1} has ${e.litres} L but no Cost Per Litre / Total — it would go to Fuel History at ₹0.`);
    } else if (!fillRecorded(e) && fillTouched(e) && (e.odometer || e.costPerLitre || e.totalCost || e.fuelStation)) {
      out.push(`Fill #${i + 1} has no Quantity (Litres), so it won't be saved.`);
    }
  });
  return out;
}

function tripLengthWarning(startKm: string, endKm: string): string | undefined {
  const start = Number(startKm || 0);
  const end = Number(endKm || 0);
  return start > 0 && end - start > TRIP_KM_WARN
    ? `That makes this one trip ${(end - start).toLocaleString("en-IN")} km. Is End km correct?`
    : undefined;
}

export function TripSheetDialog({ open, trip, closure, existingSheet, readOnly, autoEditable, onRequestAutoEdit, drivers, trucks, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<TripSheetData>(emptySheet(""));
  const [repairTypes, setRepairTypes] = useState<RepairType[]>([]);
  const [fuelStations, setFuelStations] = useState<string[]>([]);
  const [costPerKm, setCostPerKm] = useState<string>("");
  const [lastFuelLog, setLastFuelLog] = useState<FuelLog | null>(null);
  const [kmCheck, setKmCheck] = useState<SheetKmCheck | null>(null);
  const [saving, setSaving] = useState(false);
  const [invoiceRequired, setInvoiceRequired] = useState(true);
  // driverAdvance and additionalDriverAdvance live in form (TripSheetData) — not local state
  const [localInitialDisbursedAdvance, setLocalInitialDisbursedAdvance] = useState("");
  const [expenseConfig, setExpenseConfig] = useState<TripExpenseRate | null>(null);
  // Tracks which session has been initialized to prevent auto-refresh from resetting the form
  const initKeyRef = useRef<string>("");
  // Guards localInitialDisbursedAdvance so WS-triggered trip refreshes don't overwrite user edits
  const localInitDoneRef = useRef(false);

  useEffect(() => {
    repairTypesApi.list().then(setRepairTypes).catch(() => setRepairTypes([]));
    fuelLogsApi.listFuelStations().then(setFuelStations).catch(() => setFuelStations([]));
    tripExpenseRatesApi.getConfig().then(setExpenseConfig).catch(() => {});
  }, []);

  const truckDbId = useMemo(
    () => trucks.find((t) => t.truckId === form.vehicleId)?.id ?? "",
    [trucks, form.vehicleId],
  );

  useEffect(() => {
    if (!truckDbId) { setCostPerKm(""); setLastFuelLog(null); return; }
    fuelLogsApi.getFuelStats(truckDbId)
      .then((stats) => setCostPerKm(stats.costPerKm ?? ""))
      .catch(() => setCostPerKm(""));
    fuelLogsApi.listFuelLogs(truckDbId)
      .then((logs) => {
        if (!logs.length) { setLastFuelLog(null); return; }
        const sorted = [...logs].sort((a, b) => Number(b.odometer) - Number(a.odometer));
        setLastFuelLog(sorted[0]);
      })
      .catch(() => setLastFuelLog(null));
  }, [truckDbId]);

  // Start/End KM against the truck's trips before/after this one — checked a
  // moment after typing stops, for new sheets and edits alike.
  const tripDbId = trip?.id;
  useEffect(() => {
    if (!open || !tripDbId || readOnly || !form.vehicleId || (!form.startKm && !form.endKm)) { setKmCheck(null); return; }
    let stale = false;
    const t = setTimeout(() => {
      tripsApi.checkSheetKm(tripDbId, {
        vehicleId: form.vehicleId, scheduledDate: form.tripScheduledDate, startKm: form.startKm, endKm: form.endKm,
      }).then((r) => { if (!stale) setKmCheck(r); }).catch(() => { if (!stale) setKmCheck(null); });
    }, 500);
    return () => { stale = true; clearTimeout(t); };
  }, [open, tripDbId, readOnly, form.vehicleId, form.tripScheduledDate, form.startKm, form.endKm]);

  useEffect(() => {
    if (!open || !trip) {
      initKeyRef.current = "";
      localInitDoneRef.current = false;
      return;
    }

    // Key is stable per session: existing sheets key on their sheet number; new sheets
    // use a plain "::new" key. expenseConfig is deliberately excluded — it arrives async
    // and is applied via a functional setForm patch below so it never resets user edits.
    const key = existingSheet
      ? `${trip.id}::${existingSheet.tripSheetNo}`
      : `${trip.id}::new`;

    // If a new sheet is already initialised and expenseConfig just arrived, patch ONLY
    // the expense auto-populate fields (leave everything else — especially advance fields
    // — untouched).
    if (!existingSheet && initKeyRef.current === key && expenseConfig) {
      setForm((prev) => {
        const patch: Partial<typeof prev> = {};
        if (!prev.portPassExpense     && expenseConfig.portPassExpenseAuto     && expenseConfig.portPassExpense     > 0) patch.portPassExpense     = String(expenseConfig.portPassExpense);
        if (!prev.weightSheetExpense  && expenseConfig.weightSheetExpenseAuto  && expenseConfig.weightSheetExpense  > 0) patch.weightSheetExpense  = String(expenseConfig.weightSheetExpense);
        if (!prev.mamolExpense        && expenseConfig.mamolExpenseAuto        && expenseConfig.mamolExpense        > 0) patch.mamolExpense        = String(expenseConfig.mamolExpense);
        if (!prev.claimableMamolExpense && expenseConfig.claimableMamolExpenseAuto && expenseConfig.claimableMamolExpense > 0) patch.claimableMamolExpense = String(expenseConfig.claimableMamolExpense);
        if (!prev.trafficRtoExpense   && expenseConfig.trafficRtoExpenseAuto   && expenseConfig.trafficRtoExpense   > 0) patch.trafficRtoExpense   = String(expenseConfig.trafficRtoExpense);
        if (!prev.liftOnOffExpense    && expenseConfig.liftOnOffExpenseAuto    && expenseConfig.liftOnOffExpense    > 0) patch.liftOnOffExpense    = String(expenseConfig.liftOnOffExpense);
        if (!prev.craneOperatorExpense && expenseConfig.craneOperatorExpenseAuto && expenseConfig.craneOperatorExpense > 0) patch.craneOperatorExpense = String(expenseConfig.craneOperatorExpense);
        if (!prev.parkingExpense      && expenseConfig.parkingExpenseAuto      && expenseConfig.parkingExpense      > 0) patch.parkingExpense      = String(expenseConfig.parkingExpense);
        if (Object.keys(patch).length === 0) return prev;
        return recalcDerived({ ...prev, ...patch }, hp);
      });
      return;
    }

    if (initKeyRef.current === key) return;
    initKeyRef.current = key;
    setInvoiceRequired(trip.invoiceRequired ?? true);

    // Only the company-caused halt pay goes into trip expenses
    const hp = haltPayFromClosure(closure).companyPay;

    if (existingSheet) {
      setForm(recalcDerived({
        ...existingSheet,
        // Re-sync every trip-mirrored field from the live trip so a saved sheet can never
        // display a value that was changed on the booking afterwards (e.g. hire amount).
        ...tripMirroredFields(trip),
        dieselEntries: existingSheet.dieselEntries?.length
          ? existingSheet.dieselEntries
          : [emptyDieselEntry()],
        // Fallback to closure for old sheets saved before these columns existed
        driverAdvance:           existingSheet.driverAdvance           || String(closure?.driverAdvance           ?? ""),
        additionalDriverAdvance: existingSheet.additionalDriverAdvance || String(closure?.additionalDriverAdvance  ?? ""),
      }, hp));
    } else {
      const sheet = emptySheet(trip.id);
      // Pull every trip-mirrored field from the live trip (same list used on re-open).
      Object.assign(sheet, tripMirroredFields(trip));
      sheet.cargoWeight             = trip.cargoWeight ?? "";  // seed once (new sheet only)
      sheet.driverPay               = trip.driverAdvanceAmount ?? "";
      // Store the individual advance breakdown so each field is independently editable.
      sheet.driverAdvance           = String(closure?.driverAdvance           ?? "");
      sheet.additionalDriverAdvance = String(closure?.additionalDriverAdvance  ?? "");
      // Compute the total: if initialDisbursedAdvance is set it replaces driverAdvance
      // as the effective base (the actual cash handed to the driver).
      const effBase = trip.initialDisbursedAdvance
        ? Number(trip.initialDisbursedAdvance)
        : Number(closure?.driverAdvance || 0);
      sheet.driverAdvanceAmount = String(
        (effBase + Number(closure?.additionalDriverAdvance || 0)).toFixed(2)
      );
      if (closure) {
        sheet.tripCompletedDate = closure.tripCompletedDate ?? "";
      }
      // Auto-set entry date to today (non-editable once set)
      sheet.tripSheetDate = todayIst();
      // Pre-fill expense fields that the Admin has marked for auto-populate
      if (expenseConfig) {
        if (expenseConfig.portPassExpenseAuto && expenseConfig.portPassExpense > 0)
          sheet.portPassExpense = String(expenseConfig.portPassExpense);
        if (expenseConfig.weightSheetExpenseAuto && expenseConfig.weightSheetExpense > 0)
          sheet.weightSheetExpense = String(expenseConfig.weightSheetExpense);
        if (expenseConfig.mamolExpenseAuto && expenseConfig.mamolExpense > 0)
          sheet.mamolExpense = String(expenseConfig.mamolExpense);
        if (expenseConfig.claimableMamolExpenseAuto && expenseConfig.claimableMamolExpense > 0)
          sheet.claimableMamolExpense = String(expenseConfig.claimableMamolExpense);
        if (expenseConfig.trafficRtoExpenseAuto && expenseConfig.trafficRtoExpense > 0)
          sheet.trafficRtoExpense = String(expenseConfig.trafficRtoExpense);
        if (expenseConfig.liftOnOffExpenseAuto && expenseConfig.liftOnOffExpense > 0)
          sheet.liftOnOffExpense = String(expenseConfig.liftOnOffExpense);
        if (expenseConfig.craneOperatorExpenseAuto && expenseConfig.craneOperatorExpense > 0)
          sheet.craneOperatorExpense = String(expenseConfig.craneOperatorExpense);
        if (expenseConfig.parkingExpenseAuto && expenseConfig.parkingExpense > 0)
          sheet.parkingExpense = String(expenseConfig.parkingExpense);
      }
      setForm(recalcDerived(sheet, hp));
    }
  }, [open, trip, existingSheet, closure, expenseConfig]);

  // Sync initialDisbursedAdvance once per dialog open session.
  // Uses localInitDoneRef so WS-triggered trip prop updates never overwrite user edits mid-session.
  useEffect(() => {
    if (!open || !trip || localInitDoneRef.current) return;
    setLocalInitialDisbursedAdvance(trip.initialDisbursedAdvance ?? "");
    localInitDoneRef.current = true;
  }, [open, trip]);

  function set<K extends keyof TripSheetData>(key: K, value: TripSheetData[K]) {
    setForm((prev) => recalcDerived({ ...prev, [key]: value }, haltPay));
  }

  function updateAdvanceField(field: "driver" | "additional", value: string) {
    setForm((prev) => {
      const newDriverAdv = field === "driver"     ? value : prev.driverAdvance;
      const newAddlAdv   = field === "additional" ? value : prev.additionalDriverAdvance;
      // initialDisbursedAdvance overrides driverAdvance as the effective cash-in-hand amount
      const effectiveBase = localInitialDisbursedAdvance.trim()
        ? (parseFloat(localInitialDisbursedAdvance) || 0)
        : (parseFloat(newDriverAdv) || 0);
      const total = effectiveBase + (parseFloat(newAddlAdv) || 0);
      return recalcDerived({
        ...prev,
        driverAdvance:           newDriverAdv,
        additionalDriverAdvance: newAddlAdv,
        driverAdvanceAmount:     total > 0 ? total.toFixed(2) : "",
      }, haltPay);
    });
  }

  function handleInitialDisbursedChange(value: string) {
    const sanitized = value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
    // Must be strictly less than Driver Advance
    const driverAdv = parseFloat(form.driverAdvance) || 0;
    if (sanitized !== "" && parseFloat(sanitized) >= driverAdv) return;
    setLocalInitialDisbursedAdvance(sanitized);
    const effectiveBase = sanitized.trim()
      ? (parseFloat(sanitized) || 0)
      : driverAdv;
    const total = effectiveBase + (parseFloat(form.additionalDriverAdvance) || 0);
    set("driverAdvanceAmount", total > 0 ? total.toFixed(2) : "");
  }

  // Halt values — read directly from stored closure (set when trip was closed)
  // Each part at its own branch rate (saved at Close Trip — see lib/halt-pay).
  const haltSaved       = haltPayFromClosure(closure);
  const companyHaltDays = haltSaved.companyDays;
  const partyHaltDays   = haltSaved.partyDays;
  const haltTotalDays   = companyHaltDays + partyHaltDays;
  const companyHaltPay  = haltSaved.companyPay;
  const partyHaltPay    = haltSaved.partyPay;
  // Only company-caused halt goes into trip expenses
  const haltPay     = companyHaltPay;
  const haltRemarks = closure?.haltRemarks ?? "";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // A wrong Start/End KM would skew Total KM (profit) and could push the
    // truck's odometer up by lakhs of km — make the user confirm. Fresh check
    // on submit; if it can't be reached, only the trip-length check applies.
    if (!readOnly) {
      const fresh = trip ? await tripsApi.checkSheetKm(trip.id, {
        vehicleId: form.vehicleId, scheduledDate: form.tripScheduledDate, startKm: form.startKm, endKm: form.endKm,
      }).catch(() => null) : null;
      const warnings = [
        ...(fresh?.warnings.map((w) => w.message) ?? []),
        ...[tripLengthWarning(form.startKm, form.endKm)].filter((w): w is string => !!w),
      ];
      const fuel = dieselWarnings(form.dieselEntries);
      if (warnings.length > 0 || fuel.length > 0) {
        const title = warnings.length && fuel.length ? "Check the KM readings and diesel" : warnings.length ? "Check the KM readings" : "Check the diesel entries";
        const res = await confirmAction(title, `${[...warnings, ...fuel].join(" ")} Save anyway?`, "Save anyway");
        if (!res.isConfirmed) return;
      }
    }
    if (trip) {
      setSaving(true);
      try {
        await tripsApi.update(trip.id, {
          ...trip,
          containerNumber: form.containerNumber,
          containerNumber1: form.containerNumber1,
          containerNumber2: form.containerNumber2,
          containerSpecification: form.containerType as Trip["containerSpecification"],
          shippingLine: form.line,
          tripCategory: form.tripType as Trip["tripCategory"],
          bookingCreatedDate: form.bookingDate,
          scheduledDate: form.tripScheduledDate,
          origin: form.from,
          destination: form.to,
          cargoWeight: form.cargoWeight,
          invoiceRequired: form.tripType === "RETURN TRIP" ? invoiceRequired : true,
          initialDisbursedAdvance: localInitialDisbursedAdvance || undefined,
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
      // The truck's current odometer moves to End KM on the server when the
      // sheet itself is saved (backend odometer.advance) — nothing to send here.
      setSaving(false);
    }
    // ±10% KM variance check (compare totalKm to trip.approxKm)
    let kmRemark = form.kmVarianceRemark;
    const approxKm = n(trip?.approxKm ?? "0");
    const actualKm = n(form.totalKm);
    if (!ro && approxKm > 0 && actualKm > 0 && !kmRemark) {
      const pct = Math.abs((actualKm - approxKm) / approxKm) * 100;
      if (pct > 10) {
        const remark = await prompt({
          title: "KM variance",
          description: `Actual KM (${actualKm}) differs from approximate KM (${approxKm}) by ${pct.toFixed(1)}%, outside the ±10% limit. Enter a reason to proceed.`,
          inputLabel: "Reason",
          placeholder: "Reason for KM variance",
          required: true,
          confirmLabel: "Save with remark",
        });
        if (remark === null) { setSaving(false); return; }
        kmRemark = remark;
      }
    }

    // ±5% diesel variance check — disabled for now
    const dieselRemark = form.dieselRemarks;

    onSubmit({
      ...form,
      kmVarianceRemark: kmRemark,
      dieselRemarks: dieselRemark,
      tripClosedDate:  closure?.closedAt ?? "",
      totalHaltDays:   haltTotalDays > 0   ? String(haltTotalDays)               : "",
      haltPay:         companyHaltPay > 0  ? companyHaltPay.toFixed(2)           : "",
      haltRemarks,
    });
  }

  function updateDieselEntry(index: number, field: keyof DieselEntry, value: string) {
    setForm((prev) => {
      const entries = prev.dieselEntries.map((e, i) => {
        if (i !== index) return e;
        const updated = { ...e, [field]: value };
        const litres = n(field === "litres" ? value : updated.litres);
        const rate = n(field === "costPerLitre" ? value : updated.costPerLitre);
        if (litres > 0 && rate > 0) updated.totalCost = (litres * rate).toFixed(2);
        return updated;
      });
      return { ...prev, dieselEntries: entries };
    });
  }

  function addDieselEntry() {
    setForm((prev) => ({
      ...prev,
      dieselEntries: [...prev.dieselEntries, emptyDieselEntry()],
    }));
  }

  function clearDieselEntry(index: number) {
    setForm((prev) => ({
      ...prev,
      dieselEntries: prev.dieselEntries.map((e, i) => (i === index ? emptyDieselEntry() : e)),
    }));
  }

  function removeDieselEntry(index: number) {
    setForm((prev) => ({
      ...prev,
      dieselEntries: prev.dieselEntries.filter((_, i) => i !== index),
    }));
  }

  if (!trip) return null;

  const ro = readOnly;
  const fc = ro ? `${inputClass} bg-fill-1 cursor-default` : inputClass;
  const roClass = `w-full rounded-lg border border-separator-border bg-fill-1 px-3 py-2 text-sm text-text-primary cursor-not-allowed`;
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
  const endKmWarning = ro ? undefined : tripLengthWarning(form.startKm, form.endKm);
  const startKmChecks = ro ? [] : (kmCheck?.warnings ?? []).filter((w) => w.field === "start");
  const endKmChecks = ro ? [] : (kmCheck?.warnings ?? []).filter((w) => w.field === "end");

  return (
    <Dialog open={open} onClose={onClose} title={ro ? `View Trip Sheet — ${trip.tripId}` : `Trip Sheet — ${trip.tripId}`} className="max-w-4xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* ── 1. Trip Information ── */}
        <p className={sh}>Trip Information</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Trip Sheet No">
            <input className={roClass} value={form.tripSheetNo} readOnly disabled placeholder="Auto-generated from booking reference" />
          </Field>
          <Field label="Booking Reference Number">
            <input className={roClass} value={form.bookingReferenceNo} readOnly disabled />
          </Field>
          {form.containerType === "2 X 20 FEET CONTAINERS" ? (
            <>
              <Field label="Container Number 1">
                <input className={ac} value={form.containerNumber1} readOnly={!auto} disabled={!auto} onChange={(e) => set("containerNumber1", e.target.value)} />
              </Field>
              <Field label="Container Number 2">
                <input className={ac} value={form.containerNumber2} readOnly={!auto} disabled={!auto} onChange={(e) => set("containerNumber2", e.target.value)} />
              </Field>
            </>
          ) : (
            <Field label="Container Number">
              <input className={ac} value={form.containerNumber} readOnly={!auto} disabled={!auto} onChange={(e) => set("containerNumber", e.target.value)} />
            </Field>
          )}
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
              <GlassSelect
                aria-label="Assigned Vehicle"
                placeholder="Select truck"
                value={form.vehicleId}
                onChange={(v) => set("vehicleId", v)}
                options={trucks.map((t) => ({ value: t.truckId, label: `${t.registrationNumber} (${t.truckId})` }))}
              />
            ) : (
              <input className={roClass} value={displayVehicle} readOnly disabled />
            )}
          </Field>
          <Field label="Assigned Driver">
            {auto ? (
              <GlassSelect
                aria-label="Assigned Driver"
                placeholder="Select driver"
                value={form.driverId}
                onChange={(v) => set("driverId", v)}
                options={drivers.map((d) => ({ value: d.driverId, label: `${d.name} (${d.driverId})` }))}
              />
            ) : (
              <input className={roClass} value={displayDriver} readOnly disabled />
            )}
          </Field>
          <Field label="Booking Date">
            {auto ? (
              <DatePickerInput value={form.bookingDate} onChange={(v) => set("bookingDate", v)} clearable={false} />
            ) : (
              <input className={roClass} value={form.bookingDate ? form.bookingDate.split("-").reverse().join("-") : ""} readOnly disabled />
            )}
          </Field>
          <Field label="Trip Scheduled Date">
            {auto ? (
              <DatePickerInput value={form.tripScheduledDate} onChange={(v) => set("tripScheduledDate", v)} clearable={false} />
            ) : (
              <input className={roClass} value={form.tripScheduledDate ? form.tripScheduledDate.split("-").reverse().join("-") : ""} readOnly disabled />
            )}
          </Field>
          <Field label="Trip Completed Date">
            {auto ? (
              <DatePickerInput value={form.tripCompletedDate} onChange={(v) => set("tripCompletedDate", v)} clearable={false} />
            ) : (
              <input className={roClass} value={form.tripCompletedDate ? form.tripCompletedDate.split("-").reverse().join("-") : ""} readOnly disabled />
            )}
          </Field>
          <Field label="Trip Closed Date">
            <input className={roClass} value={closure?.closedAt ? closure.closedAt.split("-").reverse().join("-") : ""} readOnly disabled placeholder="Auto-fetched on close" />
          </Field>
          <Field label="Date of Trip Sheet Entry">
            <input
              type="text"
              readOnly
              disabled
              value={form.tripSheetDate ? form.tripSheetDate.split("-").reverse().join("-") : "—"}
              className={`${inputClass} cursor-not-allowed bg-fill-1 text-text-secondary`}
              title="Auto-set to today when first opened — cannot be changed"
            />
            <span className="mt-1 text-xs text-text-tertiary">Auto-set to today. Non-editable.</span>
          </Field>
        </div>

        {/* ── 2. Route Information ── */}
        <p className={sh}>Route Information</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="From">
            <input className={ac} value={form.from} readOnly={!auto} disabled={!auto} onChange={(e) => set("from", e.target.value)} />
          </Field>
          <Field label="To">
            <input className={ac} value={form.to} readOnly={!auto} disabled={!auto} onChange={(e) => set("to", e.target.value)} />
          </Field>
          <Field label="Approx Distance for this Trip">
            <input
              className={roClass}
              value={trip.approxKm ? `${trip.approxKm} KM` : trip.approxTripDistance ? `${trip.approxTripDistance} KM` : "—"}
              readOnly
              disabled
            />
          </Field>
          <Field label="Clearing Agent">
            <input className={roClass} value={form.clearingAgent} readOnly disabled placeholder="Auto-fetched from trip" />
          </Field>
        </div>

        {/* ── 3. Hire ── */}
        <p className={sh}>Hire</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Hire Amount *">
            <DecimalInput type="number" min="0" className={ac} value={form.hireAmount} readOnly={!auto} disabled={!auto} onChange={(e) => set("hireAmount", e.target.value)} />
          </Field>

          {/* Driver Settlement Preview card */}
          <div className="rounded-xl border border-teal-border bg-teal-surface px-4 py-3.5 flex flex-col gap-2">
            <p className="text-caption-2-semibold text-teal-text">Driver Settlement</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-teal-text">Driver Batta</span>
              <span className="text-body-semibold text-teal-text-strong">{fmt(form.driverPay)}</span>
            </div>
            <div className="h-px bg-teal-surface-strong" />
            <div className="flex items-center justify-between">
              <span className="text-xs text-teal-text">Driver Advance</span>
              <span className="text-body-semibold text-teal-text-strong">
                {form.driverAdvance ? `₹${Number(form.driverAdvance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "₹0.00"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-teal-text">Additional Advance</span>
              <span className="text-body-semibold text-teal-text-strong">
                {form.additionalDriverAdvance ? `₹${Number(form.additionalDriverAdvance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "₹0.00"}
              </span>
            </div>
          </div>
        </div>

        {/* ── 4. Trip Distance & Cargo ── */}
        <p className={sh}>Trip Distance & Cargo</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Start km *">
            <DecimalInput type="number" min="0" className={fc} value={form.startKm} readOnly={ro} disabled={ro} onChange={(e) => set("startKm", e.target.value)} placeholder="e.g. 84000" />
            {startKmTooLow && (
              <p className="mt-1 text-xs text-danger-text">
                Below current odometer ({Number(currentTruck!.odometer).toLocaleString()} km). Please Check the Value.
              </p>
            )}
            {startKmChecks.map((w) => <p key={w.message} className="mt-1 text-xs text-warning-text">{w.message}</p>)}
            {!ro && kmCheck?.previous && startKmChecks.length === 0 && (
              <p className="mt-1 text-xs text-text-tertiary">
                Previous trip {kmCheck.previous.tripCode}{kmCheck.previous.date ? ` (${formatDate(kmCheck.previous.date)})` : ""} ended at {kmCheck.previous.endKm.toLocaleString("en-IN")} km
              </p>
            )}
          </Field>
          <Field label="End km *">
            <DecimalInput type="number" min="0" className={fc} value={form.endKm} readOnly={ro} disabled={ro} onChange={(e) => set("endKm", e.target.value)} placeholder="e.g. 84500" />
            {n(form.endKm) > 0 && n(form.startKm) > 0 && n(form.endKm) <= n(form.startKm) && (
              <p className="mt-1 text-xs text-danger-text">End Km must be greater than Start Km.</p>
            )}
            {endKmWarning && <p className="mt-1 text-xs text-warning-text">{endKmWarning}</p>}
            {endKmChecks.map((w) => <p key={w.message} className="mt-1 text-xs text-warning-text">{w.message}</p>)}
            {!ro && kmCheck?.odometerNote && <p className="mt-1 text-xs text-accent-text">{kmCheck.odometerNote}</p>}
          </Field>
          <Field label="Total km *">
            <DecimalInput type="number" className={`${fc} bg-fill-1`} value={form.totalKm} readOnly placeholder="Auto-calculated" />
          </Field>
          <Field label="Cargo Weight (tons)">
            <input className={ac} value={form.cargoWeight} readOnly={!auto} disabled={!auto} onChange={(e) => set("cargoWeight", e.target.value)} placeholder="Auto-fetched from trip" />
          </Field>
          {form.containerType === "OPEN LOAD CARGO" && (
            <Field label="Open Load Hire Type">
              <input className={roClass} value={form.openLoadHireType || "Ton Based"} readOnly disabled placeholder="Auto-fetched from trip" />
            </Field>
          )}
          {form.containerType === "OPEN LOAD CARGO" && (form.openLoadHireType === "Ton Based" || !form.openLoadHireType) && (
            <Field label="Rate per Ton (₹)">
              <input className={roClass} value={form.ratePerTon} readOnly disabled placeholder="Auto-fetched from trip" />
              {form.ratePerTon && form.cargoWeight && (
                <p className="mt-1 text-xs text-text-tertiary">
                  {form.cargoWeight} tons × ₹{form.ratePerTon}/ton = ₹{(parseFloat(form.cargoWeight) * parseFloat(form.ratePerTon)).toLocaleString("en-IN")}
                </p>
              )}
            </Field>
          )}
        </div>

        {/* ── 4b. Diesel Entry ── */}
        <div className="flex items-center justify-between">
          <p className={sh}>Diesel Entry</p>
          {!ro && (
            <button
              type="button"
              onClick={addDieselEntry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent-border-strong bg-accent-surface px-3 py-1.5 text-caption-1-semibold text-accent-text hover:bg-accent-surface-strong transition-colors"
            >
              <PlusCircle className="h-3.5 w-3.5" /> Add Fill
            </button>
          )}
        </div>
        {/* Last recorded fill for this truck — reference for spotting odometer gaps */}
        {lastFuelLog && (() => {
          const lastOdo  = Number(lastFuelLog.odometer);
          const startOdo = Number(form.startKm);
          const gap      = startOdo > 0 ? startOdo - lastOdo : null;
          const hugeGap  = gap !== null && Math.abs(gap) > 5000;
          return (
            <div className={`rounded-xl border px-4 py-3 text-sm ${hugeGap ? "border-warning-border-strong bg-warning-surface" : "border-purple-border bg-purple-surface"}`}>
              <p className={`text-caption-2-semibold mb-2 ${hugeGap ? "text-warning-text" : "text-purple-text"}`}>
                Last Recorded Fill for this Truck
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                <div>
                  <span className="text-[10px] text-text-tertiary">Date</span>
                  <p className="font-semibold text-text-primary">{formatDate(lastFuelLog.date)}</p>
                </div>
                <div>
                  <span className="text-[10px] text-text-tertiary">Odometer</span>
                  <p className="font-semibold text-text-primary">{lastOdo.toLocaleString("en-IN")} km</p>
                </div>
                <div>
                  <span className="text-[10px] text-text-tertiary">Fuel Filled</span>
                  <p className="font-semibold text-text-primary">{Number(lastFuelLog.litres).toFixed(1)} L</p>
                </div>
                {lastFuelLog.fuelStation && (
                  <div>
                    <span className="text-[10px] text-text-tertiary">Station</span>
                    <p className="font-semibold text-text-primary">{lastFuelLog.fuelStation}</p>
                  </div>
                )}
              </div>
              {gap !== null && (
                <p className={`mt-2 text-caption-1-medium ${hugeGap ? "text-warning-text-strong" : "text-purple-text"}`}>
                  Distance since last fill: <span className="font-semibold">{gap.toLocaleString("en-IN")} km</span>
                  {hugeGap && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-2 py-0.5 text-caption-2-semibold text-warning-text-strong">
                      <WarnIcon className="size-3.5" />Unusually large gap — please verify the Start KM
                    </span>
                  )}
                </p>
              )}
            </div>
          );
        })()}

        <div className="flex flex-col gap-5">
          {form.dieselEntries.map((entry, idx) => (
            <div key={idx} className="rounded-xl border border-separator-border bg-fill-1 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-caption-1-semibold text-text-secondary">
                  Fill #{idx + 1}
                </span>
                {!ro && form.dieselEntries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDieselEntry(idx)}
                    className="inline-flex items-center gap-1 text-xs text-danger-text hover:text-danger-text"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
                {!ro && form.dieselEntries.length === 1 && fillTouched(entry) && (
                  <button
                    type="button"
                    onClick={() => clearDieselEntry(idx)}
                    className="inline-flex items-center gap-1 text-xs text-danger-text hover:text-danger-text"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear
                  </button>
                )}
              </div>
              {/* Whether this fill will reach Fuel History (litres > 0) */}
              {!ro && (
                fillRecorded(entry) ? (
                  <p className={`mb-3 text-xs ${n(entry.totalCost) > 0 ? "text-success-text" : "text-warning-text"}`}>
                    {n(entry.totalCost) > 0
                      ? "Will be added to Fuel History when you save."
                      : "Will be added to Fuel History — but enter Cost Per Litre, or it's recorded at ₹0."}
                  </p>
                ) : (
                  <p className="mb-3 text-xs text-text-tertiary">
                    Not recorded — enter Quantity (Litres) to add this fill to Fuel History.
                  </p>
                )
              )}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Date">
                  <DatePickerInput
                    value={entry.date}
                    onChange={(v) => updateDieselEntry(idx, "date", v)}
                    disabled={ro}
                  />
                </Field>
                <Field label="Odometer Reading">
                  <DecimalInput
                    type="number" min="0"
                    className={fc}
                    value={entry.odometer}
                    readOnly={ro} disabled={ro}
                    onChange={(e) => updateDieselEntry(idx, "odometer", e.target.value)}
                    placeholder="e.g. 102500"
                  />
                </Field>
                <Field label="Quantity (Litres)">
                  <DecimalInput
                    type="number" min="0" step="0.01"
                    className={fc}
                    value={entry.litres}
                    readOnly={ro} disabled={ro}
                    onChange={(e) => updateDieselEntry(idx, "litres", e.target.value)}
                    placeholder="e.g. 80.00"
                  />
                </Field>
                <Field label="Cost Per Litre (₹)">
                  <DecimalInput
                    type="number" min="0" step="0.01"
                    className={fc}
                    value={entry.costPerLitre}
                    readOnly={ro} disabled={ro}
                    onChange={(e) => updateDieselEntry(idx, "costPerLitre", e.target.value)}
                    placeholder="e.g. 96.50"
                  />
                </Field>
                <Field label="Total Fuel Cost (₹)">
                  <DecimalInput
                    type="number" min="0"
                    className={`${fc} bg-background-primary-default`}
                    value={entry.totalCost}
                    readOnly={!!(entry.litres && entry.costPerLitre) || ro}
                    onChange={(e) => updateDieselEntry(idx, "totalCost", e.target.value)}
                    placeholder="Auto-calculated"
                  />
                  {n(entry.litres) > 0 && n(entry.costPerLitre) > 0 && (
                    <p className="mt-1 text-xs text-text-tertiary">
                      {entry.litres} L × ₹{entry.costPerLitre}/L = ₹{n(entry.totalCost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </Field>
                <Field label="Fuel Station">
                  {ro ? (
                    <input className={fc} value={entry.fuelStation} readOnly />
                  ) : (
                    <GlassCombobox
                      value={entry.fuelStation}
                      onChange={(v) => updateDieselEntry(idx, "fuelStation", v)}
                      options={fuelStations.map((s) => ({ value: s, label: s }))}
                      placeholder="e.g. Reliance Petrol Pump"
                    />
                  )}
                </Field>
              </div>
            </div>
          ))}
          {form.dieselEntries.length > 1 && (
            <div className="rounded-lg border border-accent-border bg-accent-surface px-4 py-2 text-body-semibold text-accent-text-strong">
              Total Diesel Cost: ₹{form.dieselEntries.reduce((sum, e) => sum + n(e.totalCost), 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>

        {/* ── 5. Halt Information ── */}
        <p className={sh}>Halt Information</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Company Halt Days (Driver)">
            <input className={roClass} value={companyHaltDays > 0 ? String(companyHaltDays) : ""} readOnly disabled placeholder="Auto-fetched" />
            <p className="mt-1 text-xs text-text-tertiary">Included in trip expenses</p>
          </Field>
          <Field label="Company Halt Pay (₹)">
            <input className={roClass} value={companyHaltPay > 0 ? companyHaltPay.toFixed(2) : ""} readOnly disabled placeholder="Auto-calculated" />
          </Field>
          <Field label="Party Halt Days (Customer)">
            <input className={`${roClass} ${partyHaltDays > 0 ? "border-warning-border bg-warning-surface text-warning-text" : ""}`} value={partyHaltDays > 0 ? String(partyHaltDays) : ""} readOnly disabled placeholder="Auto-fetched" />
            <p className="mt-1 text-xs text-warning-text">Not included in trip expenses — recoverable from customer</p>
          </Field>
          <Field label="Party Halt Pay (₹)">
            <input className={`${roClass} ${partyHaltPay > 0 ? "border-warning-border bg-warning-surface text-warning-text" : ""}`} value={partyHaltPay > 0 ? partyHaltPay.toFixed(2) : ""} readOnly disabled placeholder="Auto-calculated" />
          </Field>
          <Field label="Halt Remarks" className="sm:col-span-2">
            <input className={roClass} value={haltRemarks} readOnly disabled placeholder="Auto-fetched" />
          </Field>
        </div>

        {/* ── 7. Trip Expenses ── */}
        <p className={sh}>Trip Expenses</p>

        <p className={subsh}>Port & Operational Charges</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Port Pass Expense (பாஸ்) *">
            <DecimalInput type="number" min="0" className={fc} value={form.portPassExpense} readOnly={ro} disabled={ro} onChange={(e) => set("portPassExpense", e.target.value)} placeholder="e.g. 500" />
          </Field>
          <Field label="Weight Sheet Expense (எடை) *">
            <DecimalInput type="number" min="0" className={fc} value={form.weightSheetExpense} readOnly={ro} disabled={ro} onChange={(e) => set("weightSheetExpense", e.target.value)} placeholder="e.g. 200" />
          </Field>
          <Field label="Mamol Expense (இறக்கு / ஏற்று மாமூல்) *">
            <DecimalInput type="number" min="0" className={fc} value={form.mamolExpense} readOnly={ro} disabled={ro} onChange={(e) => set("mamolExpense", e.target.value)} placeholder="e.g. 300" />
          </Field>
          <Field label="Claimable Mamol Expense *">
            <DecimalInput type="number" min="0" className={fc} value={form.claimableMamolExpense} readOnly={ro} disabled={ro} onChange={(e) => set("claimableMamolExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
        </div>

        <p className={subsh}>Government & Compliance</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Traffic, RTO / Police Expense *">
            <DecimalInput type="number" min="0" className={fc} value={form.trafficRtoExpense} readOnly={ro} disabled={ro} onChange={(e) => set("trafficRtoExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
        </div>

        <p className={subsh}>Loading & Handling</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Lift On / Off (லிப்டான்) *">
            <DecimalInput type="number" min="0" className={fc} value={form.liftOnOffExpense} readOnly={ro} disabled={ro} onChange={(e) => set("liftOnOffExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
          <Field label="Crane Operator Expense *">
            <DecimalInput type="number" min="0" className={fc} value={form.craneOperatorExpense} readOnly={ro} disabled={ro} onChange={(e) => set("craneOperatorExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
          <Field label="Parking Expenses *">
            <DecimalInput type="number" min="0" className={fc} value={form.parkingExpense} readOnly={ro} disabled={ro} onChange={(e) => set("parkingExpense", e.target.value)} placeholder="e.g. 0" />
          </Field>
        </div>

        <p className={subsh}>Major Repairs</p>
        {!ro && repairTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {repairTypes.map((rt) => (
              <button
                key={rt.id}
                type="button"
                onClick={() => set("majorRepairs", [...form.majorRepairs, {
                  name: rt.name,
                  date: form.tripSheetDate || "",
                  odometer: form.endKm || "",
                  description: "",
                  cost: rt.defaultCost !== "0" ? rt.defaultCost : "",
                }])}
                className="rounded-full border border-accent-border bg-accent-surface px-3 py-1 text-caption-1-medium text-accent-text hover:bg-accent-surface-strong transition-colors"
              >
                + {rt.name}
              </button>
            ))}
          </div>
        )}
        {form.majorRepairs.map((repair, idx) => {
          const upd = (patch: Partial<typeof repair>) => {
            set("majorRepairs", form.majorRepairs.map((r, i) => i === idx ? { ...r, ...patch } : r));
          };
          return (
            <div key={idx} className="rounded-xl border border-orange-border bg-orange-surface/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-caption-1-semibold text-orange-text">Repair {idx + 1}</span>
                {!ro && (
                  <button
                    type="button"
                    onClick={() => set("majorRepairs", form.majorRepairs.filter((_, i) => i !== idx))}
                    className="rounded-lg border border-danger-border px-2.5 py-1 text-xs text-danger-text hover:bg-danger-surface-strong transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Maintenance Type *">
                  <input
                    type="text"
                    className={fc}
                    value={repair.name}
                    readOnly={ro} disabled={ro}
                    onChange={(e) => upd({ name: e.target.value })}
                    placeholder="e.g. Engine overhaul"
                  />
                </Field>
                <Field label="Date *">
                  <input
                    type="date"
                    className={fc}
                    value={repair.date}
                    readOnly={ro} disabled={ro}
                    onChange={(e) => upd({ date: e.target.value })}
                  />
                </Field>
                <Field label="Odometer (km) *">
                  <DecimalInput
                    type="number"
                    min="0"
                    className={fc}
                    value={repair.odometer}
                    readOnly={ro} disabled={ro}
                    onChange={(e) => upd({ odometer: e.target.value })}
                    placeholder="e.g. 125000"
                  />
                </Field>
                <Field label="Cost (₹) *">
                  <DecimalInput
                    type="number"
                    min="0"
                    className={fc}
                    value={repair.cost}
                    readOnly={ro} disabled={ro}
                    onChange={(e) => upd({ cost: e.target.value })}
                    placeholder="e.g. 0"
                  />
                </Field>
              </div>
              <Field label="Description">
                <input
                  type="text"
                  className={fc}
                  value={repair.description}
                  readOnly={ro} disabled={ro}
                  onChange={(e) => upd({ description: e.target.value })}
                  placeholder="Details about the repair"
                />
              </Field>
            </div>
          );
        })}
        {!ro && (
          <button
            type="button"
            onClick={() => set("majorRepairs", [...form.majorRepairs, {
              name: "",
              date: form.tripSheetDate || "",
              odometer: form.endKm || "",
              description: "",
              cost: "",
            }])}
            className="self-start rounded-lg border border-accent-border px-3 py-1.5 text-caption-1-medium text-accent-text hover:bg-accent-surface-strong"
          >
            + Add Repair
          </button>
        )}
        {(form.majorRepairs || []).length > 0 && (
          <div className="rounded-xl border border-orange-border bg-orange-surface px-4 py-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-body-semibold text-orange-text-strong">Major Repairs Total</span>
              <span className="text-body-semibold text-orange-text-strong">
                {fmt(String((form.majorRepairs || []).reduce((sum, r) => sum + n(r.cost), 0)))}
              </span>
            </div>
            <p className="text-xs text-orange-text leading-relaxed">
              Note: These maintenance charges will be recorded for this truck but will not be included in the cost of this trip.
              Each repair goes to Maintenance Approvals first and is added to the truck&apos;s record once Admin or Accounts approves it.
            </p>
          </div>
        )}

        <p className={subsh}>Miscellaneous</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Other Expenses *">
            <DecimalInput type="number" min="0" className={fc} value={form.otherExpenses} readOnly={ro} disabled={ro} onChange={(e) => set("otherExpenses", e.target.value)} placeholder="e.g. 0" />
            <p className="mt-1 text-xs text-warning-text">Note: Please don&apos;t add maintenance charges here.</p>
          </Field>
        </div>

        {/* ── 8. Toll Details ── */}
        <p className={sh}>Toll Details</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Toll Charges (டோல்) *">
            <DecimalInput type="number" min="0" className={fc} value={form.tollCharges} readOnly={ro} disabled={ro} onChange={(e) => set("tollCharges", e.target.value)} placeholder="e.g. 1200" />
          </Field>
        </div>

        {/* ── 8. Driver Settlement ── */}
        <p className={sh}>Driver Settlement</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {(() => {
            if (!trip?.advanceCorrectedAmount || trip?.advanceVerified !== false) return null;
            const corrected   = parseFloat(String(trip.advanceCorrectedAmount)) || 0;
            const recorded    = parseFloat(String(closure?.driverAdvance || 0)) || 0;
            if (Math.abs(corrected - recorded) < 0.01) return null;
            const current   = (parseFloat(form.driverAdvance) || 0) + (parseFloat(form.additionalDriverAdvance) || 0);
            if (corrected > 0 && Math.abs(current - corrected) < 0.01) return null;
            return (
              <div className="sm:col-span-3 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-surface px-4 py-3">
                <WarnIcon className="mt-0.5 size-4 shrink-0 text-warning-text" />
                <div className="text-sm text-warning-text-strong">
                  <p className="font-semibold">Advance Mismatch Recorded by Yard Supervisor</p>
                  <p className="mt-0.5">
                    Advance paid to driver was recorded as{" "}
                    <span className="font-semibold">₹{Number(closure?.driverAdvance || 0).toLocaleString("en-IN")}</span>,
                    but the correct amount noted is{" "}
                    <span className="font-semibold text-warning-text-strong">₹{corrected.toLocaleString("en-IN")}</span>.
                    Update the advance fields below to match.
                    {trip.advanceVerificationRemark && (
                      <span className="block mt-0.5 text-warning-text">Remark: {trip.advanceVerificationRemark}</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })()}
          <Field label="Driver Batta Amount (₹)">
            <DecimalInput
              type="number"
              min="0"
              className={fc}
              value={form.driverPay}
              readOnly={ro}
              onChange={(e) => set("driverPay", e.target.value)}
              placeholder="e.g. 1000"
            />
            {(() => {
              if (form.driverCompensationType === "CUSTOM") return <p className="mt-1 text-xs text-text-tertiary">Custom batta amount based on compensation type.</p>;
              if (form.driverCompensationType === "PER KM" && n(form.totalKm) > 0) return <p className="mt-1 text-xs text-text-tertiary">Per-km rate × {n(form.totalKm).toLocaleString()} km. Edit to set amount.</p>;
              return <p className="mt-1 text-xs text-text-tertiary">Batta paid to driver for this trip.</p>;
            })()}
          </Field>
          <Field label="Driver Advance (₹)">
            <DecimalInput
              type="number"
              min="0"
              className={fc}
              value={form.driverAdvance}
              readOnly={ro} disabled={ro}
              onChange={(e) => updateAdvanceField("driver", e.target.value)}
              placeholder="e.g. 2000"
            />
            <p className="mt-1 text-xs text-text-tertiary">Advance paid at trip assignment.</p>
          </Field>
          <Field label="Initial Disbursed Advance (₹)">
            <input
              type="text"
              inputMode="decimal"
              className={fc}
              value={localInitialDisbursedAdvance}
              readOnly={ro} disabled={ro}
              onChange={(e) => handleInitialDisbursedChange(e.target.value)}
              onKeyDown={(e) => { if (["-", "+", "e", "E"].includes(e.key)) e.preventDefault(); }}
              placeholder="e.g. 500"
            />
            <p className="mt-1 text-xs text-text-tertiary">
              Actual amount disbursed to driver — must be less than Driver Advance
              {form.driverAdvance ? ` (₹${parseFloat(form.driverAdvance).toLocaleString("en-IN")})` : ""}.
              Leave blank if the full advance was sent.
              {localInitialDisbursedAdvance && (
                <span className="ml-1 font-semibold text-accent-text">
                  Balance uses ₹{parseFloat(localInitialDisbursedAdvance).toLocaleString("en-IN", { minimumFractionDigits: 2 })} as advance.
                </span>
              )}
            </p>
          </Field>
          <Field label="Additional Driver Advance (₹)">
            <DecimalInput
              type="number"
              min="0"
              className={fc}
              value={form.additionalDriverAdvance}
              readOnly={ro} disabled={ro}
              onChange={(e) => updateAdvanceField("additional", e.target.value)}
              placeholder="e.g. 500"
            />
            <p className="mt-1 text-xs text-text-tertiary">Extra advance paid during the trip.</p>
          </Field>
          <Field label="Driver Balance">
            <DecimalInput type="number" className={`${fc} bg-fill-1 font-semibold`} value={form.driverBalance} readOnly placeholder="Auto-calculated" />
            {(() => {
              const bal = n(form.driverBalance);
              const amt = `₹${Math.abs(bal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
              if (bal > 0)  return <p className="mt-1 text-caption-1-medium text-success-text">Company owes {amt} to the driver.</p>;
              if (bal < 0)  return <p className="mt-1 text-caption-1-medium text-warning-text">Driver owes {amt} to the company.</p>;
              if (n(form.driverAdvanceAmount) > 0) return <p className="mt-1 text-xs text-text-tertiary">Settled — expenses equal advance.</p>;
              return null;
            })()}
          </Field>
        </div>

        {/* ── 9. Expense Summary ── */}
        <p className={sh}>Expense Summary</p>
        <div className="rounded-xl border border-separator-border overflow-hidden text-sm">
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
              <div key={label} className={`flex justify-between items-center px-4 py-2.5 border-b border-separator-border ${amt === 0 ? "text-text-tertiary" : "text-text-primary"}`}>
                <span>{label}</span>
                <span className={amt > 0 ? "font-semibold" : ""}>{fmt(value)}</span>
              </div>
            );
          })}
          <div className="bg-fill-1 px-4 py-3 flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="font-semibold text-accent-text">Trip Expenses</span>
              <span className="font-semibold text-accent-text">{fmt(form.tripExpensesTotal)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span className="font-medium">Driver Expenses <span className="text-caption-1-regular text-text-tertiary">(out-of-pocket)</span></span>
              <span className="font-medium">{fmt(form.driverExpensesTotal)}</span>
            </div>
            <div className="flex justify-between border-t border-separator-border pt-2 mt-0.5">
              <span className="text-success-text text-headline-semibold">Total Expense</span>
              <span className="text-success-text text-headline-semibold">{fmt(form.totalExpense)}</span>
            </div>
          </div>
        </div>

        {partyHaltPay > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-warning-border-strong bg-warning-surface px-4 py-3">
            <WarnIcon className="mt-0.5 size-4 shrink-0 text-warning-text" />
            <p className="text-sm text-warning-text-strong">
              <span className="font-semibold">Party Halt has been mentioned</span> — make sure to pay{" "}
              <span className="font-semibold">₹{partyHaltPay.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>{" "}
              to the Driver for {partyHaltDays} party halt {partyHaltDays === 1 ? "day" : "days"} (this amount is recoverable from the customer).
            </p>
          </div>
        )}

        {/* ── 10. Invoicing (RETURN TRIP only) ── */}
        {form.tripType === "RETURN TRIP" && !ro && (
          <>
            <p className={sh}>Invoicing</p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <span className="text-body-medium text-text-primary">Is this trip to be Invoiced?</span>
                <div className="inline-flex rounded-lg border border-separator-border overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setInvoiceRequired(true)}
                    className={`px-6 py-2 text-body-semibold transition-colors ${invoiceRequired ? "bg-accent-solid text-on-solid" : "bg-background-primary-default text-text-secondary hover:bg-fill-2"}`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceRequired(false)}
                    className={`px-6 py-2 text-body-semibold transition-colors border-l border-separator-border ${!invoiceRequired ? "bg-warning-solid text-on-solid" : "bg-background-primary-default text-text-secondary hover:bg-fill-2"}`}
                  >
                    No
                  </button>
                </div>
              </div>
              {invoiceRequired ? (
                <div className="flex items-start gap-2 rounded-lg border border-accent-border bg-accent-surface px-4 py-3">
                  <span className="mt-0.5 text-accent-text text-sm">ℹ</span>
                  <p className="text-sm text-accent-text-strong">
                    <span className="font-semibold">Invoice Required — </span>
                    After verification this trip will be available for invoicing on the <span className="font-semibold">Verification &amp; Invoicing</span> page before going to Trip History.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-surface px-4 py-3">
                  <WarnIcon className="mt-0.5 size-4 shrink-0 text-warning-text" />
                  <p className="text-sm text-warning-text-strong">
                    <span className="font-semibold">No Invoice — </span>
                    This trip will be verified on the <span className="font-semibold">Verification &amp; Invoicing</span> page but will <span className="font-semibold">skip invoicing</span> and go directly to <span className="font-semibold">Trip History</span>.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── 11. Remarks ── */}
        <p className={sh}>Remarks</p>
        <Field label="Remarks *">
          <textarea rows={3} className={fc} value={form.remarks} readOnly={ro} disabled={ro}
            onChange={(e) => set("remarks", e.target.value)}
            placeholder="Any additional notes…" />
        </Field>

        <div className="flex justify-end gap-3 border-t border-separator-border pt-4">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-secondary hover:bg-fill-2">
            {ro ? "Close" : "Cancel"}
          </button>
          {!ro && (
            <button type="submit" disabled={saving}
              className="rounded-lg bg-accent-solid px-5 py-2 text-body-semibold text-on-solid hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? "Saving…" : "Save Trip Sheet"}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
