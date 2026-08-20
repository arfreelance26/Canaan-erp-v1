"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Branch } from "@/types/branch";
import type { TripClosureData, PaymentMode, BillTo } from "@/types/trip-closure";
import { branchesApi } from "@/lib/api";
import { todayIst } from "@/lib/format-date";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";

const PAYMENT_MODE_OPTIONS: PaymentMode[] = [
  "Cash",
  "UPI",
  "Bank Transfer",
  "Cheque",
  "NEFT / RTGS",
];

const readonlyClass =
  "w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-not-allowed";

const sectionHeadingClass =
  "text-xs font-semibold uppercase tracking-wider text-blue-900 bg-blue-50 px-3 py-2 rounded-lg";

function emptyForm(tripId: string): TripClosureData {
  return {
    tripId,
    // 1. Shipment Information
    bookingNo: "",
    containerNo: "",
    releaseOrderNo: "",
    containerType: "",
    line: "",
    loadType: "",
    movementCategory: "",
    // 2. Assignment
    vehicleId: "",
    driverId: "",
    assignmentDate: "",
    // 3. Route
    fromLocation: "",
    toLocation: "",
    tripCompletedDate: "",
    // 4. Billing
    hireAmount: "",
    transportAmount: "",
    billingAmount: "",
    advanceAmount: "",
    driverAdvance: "",
    additionalDriverAdvance: "",
    paymentMode: "",
    billTo: "",
    // 5. Halt Information
    companyHaltDays: "",
    partyHaltDays: "",
    haltRemarks: "",
    driverHaltCompensation: "",
    closureRemarks: "",
    closedAt: "",
  };
}

type CloseTripDialogProps = {
  open: boolean;
  trip: Trip | null;
  driver: Driver | undefined;
  truck: Truck | undefined;
  onClose: () => void;
  onSubmit: (data: TripClosureData) => void;
};

