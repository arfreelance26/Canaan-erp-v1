"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { GlassSelect } from "@/components/ui/GlassSelect";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripClosureData, PaymentMode, BillTo } from "@/types/trip-closure";

const readonlyClass =
  "w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-not-allowed";

const sectionHeadingClass =
  "text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-2 rounded-lg";

const PAYMENT_MODE_OPTIONS: PaymentMode[] = [
  "Cash",
  "UPI",
  "Bank Transfer",
  "Cheque",
  "NEFT / RTGS",
];

const BILL_TO_OPTIONS: BillTo[] = ["CUSTOMER", "CONSIGNEE"];

export const INVOICE_TYPES = ["Bill of Supply", "Transport Memo", "Tax Invoice"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

function emptyForm(tripId: string): TripClosureData {
  return {
    tripId,
    bookingNo: "", containerNo: "", releaseOrderNo: "",
    containerType: "", line: "", loadType: "",
    vehicleId: "", driverId: "", assignmentDate: "",
    fromLocation: "", toLocation: "", tripCompletedDate: "",
    hireAmount: "", transportAmount: "", billingAmount: "",
    advanceAmount: "", paymentMode: "", billTo: "",
    companyHaltDays: "", partyHaltDays: "", haltRemarks: "",
  };
}

type Props = {
  open: boolean;
  trip: Trip | null;
  closure: TripClosureData | undefined;
  driver: Driver | undefined;
  truck: Truck | undefined;
  customer: Customer | undefined;
  onClose: () => void;
  onSubmit: (data: TripClosureData, invoiceType: InvoiceType) => Promise<void>;
};

export function GenerateInvoiceDialog({
  open, trip, closure, driver, truck, customer, onClose, onSubmit,
}: Props) {
  const [form, setForm] = useState<TripClosureData>(emptyForm(""));
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("Bill of Supply");
  const [saving, setSaving] = useState(false);

  // Suppress unused variable warnings — these props are available for future use
  void driver;
  void truck;
  void customer;

  useEffect(() => {
    if (!open || !trip) return;

    if (closure) {
      setForm({ ...closure });
    } else {
      const f = emptyForm(trip.id);
      f.bookingNo      = trip.bookingReferenceNo ?? "";
      f.containerNo    = trip.containerNumber ?? trip.containerNumber1 ?? "";
      f.releaseOrderNo = trip.releaseOrderReference ?? "";
      f.containerType  = trip.containerSpecification ?? "";
      f.line           = trip.shippingLine ?? "";
      f.loadType       = trip.cargoClassification ?? "";
      f.vehicleId      = trip.vehicleId ?? "";
      f.driverId       = trip.driverId ?? "";
      f.assignmentDate = trip.scheduledDate ?? "";
      f.fromLocation   = trip.origin ?? "";
      f.toLocation     = trip.destination ?? "";
      f.hireAmount     = trip.transportHireAmount ?? "";
      f.advanceAmount  = trip.customerCashAdvance ?? "";
      f.billTo         = (trip.billTo as BillTo) ?? "";
      setForm(f);
    }

    setInvoiceType("Bill of Supply");
  }, [open, trip, closure]);

  function update<K extends keyof TripClosureData>(key: K, value: TripClosureData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const billingTotal = parseFloat(form.billingAmount) || parseFloat(form.hireAmount) || 0;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form, invoiceType);
    } finally {
      setSaving(false);
    }
  }

  if (!trip) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Generate Invoice" className="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* ── SECTION 1: SHIPMENT INFORMATION ── */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>1. Shipment Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          </div>
        </section>

        {/* ── SECTION 2: ASSIGNMENT ── */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>2. Assignment</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Vehicle">
              <input readOnly disabled value={form.vehicleId} className={readonlyClass} />
            </Field>
            <Field label="Driver">
              <input readOnly disabled value={form.driverId} className={readonlyClass} />
            </Field>
            <Field label="Date">
              <input readOnly disabled value={form.assignmentDate} className={readonlyClass} />
            </Field>
          </div>
        </section>

        {/* ── SECTION 3: ROUTE ── */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>3. Route</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="From">
              <input readOnly disabled value={form.fromLocation} className={readonlyClass} />
            </Field>
            <Field label="To">
              <input readOnly disabled value={form.toLocation} className={readonlyClass} />
            </Field>
            <Field label="Trip Completed Date">
              <input readOnly disabled value={form.tripCompletedDate} className={readonlyClass} />
            </Field>
          </div>
        </section>

        {/* ── SECTION 4: BILLING ── */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>4. Billing</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Hire Amount (₹)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.hireAmount}
                onChange={(e) => update("hireAmount", e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </Field>
            <Field label="Transport Amount (₹)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.transportAmount}
                onChange={(e) => update("transportAmount", e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </Field>
            <Field label="Billing Amount (₹)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.billingAmount}
                onChange={(e) => update("billingAmount", e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </Field>
            <Field label="Advance Amount (₹)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.advanceAmount}
                onChange={(e) => update("advanceAmount", e.target.value)}
                className={inputClass}
                placeholder="0.00"
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
              <GlassSelect
                value={form.billTo}
                onChange={(val) => update("billTo", val as BillTo)}
                options={[
                  { value: "", label: "Select bill to" },
                  ...BILL_TO_OPTIONS.map((opt) => ({ value: opt, label: opt })),
                ]}
              />
            </Field>
          </div>
        </section>

        {/* ── SECTION 5: HALT INFORMATION ── */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>5. Halt Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company Halt Days (Driver)">
              <input
                type="number"
                min="0"
                value={form.companyHaltDays}
                onChange={(e) => update("companyHaltDays", e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </Field>
            <Field label="Party Halt Days (Customer)">
              <input
                type="number"
                min="0"
                value={form.partyHaltDays}
                onChange={(e) => update("partyHaltDays", e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </Field>
            <Field label="Halt Remarks" className="sm:col-span-2">
              <textarea
                rows={2}
                value={form.haltRemarks}
                onChange={(e) => update("haltRemarks", e.target.value)}
                className={inputClass}
                placeholder="e.g. Delayed at port due to documentation issues"
              />
            </Field>
          </div>
        </section>

        {/* ── SECTION 6: INVOICE TYPE ── */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>6. Invoice Type</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {INVOICE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setInvoiceType(type)}
                className={[
                  "rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all",
                  invoiceType === type
                    ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                ].join(" ")}
              >
                {type}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            {invoiceType === "Bill of Supply" &&
              "GST-exempt supply invoice — for GTA-to-GTA services under Notification 12/2017."}
            {invoiceType === "Transport Memo" &&
              "Internal transport memo — for own-fleet movements billed to Canaan Global International."}
            {invoiceType === "Tax Invoice" &&
              "Full tax invoice with SGST & CGST breakdown — for taxable transport services."}
          </p>
        </section>

        {/* ── ACTIONS ── */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <div className="text-sm text-gray-500">
            Trip: <span className="font-semibold text-gray-800">{trip.tripId}</span>
            &nbsp;·&nbsp;
            Billing Total:{" "}
            <span className="font-semibold text-emerald-700">
              ₹{billingTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Generating…" : "Generate Invoice"}
            </button>
          </div>
        </div>

      </form>
    </Dialog>
  );
}
