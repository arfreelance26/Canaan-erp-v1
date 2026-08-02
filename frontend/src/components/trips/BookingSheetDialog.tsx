"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { Branch } from "@/types/branch";
import type { TripClosureData, PaymentMode, BillTo } from "@/types/trip-closure";
import {
  MOVEMENT_CATEGORY_OPTIONS,
  TRIP_CATEGORY_OPTIONS,
  CARGO_CLASSIFICATION_OPTIONS,
  CONTAINER_SPECIFICATION_OPTIONS,
  CARGO_WEIGHT_OPTIONS,
  PAYMENT_TYPE_OPTIONS,
  DRIVER_ADVANCE_PAYMENT_METHOD_OPTIONS,
  DRIVER_COMPENSATION_TYPE_OPTIONS,
  BILL_TO_OPTIONS as TRIP_BILL_TO_OPTIONS,
} from "@/lib/trip-data";
import { branchesApi, tripsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/swal";
import { DecimalInput } from "@/components/ui/DecimalInput";

const PAYMENT_MODE_OPTIONS: PaymentMode[] = ["Cash", "UPI", "Bank Transfer", "Cheque", "NEFT / RTGS"];
const BILL_TO_OPTIONS: BillTo[] = ["CUSTOMER"];

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

const roClass = "w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-not-allowed";
const sh = "text-xs font-semibold uppercase tracking-wider text-blue-900 bg-blue-50 px-3 py-2 rounded-lg";

type Props = {
  open: boolean;
  trip: Trip | null;
  closure: TripClosureData | undefined;
  driver: Driver | undefined;
  truck: Truck | undefined;
  customers: Customer[];
  /** Full lists for the typable vehicle / driver dropdowns (edit mode) */
  drivers?: Driver[];
  trucks?: Truck[];
  readOnly: boolean;
  onClose: () => void;
  onSubmit: (data: TripClosureData) => void;
};

export function BookingSheetDialog({ open, trip, closure, driver, truck, customers, drivers = [], trucks = [], readOnly, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<TripClosureData | null>(null);
  const [tripForm, setTripForm] = useState<Trip | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [saving, setSaving] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (justOpened) {
      setForm(closure ? { ...closure } : {
        tripId: "", bookingNo: "", containerNo: "", releaseOrderNo: "",
        containerType: "", line: "", loadType: "", movementCategory: "",
        vehicleId: "", driverId: "", assignmentDate: "",
        fromLocation: "", toLocation: "", tripCompletedDate: "",
        hireAmount: "", transportAmount: "", billingAmount: "",
        advanceAmount: "", driverAdvance: "", additionalDriverAdvance: "",
        paymentMode: "", billTo: "",
        companyHaltDays: "", partyHaltDays: "", haltRemarks: "", driverHaltCompensation: "",
        closedAt: "",
      });
    }
    if (justOpened && trip) {
      setTripForm({ ...trip });
    }
    if (!open) { setForm(null); setTripForm(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closure, trip]);

  useEffect(() => {
    if (readOnly || !tripForm) return;
    const rule = BATTA_RULES[tripForm.tripCategory ?? ""]?.[tripForm.containerSpecification ?? ""];
    if (rule) {
      setTripForm((prev) => prev ? {
        ...prev,
        driverCompensationType: rule.type as Trip["driverCompensationType"],
        driverAdvanceAmount: rule.amount,
      } : prev);
    }
  }, [tripForm?.tripCategory, tripForm?.containerSpecification, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  function update<K extends keyof TripClosureData>(key: K, value: TripClosureData[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateTrip<K extends keyof Trip>(key: K, value: Trip[K]) {
    setTripForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    if (!readOnly && tripForm && trip) {
      setSaving(true);
      try {
        await tripsApi.update(trip.id, tripForm);
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : "Failed to save trip details.");
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    onSubmit(form);
  }

  const truckBranch = branches.find((b) => b.name === truck?.branchRegisteredTo);
  const totalHaltDays = Number(form?.companyHaltDays || 0) + Number(form?.partyHaltDays || 0);

  if (!trip || !form) return null;

  const fc = readOnly ? roClass : inputClass;
  const tf = tripForm ?? trip;
  const customer = customers.find((c) => c.id === tf.customerId);

  // Resolve container number display based on spec
  const containerSpec = tf.containerSpecification ?? "";
  const haltDayRate = truckBranch
    ? (containerSpec === "40 FT CONTAINER"
        ? Number(truckBranch.haltDayFee40ft || 0)
        : Number(truckBranch.haltDayFee20ft || 0))
    : 0;
  const haltCompensation = totalHaltDays > 0 ? totalHaltDays * haltDayRate : 0;
  const battaRule = !readOnly ? BATTA_RULES[tf.tripCategory ?? ""]?.[tf.containerSpecification ?? ""] : undefined;
  const containerDisplay =
    containerSpec === "2 X 20 FEET CONTAINERS"
      ? [tf.containerNumber1, tf.containerNumber2].filter(Boolean).join(" / ")
      : containerSpec === "OPEN LOAD CARGO"
      ? tf.cargoReference ?? ""
      : tf.containerNumber ?? "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={readOnly ? `View Booking Sheet — ${trip.tripId}` : `Edit Booking Sheet — ${trip.tripId}`}
      className="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* ── Part 1: Trip Information (from Assign Trip form — always read-only) ── */}

        {/* Booking Information */}
        <section className="flex flex-col gap-4">
          <p className={sh}>Booking Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Booking Reference No">
              <input readOnly disabled value={trip.bookingReferenceNo ?? ""} className={roClass} />
            </Field>
            <Field label="Booking Created Date">
              <DatePickerInput value={tf.bookingCreatedDate ?? ""} disabled={readOnly} onChange={(v) => updateTrip("bookingCreatedDate", v)} className={fc} />
            </Field>
            <Field label="Trip Category">
              {readOnly ? (
                <input readOnly disabled value={tf.tripCategory ?? ""} className={roClass} />
              ) : (
                <GlassSelect
                  value={tf.tripCategory ?? ""}
                  onChange={(val) => updateTrip("tripCategory", val as Trip["tripCategory"])}
                  options={[{ value: "", label: "Select trip category" }, ...TRIP_CATEGORY_OPTIONS.map((o) => ({ value: o, label: o }))]}
                />
              )}
            </Field>
            <Field label="Movement Category">
              {readOnly ? (
                <input readOnly disabled value={tf.movementCategory ?? ""} className={roClass} />
              ) : (
                <GlassSelect
                  value={tf.movementCategory ?? ""}
                  onChange={(val) => updateTrip("movementCategory", val as Trip["movementCategory"])}
                  options={[{ value: "", label: "Select movement category" }, ...MOVEMENT_CATEGORY_OPTIONS.map((o) => ({ value: o, label: o }))]}
                />
              )}
            </Field>
          </div>
        </section>

        {/* Customer Information */}
        <section className="flex flex-col gap-4">
          <p className={sh}>Customer Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Customer Account">
              {readOnly ? (
                <input readOnly disabled value={customer?.name ?? tf.customerId ?? ""} className={roClass} />
              ) : (
                <GlassCombobox
                  value={tf.customerId}
                  onChange={(val) => updateTrip("customerId", val)}
                  options={customers.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Select a customer"
                />
              )}
            </Field>
            <Field label="Shipper / Consignee">
              <input
                readOnly={readOnly} disabled={readOnly}
                value={tf.shipperConsignee ?? ""}
                onChange={(e) => updateTrip("shipperConsignee", e.target.value)}
                className={fc}
              />
            </Field>
          </div>
        </section>

        {/* Cargo Information */}
        <section className="flex flex-col gap-4">
          <p className={sh}>Cargo Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Container Specification">
              {readOnly ? (
                <input readOnly disabled value={containerSpec} className={roClass} />
              ) : (
                <GlassSelect
                  value={containerSpec}
                  onChange={(val) => updateTrip("containerSpecification", val as Trip["containerSpecification"])}
                  options={[{ value: "", label: "Select container specification" }, ...CONTAINER_SPECIFICATION_OPTIONS.map((o) => ({ value: o, label: o }))]}
                />
              )}
            </Field>
            {readOnly ? (
              containerDisplay && (
                <Field label={containerSpec === "OPEN LOAD CARGO" ? "Cargo Reference" : "Container Number(s)"}>
                  <input readOnly disabled value={containerDisplay} className={roClass} />
                </Field>
              )
            ) : containerSpec === "2 X 20 FEET CONTAINERS" ? (
              <>
                <Field label="Container Number (1st)">
                  <input className={fc} value={tf.containerNumber1 ?? ""} onChange={(e) => updateTrip("containerNumber1", e.target.value)} />
                </Field>
                <Field label="Container Number (2nd)">
                  <input className={fc} value={tf.containerNumber2 ?? ""} onChange={(e) => updateTrip("containerNumber2", e.target.value)} />
                </Field>
              </>
            ) : containerSpec === "OPEN LOAD CARGO" ? (
              <Field label="Cargo Reference">
                <input className={fc} value={tf.cargoReference ?? ""} onChange={(e) => updateTrip("cargoReference", e.target.value)} />
              </Field>
            ) : (
              <Field label="Container Number">
                <input className={fc} value={tf.containerNumber ?? ""} onChange={(e) => updateTrip("containerNumber", e.target.value)} />
              </Field>
            )}
            <Field label="Cargo Classification">
              {readOnly ? (
                <input readOnly disabled value={tf.cargoClassification ?? ""} className={roClass} />
              ) : (
                <GlassSelect
                  value={tf.cargoClassification ?? ""}
                  onChange={(val) => updateTrip("cargoClassification", val as Trip["cargoClassification"])}
                  options={[{ value: "", label: "Select cargo classification" }, ...CARGO_CLASSIFICATION_OPTIONS.map((o) => ({ value: o, label: o }))]}
                />
              )}
            </Field>
            <Field label="Release Order Reference">
              <input
                readOnly={readOnly} disabled={readOnly}
                value={tf.releaseOrderReference ?? ""}
                onChange={(e) => updateTrip("releaseOrderReference", e.target.value)}
                className={fc}
              />
            </Field>
            <Field label="Cargo Weight (tons)">
              {readOnly ? (
                <input readOnly disabled value={tf.cargoWeight ?? ""} className={roClass} />
              ) : (
                <GlassSelect
                  value={tf.cargoWeight ?? ""}
                  onChange={(val) => {
                    updateTrip("cargoWeight", val);
                    if (containerSpec === "OPEN LOAD CARGO" && tf.ratePerTon) {
                      const hire = parseFloat(val) * parseFloat(tf.ratePerTon);
                      if (!isNaN(hire) && hire > 0) updateTrip("transportHireAmount", String(hire));
                    }
                  }}
                  options={[{ value: "", label: "Select cargo weight" }, ...CARGO_WEIGHT_OPTIONS.map((o) => ({ value: o, label: o }))]}
                />
              )}
            </Field>
          </div>
        </section>

        {/* Route Information */}
        <section className="flex flex-col gap-4">
          <p className={sh}>Route Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Origin Location">
              <input
                readOnly={readOnly} disabled={readOnly}
                value={tf.origin ?? ""}
                onChange={(e) => updateTrip("origin", e.target.value)}
                className={fc}
              />
            </Field>
            <Field label="Destination Location">
              <input
                readOnly={readOnly} disabled={readOnly}
                value={tf.destination ?? ""}
                onChange={(e) => updateTrip("destination", e.target.value)}
                className={fc}
              />
            </Field>
            <Field label="Approx Distance for this Trip">
              <input
                readOnly
                disabled
                value={tf.approxTripDistance ? `${tf.approxTripDistance} KM` : "—"}
                className={roClass}
              />
            </Field>
          </div>
        </section>

        {/* Shipping Information */}
        <section className="flex flex-col gap-4">
          <p className={sh}>Shipping Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Shipping Line">
              <input
                readOnly={readOnly} disabled={readOnly}
                value={tf.shippingLine ?? ""}
                onChange={(e) => updateTrip("shippingLine", e.target.value)}
                className={fc}
              />
            </Field>
            <Field label="Vessel Name">
              <input
                readOnly={readOnly} disabled={readOnly}
                value={tf.vesselName ?? ""}
                onChange={(e) => updateTrip("vesselName", e.target.value)}
                className={fc}
              />
            </Field>
          </div>
        </section>

        {/* Vehicle & Trip Assignment */}
        <section className="flex flex-col gap-4">
          <p className={sh}>Vehicle &amp; Trip Assignment</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Scheduled Trip Date">
              <DatePickerInput value={tf.scheduledDate ?? ""} disabled={readOnly} onChange={(v) => updateTrip("scheduledDate", v)} className={fc} />
            </Field>
            <Field label="Assigned Vehicle">
              {readOnly ? (
                <input readOnly disabled value={truck?.registrationNumber ?? trip.vehicleId ?? ""} className={roClass} />
              ) : (
                <GlassCombobox
                  value={tf.vehicleId ?? ""}
                  onChange={(val) => updateTrip("vehicleId", val)}
                  options={trucks.map((t) => ({ value: t.truckId, label: t.registrationNumber }))}
                  placeholder="Type truck number to search…"
                />
              )}
            </Field>
            <Field label="Assigned Driver">
              {readOnly ? (
                <input readOnly disabled value={driver?.name ?? trip.driverId ?? ""} className={roClass} />
              ) : (
                <GlassCombobox
                  value={tf.driverId ?? ""}
                  onChange={(val) => updateTrip("driverId", val)}
                  options={drivers.map((d) => ({ value: d.driverId, label: d.name }))}
                  placeholder="Type driver name to search…"
                />
              )}
            </Field>
          </div>
        </section>

        {/* Payment & Advances */}
        <section className="flex flex-col gap-4">
          <p className={sh}>Payment &amp; Advances</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bill To">
              {readOnly ? (
                <input readOnly disabled value={tf.billTo ?? ""} className={roClass} />
              ) : (
                <GlassSelect
                  value={tf.billTo ?? ""}
                  onChange={(val) => updateTrip("billTo", val as Trip["billTo"])}
                  options={[{ value: "", label: "Select bill to" }, ...TRIP_BILL_TO_OPTIONS.map((o) => ({ value: o, label: o }))]}
                />
              )}
            </Field>
            <Field label="Payment Type">
              {readOnly ? (
                <input readOnly disabled value={tf.paymentType ?? ""} className={roClass} />
              ) : (
                <GlassSelect
                  value={tf.paymentType ?? ""}
                  onChange={(val) => updateTrip("paymentType", val as Trip["paymentType"])}
                  options={[{ value: "", label: "Select payment type" }, ...PAYMENT_TYPE_OPTIONS.map((o) => ({ value: o, label: o }))]}
                />
              )}
            </Field>
            <Field label="Customer Cash Advance (₹)">
              <DecimalInput type="number" min="0"
                readOnly={readOnly} disabled={readOnly}
                value={tf.customerCashAdvance ?? ""}
                onChange={(e) => updateTrip("customerCashAdvance", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
              />
            </Field>
            <Field label="Customer Fuel Advance (₹)">
              <DecimalInput type="number" min="0"
                readOnly={readOnly} disabled={readOnly}
                value={tf.customerFuelAdvanceAmount ?? ""}
                onChange={(e) => updateTrip("customerFuelAdvanceAmount", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
              />
            </Field>
            <Field label="Customer Fuel Advance (Litres)">
              <DecimalInput type="number" min="0"
                readOnly={readOnly} disabled={readOnly}
                value={tf.customerFuelAdvanceLitres ?? ""}
                onChange={(e) => updateTrip("customerFuelAdvanceLitres", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
              />
            </Field>
          </div>
        </section>

        {/* Driver Compensation */}
        <section className="flex flex-col gap-4">
          <p className={sh}>Driver Compensation</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Driver Compensation Type">
              {readOnly ? (
                <input readOnly disabled value={tf.driverCompensationType ?? ""} className={roClass} />
              ) : (
                <GlassSelect
                  value={tf.driverCompensationType ?? ""}
                  onChange={(val) => updateTrip("driverCompensationType", val as Trip["driverCompensationType"])}
                  options={[{ value: "", label: "Select compensation type" }, ...DRIVER_COMPENSATION_TYPE_OPTIONS.map((o) => ({ value: o, label: o }))]}
                />
              )}
            </Field>
            <Field label="Driver Advance Payment Method">
              {readOnly ? (
                <input readOnly disabled value={tf.driverAdvancePaymentMethod ?? ""} className={roClass} />
              ) : (
                <GlassCombobox
                  value={tf.driverAdvancePaymentMethod ?? ""}
                  onChange={(val) => updateTrip("driverAdvancePaymentMethod", val as Trip["driverAdvancePaymentMethod"])}
                  placeholder="Select or type payment method"
                  options={DRIVER_ADVANCE_PAYMENT_METHOD_OPTIONS.map((o) => ({ value: o, label: o }))}
                />
              )}
            </Field>
            {tf?.tripCategory !== "RETURN TRIP" && (
            <Field label="Driver Advance (₹)">
              <DecimalInput type="number"
                readOnly={readOnly} disabled={readOnly}
                value={tf.driverAdvance ?? ""}
                onChange={(e) => {
                  updateTrip("driverAdvance", e.target.value);
                  update("driverAdvance", e.target.value);
                }}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
              />
            </Field>
            )}
            <Field label="Driver Batta Amount (₹)">
              <DecimalInput type="number"
                readOnly={readOnly} disabled={readOnly}
                value={tf.driverAdvanceAmount ?? ""}
                onChange={(e) => updateTrip("driverAdvanceAmount", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
              />
              {battaRule && (
                <span className="mt-1 flex items-center gap-1 text-xs text-blue-500">
                  <Sparkles className="h-3 w-3" />
                  Auto-set to ₹{Number(battaRule.amount).toLocaleString("en-IN")} — {tf.tripCategory} with {tf.containerSpecification} ({battaRule.type} rate). Edit to override.
                </span>
              )}
            </Field>
          </div>
        </section>

        {/* Transport Cost Details */}
        <section className="flex flex-col gap-4">
          <p className={sh}>Transport Cost Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {containerSpec === "OPEN LOAD CARGO" && (
              <Field label="Open Load Hire Type">
                <input readOnly disabled value={tf.openLoadHireType || "Ton Based"} className={roClass} />
              </Field>
            )}
            {containerSpec === "OPEN LOAD CARGO" && (tf.openLoadHireType === "Ton Based" || !tf.openLoadHireType) && (
              <Field label="Rate per Ton (₹)">
                <DecimalInput type="number" min="0"
                  readOnly={readOnly} disabled={readOnly}
                  value={tf.ratePerTon ?? ""}
                  onChange={(e) => {
                    const rate = e.target.value;
                    updateTrip("ratePerTon", rate);
                    const hire = parseFloat(tf.cargoWeight ?? "") * parseFloat(rate);
                    if (!isNaN(hire) && hire > 0) updateTrip("transportHireAmount", String(hire));
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={fc}
                />
                {tf.cargoWeight && tf.ratePerTon && (
                  <p className="mt-1 text-xs text-gray-400">
                    {tf.cargoWeight} tons × ₹{tf.ratePerTon}/ton = ₹{(parseFloat(tf.cargoWeight) * parseFloat(tf.ratePerTon)).toLocaleString("en-IN")}
                  </p>
                )}
              </Field>
            )}
            <Field label="Transport Hire Amount (₹)">
              <DecimalInput type="number" min="0"
                readOnly={readOnly} disabled={readOnly}
                value={tf.transportHireAmount ?? ""}
                onChange={(e) => updateTrip("transportHireAmount", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
              />
            </Field>
            <Field label="Transport Crossing Amount (₹)">
              <DecimalInput type="number" min="0"
                readOnly={readOnly} disabled={readOnly}
                value={tf.transportCrossingAmount ?? ""}
                onChange={(e) => updateTrip("transportCrossingAmount", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
              />
            </Field>
          </div>
        </section>

        {/* Operational Notes */}
        <section className="flex flex-col gap-4">
          <p className={sh}>Operational Notes</p>
          <div className="grid grid-cols-1 gap-4">
            <Field label="Internal Remarks">
              <textarea
                readOnly={readOnly} disabled={readOnly}
                rows={3}
                value={tf.internalRemarks ?? ""}
                onChange={(e) => updateTrip("internalRemarks", e.target.value)}
                className={fc}
              />
            </Field>
            <Field label="Booking Instructions">
              <textarea
                readOnly={readOnly} disabled={readOnly}
                rows={3}
                value={tf.bookingInstructions ?? ""}
                onChange={(e) => updateTrip("bookingInstructions", e.target.value)}
                className={fc}
              />
            </Field>
          </div>
        </section>

        {/* ── Part 2: Closure Information (from Close Trip form — editable in edit mode) ── */}

        {/* Closure — Billing */}
        <section className="flex flex-col gap-4">
          <p className={sh}>Closure — Billing</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Trip Completed Date">
              <DatePickerInput
                value={form.tripCompletedDate}
                disabled={readOnly}
                onChange={(v) => update("tripCompletedDate", v)}
                className={fc}
              />
            </Field>
            <Field label="Movement Category (Closure)">
              {readOnly ? (
                <input readOnly disabled value={form.movementCategory} className={roClass} />
              ) : (
                <GlassSelect
                  value={form.movementCategory}
                  onChange={(val) => update("movementCategory", val)}
                  options={[
                    { value: "", label: "Select movement category" },
                    ...MOVEMENT_CATEGORY_OPTIONS.map((o) => ({ value: o, label: o })),
                  ]}
                />
              )}
            </Field>
            <Field label="Hire Amount (₹)">
              <DecimalInput type="number" min="0" step="0.01"
                value={form.hireAmount}
                readOnly={readOnly} disabled={readOnly}
                onChange={(e) => update("hireAmount", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
                placeholder="e.g. 32000"
              />
            </Field>
            <Field label="Transport Amount (₹)">
              <DecimalInput type="number" min="0" step="0.01"
                value={form.transportAmount}
                readOnly={readOnly} disabled={readOnly}
                onChange={(e) => update("transportAmount", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
                placeholder="e.g. 34000"
              />
            </Field>
            <Field label="Billing Amount (₹)">
              <DecimalInput type="number" min="0" step="0.01"
                value={form.billingAmount}
                readOnly={readOnly} disabled={readOnly}
                onChange={(e) => update("billingAmount", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
                placeholder="e.g. 36000"
              />
            </Field>
            <Field label="Customer Advance Amount (₹)">
              <DecimalInput type="number" min="0" step="0.01"
                value={form.advanceAmount}
                readOnly={readOnly} disabled={readOnly}
                onChange={(e) => update("advanceAmount", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
                placeholder="e.g. 5000"
              />
            </Field>
            {trip?.tripCategory !== "RETURN TRIP" && (
            <Field label="Driver Advance (₹)">
              <DecimalInput type="number" min="0" step="0.01"
                value={form.driverAdvance}
                readOnly={readOnly} disabled={readOnly}
                onChange={(e) => {
                  update("driverAdvance", e.target.value);
                  updateTrip("driverAdvance", e.target.value);
                }}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
                placeholder="e.g. 2000"
              />
            </Field>
            )}
            <Field label="Additional Driver Advance (₹)">
              <DecimalInput type="number" min="0" step="0.01"
                value={form.additionalDriverAdvance}
                readOnly={readOnly} disabled={readOnly}
                onChange={(e) => update("additionalDriverAdvance", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
                placeholder="e.g. 500"
              />
            </Field>
            <Field label="Payment Mode">
              {readOnly ? (
                <input readOnly disabled value={form.paymentMode} className={roClass} />
              ) : (
                <GlassSelect
                  value={form.paymentMode}
                  onChange={(val) => update("paymentMode", val as PaymentMode)}
                  options={[
                    { value: "", label: "Select payment mode" },
                    ...PAYMENT_MODE_OPTIONS.map((o) => ({ value: o, label: o })),
                  ]}
                />
              )}
            </Field>
            <Field label="Bill To (Closure)">
              {readOnly ? (
                <input readOnly disabled value={form.billTo} className={roClass} />
              ) : (
                <GlassSelect
                  value={form.billTo}
                  onChange={(val) => update("billTo", val as BillTo)}
                  options={[
                    { value: "", label: "Select bill to" },
                    ...BILL_TO_OPTIONS.map((o) => ({ value: o, label: o })),
                  ]}
                />
              )}
            </Field>
          </div>
        </section>

        {/* Closure — Halt Information */}
        <section className="flex flex-col gap-4">
          <p className={sh}>Closure — Halt Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company Halt Days (Driver)">
              <DecimalInput type="number" min="0"
                value={form.companyHaltDays}
                readOnly={readOnly} disabled={readOnly}
                onChange={(e) => update("companyHaltDays", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
                placeholder="0"
              />
            </Field>
            <Field label="Party Halt Days (Customer)">
              <DecimalInput type="number" min="0"
                value={form.partyHaltDays}
                readOnly={readOnly} disabled={readOnly}
                onChange={(e) => update("partyHaltDays", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={fc}
                placeholder="0"
              />
            </Field>
            {totalHaltDays > 0 && (
              <>
                <Field label="Halt Remarks" className="sm:col-span-2">
                  <textarea
                    rows={3}
                    value={form.haltRemarks}
                    readOnly={readOnly}
                    disabled={readOnly}
                    onChange={(e) => update("haltRemarks", e.target.value)}
                    className={fc}
                    placeholder="e.g. Delayed at port due to documentation issues"
                  />
                </Field>
                <div className="sm:col-span-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Halt Compensation Summary</p>
                  <div className="flex items-center justify-between text-sm text-blue-800">
                    <span>Total Halt Days</span>
                    <span className="font-semibold">{totalHaltDays} day{totalHaltDays !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-blue-800">
                    <span>Rate per Day ({containerSpec === "40 FT CONTAINER" ? "40FT" : "20FT"} · {truckBranch?.name ?? "Branch"})</span>
                    <span className="font-semibold">₹{haltDayRate.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-blue-200 pt-1.5 text-sm font-bold text-blue-900">
                    <span>Driver Halt Compensation</span>
                    <span>₹{haltCompensation.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