export function CloseTripDialog({ open, trip, driver, truck, onClose, onSubmit }: CloseTripDialogProps) {
  const [form, setForm] = useState<TripClosureData>(emptyForm(""));
  const [branches, setBranches] = useState<Branch[]>([]);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (justOpened && trip) {
      const f = emptyForm(trip.id);

      // 1. Shipment Information — auto-populate from trip
      f.bookingNo = trip.bookingReferenceNo ?? "";
      f.containerNo = trip.containerNumber ?? trip.containerNumber1 ?? "";
      f.releaseOrderNo = trip.releaseOrderReference ?? "";
      f.containerType = trip.containerSpecification ?? "";
      f.line = trip.shippingLine ?? "";
      f.loadType = trip.cargoClassification ?? "";
      f.movementCategory = trip.movementCategory ?? "";

      // 2. Assignment — auto-populate from trip
      f.vehicleId = trip.vehicleId ?? "";
      f.driverId = trip.driverId ?? "";
      f.assignmentDate = trip.scheduledDate ?? "";

      // 3. Route — auto-populate from trip
      f.fromLocation = trip.origin ?? "";
      f.toLocation = trip.destination ?? "";
      f.tripCompletedDate = todayIst();

      // 4. Billing — pre-fill what we know
      f.hireAmount = trip.transportHireAmount ?? "";
      f.transportAmount = trip.transportHireAmount ?? "";
      f.advanceAmount = trip.customerCashAdvance ?? "";
      f.driverAdvance = trip.driverAdvance ?? "";
      f.billTo = (trip.billTo as BillTo) ?? "";

      setForm(f);
    }
  }, [open, trip]);

  const draftKey = `erp_close_trip_draft_${trip?.id ?? "none"}`;
  useFormDraft(draftKey, open, form, setForm);

  function update<K extends keyof TripClosureData>(key: K, value: TripClosureData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearFormDraft(draftKey);
    onSubmit({ ...form, driverHaltCompensation: String(haltCompensation) });
  }

  const truckBranch = branches.find((b) => b.name === truck?.branchRegisteredTo);
  const totalHaltDays = Number(form.companyHaltDays || 0) + Number(form.partyHaltDays || 0);
  const haltDayRate = truckBranch
    ? (form.containerType === "40 FT CONTAINER"
        ? Number(truckBranch.haltDayFee40ft || 0)
        : Number(truckBranch.haltDayFee20ft || 0))
    : 0;
  const haltCompensation = totalHaltDays > 0 ? totalHaltDays * haltDayRate : 0;

  if (!trip) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Close Trip" className="max-w-4xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* 1. Shipment Information */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>1. Shipment Information</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Booking No">
              <input readOnly disabled value={form.bookingNo} className={readonlyClass} />
            </Field>
            <Field label="Container No">
              <input readOnly disabled value={form.containerNo} className={readonlyClass} />
            </Field>
            <Field label="Release Order No">
              <input readOnly disabled value={form.releaseOrderNo} className={readonlyClass} />
            </Field>
            <Field label="Container Type">
              <input readOnly disabled value={form.containerType} className={readonlyClass} />
            </Field>
            <Field label="Line">
              <input readOnly disabled value={form.line} className={readonlyClass} />
            </Field>
            <Field label="Load Type">
              <input readOnly disabled value={form.loadType} className={readonlyClass} />
            </Field>
            <Field label="Movement Category">
              <input readOnly disabled value={form.movementCategory} className={readonlyClass} />
            </Field>
          </div>
        </section>

        {/* 2. Assignment */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>2. Assignment</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field label="Vehicle">
              <input
                readOnly
                disabled
                value={trip.truckRegistration ?? (truck ? `${truck.registrationNumber} (${form.vehicleId})` : form.vehicleId)}
                className={readonlyClass}
              />
            </Field>
            <Field label="Driver">
              <input
                readOnly
                disabled
                value={trip.driverName ?? driver?.name ?? form.driverId}
                className={readonlyClass}
              />
            </Field>
            <Field label="Date">
              <input
                readOnly
                disabled
                value={form.assignmentDate ? form.assignmentDate.split("-").reverse().join("-") : ""}
                className={readonlyClass}
              />
            </Field>
          </div>
        </section>

        {/* 3. Route */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>3. Route</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field label="From">
              <input readOnly disabled value={form.fromLocation} className={readonlyClass} />
            </Field>
            <Field label="To">
              <input readOnly disabled value={form.toLocation} className={readonlyClass} />
            </Field>
            <Field label="Approx Distance">
              <input
                readOnly
                disabled
                value={trip.approxKm ? `${trip.approxKm} KM` : trip.approxTripDistance ? `${trip.approxTripDistance} KM` : "—"}
                className={readonlyClass}
              />
            </Field>
            <Field label="Trip Completed Date" required>
              <DatePickerInput
                required
                value={form.tripCompletedDate}
                onChange={(v) => update("tripCompletedDate", v)}
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        {/* 4. Billing */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>4. Billing</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Hire Amount (₹)">
              <input readOnly disabled value={form.hireAmount} className={readonlyClass} />
            </Field>
            <Field label="Transport Amount (₹)">
              <input readOnly disabled value={form.transportAmount} className={readonlyClass} />
            </Field>
            <Field label="Customer Advance Amount (₹)">
              <input readOnly disabled value={form.advanceAmount} className={readonlyClass} />
            </Field>
            {trip?.tripCategory !== "RETURN TRIP" && (
            <Field label="Driver Advance (₹)">
              <DecimalInput type="number"
                value={form.driverAdvance}
                readOnly
                disabled
                className={readonlyClass}
              />
            </Field>
            )}
            <Field label="Additional Driver Advance (₹)">
              <DecimalInput type="number"
                min="0"
                step="0.01"
                value={form.additionalDriverAdvance}
                onChange={(e) => update("additionalDriverAdvance", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass}
                placeholder="e.g. 500"
              />
            </Field>
            <Field label="Payment Mode">
              <GlassSelect
                value={form.paymentMode}
                onChange={(val) => update("paymentMode", val as PaymentMode)}
                options={[
                  { value: "", label: "Select payment mode" },
                  ...PAYMENT_MODE_OPTIONS.map((opt) => ({ value: opt, label: opt })),
                ]}
              />
            </Field>
            <Field label="Bill To">
              <input readOnly disabled value={form.billTo} className={readonlyClass} />
            </Field>
          </div>
        </section>

        {/* 5. Halt Information */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>5. Halt Information</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Company Halt Days (Driver)">
              <input
                type="number"
                min="0"
                step="1"
                value={form.companyHaltDays}
                onKeyDown={(e) => { if ([".", ",", "e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }}
                onChange={(e) => { const v = e.target.value; update("companyHaltDays", v === "" ? "" : String(Math.trunc(Number(v)))); }}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass}
                placeholder="0"
              />
            </Field>
            <Field label="Party Halt Days (Customer)">
              <input
                type="number"
                min="0"
                step="1"
                value={form.partyHaltDays}
                onKeyDown={(e) => { if ([".", ",", "e", "E", "+", "-"].includes(e.key)) e.preventDefault(); }}
                onChange={(e) => { const v = e.target.value; update("partyHaltDays", v === "" ? "" : String(Math.trunc(Number(v)))); }}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass}
                placeholder="0"
              />
            </Field>
            {totalHaltDays > 0 && (
              <>
                <Field label="Halt Remarks" className="sm:col-span-2">
                  <textarea
                    rows={3}
                    value={form.haltRemarks}
                    onChange={(e) => update("haltRemarks", e.target.value)}
                    className={inputClass}
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
                    <span>Rate per Day ({form.containerType === "40 FT CONTAINER" ? "40FT" : "20FT"} · {truckBranch?.name ?? "Branch"})</span>
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

        {/* Closure Remarks */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>Closure Remarks</p>
          <Field label="Remarks">
            <textarea
              rows={3}
              value={form.closureRemarks}
              onChange={(e) => update("closureRemarks", e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="Enter any remarks about this trip closure"
            />
          </Field>
        </section>

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => { clearFormDraft(draftKey); onClose(); }}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Close Trip
          </button>
        </div>
      </form>
    </Dialog>
  );
}
