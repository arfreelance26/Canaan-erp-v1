"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { TripClosureData, PaymentMode } from "@/types/trip-closure";

const PAYMENT_MODE_OPTIONS: PaymentMode[] = [
  "Cash",
  "UPI",
  "Bank Transfer",
  "Cheque",
  "NEFT / RTGS",
];

const readonlyClass =
  "w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-not-allowed";

const sectionHeadingClass = "text-xs font-semibold uppercase tracking-wider text-gray-400 pt-2";

const emptyForm = (tripId: string): TripClosureData => ({
  tripId,
  // Edit Booking Section
  bookingReferenceNo: "",
  tripCategory: "",
  movementCategory: "",
  customerName: "",
  containerSpecification: "",
  cargoClassification: "",
  containerNumber: "",
  containerNumber1: "",
  containerNumber2: "",
  cargoReference: "",
  bookingDate: "",
  originLocation: "",
  destinationLocation: "",
  rateType: "",
  releaseOrderReference: "",
  shippingLine: "",
  vesselName: "",
  shipperConsigneeName: "",
  // Transporter Details Section
  transportMethod: "",
  transporter: "",
  tripDate: "",
  assignedTruckDetails: "",
  paymentType: "",
  customerAdvance: "",
  dieselAdvance: "",
  driverAdvanceAmount: "",
  driverAdvancePaymentMethod: "",
  billTo: "",
  // Transporter Price Details Section
  transportHireAmount: "",
  transportCrossingAmount: "",
  transportHalt: "",
  transportUnloading: "",
  transportLiftingCharges: "",
  transportWeighment: "",
  totalTransportAmount: "",
  // Billing Price Details Section
  billingHireAmount: "",
  billingHalt: "",
  billingUnloading: "",
  billingLiftingCharges: "",
  billingWeighment: "",
  totalBillingAmount: "",
  // Trip Completion
  tripCompletedDate: "",
  tripClosingDate: "",
  paymentMode: "",
  // Trip Distance Details
  startingOdometer: "",
  endingOdometer: "",
  totalDistance: "",
  // Cargo Weight Details
  grossWeight: "",
  tareWeight: "",
  netWeight: "",
  // Trip Fuel Details
  bunkName: "",
  dieselQuantity: "",
  fuelTotalCost: "",
  // Trip Expenses
  totalHaltDays: "",
  haltRemarks: "",
  driversCompensation: "",
  haltCompensation: "",
  portPassExpense: "",
  weightSheetExpense: "",
  mamolExpense: "",
  claimableMamolExpense: "",
  trafficRtoPoliceExpense: "",
  liftOnOffExpense: "",
  craneOperatorExpense: "",
  parkingExpenses: "",
  punctureExpense: "",
  sparePartsExpense: "",
  otherExpenses: "",
  tollExpenses: "",
  // Halt Information
  additionalDriverAdvanceAmount: "",
  companyHaltDays: "",
  partyHaltDays: "",
});

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

  useEffect(() => {
    if (open && trip) {
      const form = emptyForm(trip.id);
      // Auto-populate from trip data
      form.bookingReferenceNo = trip.bookingReferenceNo;
      form.tripCategory = trip.tripCategory;
      form.movementCategory = trip.movementCategory;
      form.customerName = trip.customerId; // TODO: fetch customer name
      form.containerSpecification = trip.containerSpecification;
      form.cargoClassification = trip.cargoClassification;
      form.containerNumber = trip.containerNumber;
      form.containerNumber1 = trip.containerNumber1;
      form.containerNumber2 = trip.containerNumber2;
      form.cargoReference = trip.cargoReference;
      form.bookingDate = trip.bookingCreatedDate;
      form.originLocation = trip.origin;
      form.destinationLocation = trip.destination;
      form.rateType = ""; // TODO: add to trip data
      form.releaseOrderReference = trip.releaseOrderReference;
      form.shippingLine = trip.shippingLine;
      form.vesselName = trip.vesselName;
      form.shipperConsigneeName = trip.shipperConsignee;
      form.transportMethod = trip.transportMethod;
      form.transporter = trip.transportMethod === "Own Fleet" ? "Canaan Global International" : "";
      form.tripDate = trip.scheduledDate;
      form.assignedTruckDetails = trip.vehicleId; // TODO: fetch truck details
      form.paymentType = trip.paymentType;
      form.customerAdvance = trip.customerCashAdvance;
      form.dieselAdvance = trip.customerFuelAdvanceAmount;
      form.driverAdvanceAmount = trip.driverAdvanceAmount;
      form.driverAdvancePaymentMethod = trip.driverAdvancePaymentMethod;
      form.billTo = trip.billTo;
      form.transportHireAmount = trip.transportHireAmount;
      form.transportCrossingAmount = trip.transportCrossingAmount;
      setForm(form);
    }
  }, [open, trip]);

  function update<K extends keyof TripClosureData>(key: K, value: TripClosureData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(form);
  }

  if (!trip) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Close Trip" className="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* 1. Edit Booking */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>1. Edit Booking</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Booking Reference No">
              <input readOnly disabled value={form.bookingReferenceNo} className={readonlyClass} />
            </Field>
            <Field label="Trip Category">
              <input readOnly disabled value={form.tripCategory} className={readonlyClass} />
            </Field>
            <Field label="Movement Category">
              <input readOnly disabled value={form.movementCategory} className={readonlyClass} />
            </Field>
            <Field label="Customer Name">
              <input readOnly disabled value={form.customerName} className={readonlyClass} />
            </Field>
            <Field label="Container Specification">
              <input readOnly disabled value={form.containerSpecification} className={readonlyClass} />
            </Field>
            <Field label="Cargo Classification">
              <input readOnly disabled value={form.cargoClassification} className={readonlyClass} />
            </Field>
            {form.containerSpecification === "2 X 20 FEET CONTAINERS" ? (
              <>
                <Field label="Container Number for First Container">
                  <input readOnly disabled value={form.containerNumber1} className={readonlyClass} />
                </Field>
                <Field label="Container Number for Second Container">
                  <input readOnly disabled value={form.containerNumber2} className={readonlyClass} />
                </Field>
              </>
            ) : form.containerSpecification === "20 FT CONTAINER" || form.containerSpecification === "40 FT CONTAINER" ? (
              <Field label="Container No">
                <input readOnly disabled value={form.containerNumber} className={readonlyClass} />
              </Field>
            ) : form.containerSpecification === "OPEN LOAD CARGO" ? (
              <Field label="Cargo Reference">
                <input readOnly disabled value={form.cargoReference} className={readonlyClass} />
              </Field>
            ) : null}
            <Field label="Booking Date">
              <input readOnly disabled value={form.bookingDate} className={readonlyClass} />
            </Field>
            <Field label="Origin Location">
              <input readOnly disabled value={form.originLocation} className={readonlyClass} />
            </Field>
            <Field label="Destination Location">
              <input readOnly disabled value={form.destinationLocation} className={readonlyClass} />
            </Field>
            <Field label="Rate Type">
              <input readOnly disabled value={form.rateType} className={readonlyClass} />
            </Field>
            <Field label="Release Order Reference">
              <input readOnly disabled value={form.releaseOrderReference} className={readonlyClass} />
            </Field>
            <Field label="Shipping Line">
              <input readOnly disabled value={form.shippingLine} className={readonlyClass} />
            </Field>
            <Field label="Vessel Name">
              <input readOnly disabled value={form.vesselName} className={readonlyClass} />
            </Field>
            <Field label="Shipper/Consignee Name">
              <input readOnly disabled value={form.shipperConsigneeName} className={readonlyClass} />
            </Field>
          </div>
        </section>

        {/* 2. Transporter Details */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>2. Transporter Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Transport Method">
              <input readOnly disabled value={form.transportMethod} className={readonlyClass} />
            </Field>
            <Field label="Transporter">
              <input readOnly disabled value={form.transporter} className={readonlyClass} />
            </Field>
            <Field label="Trip Date">
              <input readOnly disabled value={form.tripDate} className={readonlyClass} />
            </Field>
            <Field label="Assigned Truck Details">
              <input readOnly disabled value={form.assignedTruckDetails} className={readonlyClass} />
            </Field>
            <Field label="Payment Type">
              <input readOnly disabled value={form.paymentType} className={readonlyClass} />
            </Field>
            <Field label="Customer Advance">
              <input readOnly disabled value={form.customerAdvance} className={readonlyClass} />
            </Field>
            <Field label="Diesel Advance">
              <input readOnly disabled value={form.dieselAdvance} className={readonlyClass} />
            </Field>
            <Field label="Driver Advance Amount">
              <input readOnly disabled value={form.driverAdvanceAmount} className={readonlyClass} />
            </Field>
            <Field label="Driver Advance Payment Method">
              <input readOnly disabled value={form.driverAdvancePaymentMethod} className={readonlyClass} />
            </Field>
            <Field label="Bill To">
              <input readOnly disabled value={form.billTo} className={readonlyClass} />
            </Field>
          </div>
        </section>

        {/* 3. Transporter Price Details */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>3. Transporter Price Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Transport Hire Amount (₹)">
              <input
                type="number"
                min="0"
                value={form.transportHireAmount}
                onChange={(e) => update("transportHireAmount", e.target.value)}
                className={inputClass}
                placeholder="e.g. 32000"
              />
            </Field>
            <Field label="Crossing Amount (₹)">
              <input
                type="number"
                min="0"
                value={form.transportCrossingAmount}
                onChange={(e) => update("transportCrossingAmount", e.target.value)}
                className={inputClass}
                placeholder="e.g. 500"
              />
            </Field>
            <Field label="Transport Halt (₹)">
              <input
                type="number"
                min="0"
                value={form.transportHalt}
                onChange={(e) => update("transportHalt", e.target.value)}
                className={inputClass}
                placeholder="e.g. 300"
              />
            </Field>
            <Field label="Transport Unloading (₹)">
              <input
                type="number"
                min="0"
                value={form.transportUnloading}
                onChange={(e) => update("transportUnloading", e.target.value)}
                className={inputClass}
                placeholder="e.g. 200"
              />
            </Field>
            <Field label="Transport Lifting Charges (₹)">
              <input
                type="number"
                min="0"
                value={form.transportLiftingCharges}
                onChange={(e) => update("transportLiftingCharges", e.target.value)}
                className={inputClass}
                placeholder="e.g. 400"
              />
            </Field>
            <Field label="Transport Weighment (₹)">
              <input
                type="number"
                min="0"
                value={form.transportWeighment}
                onChange={(e) => update("transportWeighment", e.target.value)}
                className={inputClass}
                placeholder="e.g. 150"
              />
            </Field>
            <Field label="Total Transport Amount (₹)" className="sm:col-span-2">
              <input
                type="number"
                readOnly
                disabled
                value={
                  [form.transportHireAmount, form.transportCrossingAmount, form.transportHalt,
                   form.transportUnloading, form.transportLiftingCharges, form.transportWeighment]
                    .map(v => parseFloat(v) || 0)
                    .reduce((a, b) => a + b, 0)
                    .toFixed(2)
                }
                className={readonlyClass}
              />
            </Field>
          </div>
        </section>

        {/* 4. Billing Price Details */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>4. Billing Price Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Billing Hire Amount (₹)">
              <input
                type="number"
                min="0"
                value={form.billingHireAmount}
                onChange={(e) => update("billingHireAmount", e.target.value)}
                className={inputClass}
                placeholder="e.g. 32000"
              />
            </Field>
            <Field label="Billing Halt (₹)">
              <input
                type="number"
                min="0"
                value={form.billingHalt}
                onChange={(e) => update("billingHalt", e.target.value)}
                className={inputClass}
                placeholder="e.g. 300"
              />
            </Field>
            <Field label="Billing Unloading (₹)">
              <input
                type="number"
                min="0"
                value={form.billingUnloading}
                onChange={(e) => update("billingUnloading", e.target.value)}
                className={inputClass}
                placeholder="e.g. 200"
              />
            </Field>
            <Field label="Billing Lifting Charges (₹)">
              <input
                type="number"
                min="0"
                value={form.billingLiftingCharges}
                onChange={(e) => update("billingLiftingCharges", e.target.value)}
                className={inputClass}
                placeholder="e.g. 400"
              />
            </Field>
            <Field label="Billing Weighment (₹)">
              <input
                type="number"
                min="0"
                value={form.billingWeighment}
                onChange={(e) => update("billingWeighment", e.target.value)}
                className={inputClass}
                placeholder="e.g. 150"
              />
            </Field>
            <Field label="Total Billing Amount (₹)" className="sm:col-span-2">
              <input
                type="number"
                readOnly
                disabled
                value={
                  [form.billingHireAmount, form.billingHalt, form.billingUnloading,
                   form.billingLiftingCharges, form.billingWeighment]
                    .map(v => parseFloat(v) || 0)
                    .reduce((a, b) => a + b, 0)
                    .toFixed(2)
                }
                className={readonlyClass}
              />
            </Field>
          </div>
        </section>

        {/* 5. Trip Completion */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>5. Trip Completion</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Trip Completed Date">
              <input
                type="date"
                required
                value={form.tripCompletedDate}
                onChange={(e) => update("tripCompletedDate", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Trip Closing Date">
              <input
                type="date"
                required
                value={form.tripClosingDate}
                onChange={(e) => update("tripClosingDate", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Payment Mode" className="sm:col-span-2">
              <select
                required
                value={form.paymentMode}
                onChange={(e) => update("paymentMode", e.target.value as PaymentMode)}
                className={inputClass}
              >
                <option value="" disabled>Select payment mode</option>
                {PAYMENT_MODE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* 5. Trip Distance Details */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>5. Trip Distance Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Starting Odometer (km)">
              <input
                type="number"
                min="0"
                value={form.startingOdometer}
                onChange={(e) => update("startingOdometer", e.target.value)}
                className={inputClass}
                placeholder="e.g. 45000"
              />
            </Field>
            <Field label="Ending Odometer (km)">
              <input
                type="number"
                min="0"
                value={form.endingOdometer}
                onChange={(e) => update("endingOdometer", e.target.value)}
                className={inputClass}
                placeholder="e.g. 45350"
              />
            </Field>
            <Field label="Total Distance (km)">
              <input
                type="number"
                readOnly
                disabled
                value={form.startingOdometer && form.endingOdometer
                  ? (parseInt(form.endingOdometer) - parseInt(form.startingOdometer)).toString()
                  : ""}
                className={readonlyClass}
                placeholder="Auto-calculated"
              />
            </Field>
          </div>
        </section>

        {/* 6. Cargo Weight Details */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>6. Cargo Weight Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Gross Weight (kg)">
              <input
                type="number"
                min="0"
                value={form.grossWeight}
                onChange={(e) => update("grossWeight", e.target.value)}
                className={inputClass}
                placeholder="e.g. 20000"
              />
            </Field>
            <Field label="Tare Weight (kg)">
              <input
                type="number"
                min="0"
                value={form.tareWeight}
                onChange={(e) => update("tareWeight", e.target.value)}
                className={inputClass}
                placeholder="e.g. 2500"
              />
            </Field>
            <Field label="Net Weight (kg)">
              <input
                type="number"
                min="0"
                value={form.netWeight}
                onChange={(e) => update("netWeight", e.target.value)}
                className={inputClass}
                placeholder="e.g. 17500"
              />
            </Field>
          </div>
        </section>

        {/* 7. Trip Fuel Details */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>7. Trip Fuel Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name of the Bunk" className="sm:col-span-2">
              <input
                type="text"
                value={form.bunkName}
                onChange={(e) => update("bunkName", e.target.value)}
                className={inputClass}
                placeholder="e.g. Shell Fuel Station, Coimbatore"
              />
            </Field>
            <Field label="Diesel Quantity (Litres)">
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.dieselQuantity}
                onChange={(e) => update("dieselQuantity", e.target.value)}
                className={inputClass}
                placeholder="e.g. 85"
              />
            </Field>
            <Field label="Total Cost (₹)">
              <input
                type="number"
                min="0"
                value={form.fuelTotalCost}
                onChange={(e) => update("fuelTotalCost", e.target.value)}
                className={inputClass}
                placeholder="e.g. 6800"
              />
            </Field>
          </div>
        </section>

        {/* 8. Trip Expenses */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>8. Trip Expenses</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Total Halt Days">
              <input
                type="number"
                min="0"
                value={form.totalHaltDays}
                onChange={(e) => update("totalHaltDays", e.target.value)}
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
                placeholder="e.g. Delayed at port due to documentation"
              />
            </Field>
            <Field label="Driver's Compensation (₹)">
              <input
                type="number"
                min="0"
                value={form.driversCompensation}
                onChange={(e) => update("driversCompensation", e.target.value)}
                className={inputClass}
                placeholder="e.g. 500"
              />
            </Field>
            <Field label="Halt Compensation (₹)">
              <input
                type="number"
                min="0"
                value={form.haltCompensation}
                onChange={(e) => update("haltCompensation", e.target.value)}
                className={inputClass}
                placeholder="e.g. 300"
              />
            </Field>
            <Field label="Port Pass Expense (பாஸ்) (₹)">
              <input
                type="number"
                min="0"
                value={form.portPassExpense}
                onChange={(e) => update("portPassExpense", e.target.value)}
                className={inputClass}
                placeholder="e.g. 250"
              />
            </Field>
            <Field label="Weight Sheet Expense (எடை) (₹)">
              <input
                type="number"
                min="0"
                value={form.weightSheetExpense}
                onChange={(e) => update("weightSheetExpense", e.target.value)}
                className={inputClass}
                placeholder="e.g. 150"
              />
            </Field>
            <Field label="Mamol Expense (இறக்கு / ஏற்று மாமூல்) (₹)">
              <input
                type="number"
                min="0"
                value={form.mamolExpense}
                onChange={(e) => update("mamolExpense", e.target.value)}
                className={inputClass}
                placeholder="e.g. 400"
              />
            </Field>
            <Field label="Claimable Mamol Expense (திரும்பப் பெறக்கூடிய இறக்கு / ஏற்று மாமூல்) (₹)">
              <input
                type="number"
                min="0"
                value={form.claimableMamolExpense}
                onChange={(e) => update("claimableMamolExpense", e.target.value)}
                className={inputClass}
                placeholder="e.g. 200"
              />
            </Field>
            <Field label="Traffic/RTO / Police Expense (₹)">
              <input
                type="number"
                min="0"
                value={form.trafficRtoPoliceExpense}
                onChange={(e) => update("trafficRtoPoliceExpense", e.target.value)}
                className={inputClass}
                placeholder="e.g. 100"
              />
            </Field>
            <Field label="Lift On / Off (லிப்டான்) (₹)">
              <input
                type="number"
                min="0"
                value={form.liftOnOffExpense}
                onChange={(e) => update("liftOnOffExpense", e.target.value)}
                className={inputClass}
                placeholder="e.g. 500"
              />
            </Field>
            <Field label="Crane Operator Expense (₹)">
              <input
                type="number"
                min="0"
                value={form.craneOperatorExpense}
                onChange={(e) => update("craneOperatorExpense", e.target.value)}
                className={inputClass}
                placeholder="e.g. 600"
              />
            </Field>
            <Field label="Parking Expenses (₹)">
              <input
                type="number"
                min="0"
                value={form.parkingExpenses}
                onChange={(e) => update("parkingExpenses", e.target.value)}
                className={inputClass}
                placeholder="e.g. 200"
              />
            </Field>
            <Field label="Puncture Expense (₹)">
              <input
                type="number"
                min="0"
                value={form.punctureExpense}
                onChange={(e) => update("punctureExpense", e.target.value)}
                className={inputClass}
                placeholder="e.g. 1500"
              />
            </Field>
            <Field label="Spare Parts Expense (₹)">
              <input
                type="number"
                min="0"
                value={form.sparePartsExpense}
                onChange={(e) => update("sparePartsExpense", e.target.value)}
                className={inputClass}
                placeholder="e.g. 2000"
              />
            </Field>
            <Field label="Other Expenses (₹)">
              <input
                type="number"
                min="0"
                value={form.otherExpenses}
                onChange={(e) => update("otherExpenses", e.target.value)}
                className={inputClass}
                placeholder="e.g. 500"
              />
            </Field>
            <Field label="Toll Expenses (₹)">
              <input
                type="number"
                min="0"
                value={form.tollExpenses}
                onChange={(e) => update("tollExpenses", e.target.value)}
                className={inputClass}
                placeholder="e.g. 1200"
              />
            </Field>
          </div>
        </section>

        {/* 9. Halt Information */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>9. Halt Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company Halt Days">
              <input
                type="number"
                min="0"
                value={form.companyHaltDays}
                onChange={(e) => update("companyHaltDays", e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </Field>
            <Field label="Party Halt Days">
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
                rows={3}
                value={form.haltRemarks}
                onChange={(e) => update("haltRemarks", e.target.value)}
                className={inputClass}
                placeholder="e.g. Delayed at port due to documentation"
              />
            </Field>
          </div>
        </section>

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onClose}
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
