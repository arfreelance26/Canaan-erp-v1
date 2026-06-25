"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import {
  BILL_TO_OPTIONS,
  PAYMENT_TYPE_OPTIONS,
  CARGO_CLASSIFICATION_OPTIONS,
  CONTAINER_SPECIFICATION_OPTIONS,
  DRIVER_ADVANCE_PAYMENT_METHOD_OPTIONS,
  DRIVER_COMPENSATION_TYPE_OPTIONS,
  MOVEMENT_CATEGORY_OPTIONS,
  TRANSPORT_METHOD_OPTIONS,
  TRIP_CATEGORY_OPTIONS,
  generateBookingReferenceNo,
  generateTripId,
} from "@/lib/trip-data";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";

type AssignableDriver = {
  driver: Driver;
  truck: Truck;
};

type TripFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (trip: Trip) => void;
  initialData?: Trip | null;
  existingTrips: Trip[];
  customers: Customer[];
  assignableDrivers: AssignableDriver[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm: Omit<Trip, "id" | "tripId" | "status" | "vehicleId" | "assignedDate"> = {
  bookingReferenceNo: "",
  bookingCreatedDate: "",
  tripCategory: "",
  movementCategory: "",
  customerId: "",
  shipperConsignee: "",
  cargoClassification: "",
  containerSpecification: "",
  containerNumber: "",
  containerNumber1: "",
  containerNumber2: "",
  cargoReference: "",
  releaseOrderReference: "",
  cargoWeight: "",
  origin: "",
  destination: "",
  shippingLine: "",
  vesselName: "",
  transportMethod: "",
  scheduledDate: "",
  driverId: "",
  billTo: "",
  paymentType: "",
  customerCashAdvance: "",
  customerFuelAdvanceAmount: "",
  customerFuelAdvanceLitres: "",
  driverAdvanceAmount: "",
  driverAdvancePaymentMethod: "",
  driverCompensationType: "",
  transportHireAmount: "",
  transportCrossingAmount: "",
  finalSettlementAmount: "",
  internalRemarks: "",
  bookingInstructions: "",
};

export function TripFormDialog({
  open,
  onClose,
  onSave,
  initialData,
  existingTrips,
  customers,
  assignableDrivers,
}: TripFormDialogProps) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      if (initialData) {
        // Edit mode: populate form with existing trip data
        const { id: _id, tripId: _tripId, status: _status, vehicleId: _vehicleId, ...rest } = initialData;
        setForm(rest);
      } else {
        // Create mode: initialize with empty form
        const initialDate = todayIso();
        setForm({
          ...emptyForm,
          bookingCreatedDate: initialDate,
          bookingReferenceNo: generateBookingReferenceNo(existingTrips, initialDate),
        });
      }
    }
  }, [open, initialData, existingTrips]);

  function update<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleBookingDateChange(value: string) {
    setForm((prev) => ({
      ...prev,
      bookingCreatedDate: value,
      bookingReferenceNo: generateBookingReferenceNo(existingTrips, value),
    }));
  }

  function handleCustomerChange(customerId: string) {
    const selectedCustomer = customers.find((c) => c.id === customerId);
    if (selectedCustomer) {
      setForm((prev) => ({
        ...prev,
        customerId,
        shipperConsignee: selectedCustomer.name,
      }));
    } else {
      update("customerId", customerId);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const assigned = assignableDrivers.find((a) => a.driver.driverId === form.driverId);
    if (!assigned) return;

    if (initialData) {
      // Edit mode: keep existing id, tripId, status, vehicleId, assignedDate
      onSave({
        id: initialData.id,
        tripId: initialData.tripId,
        status: initialData.status,
        assignedDate: initialData.assignedDate,
        vehicleId: initialData.vehicleId,
        ...form,
      });
    } else {
      // Create mode: generate new id, tripId, set assignedDate to today, and use assigned truck
      onSave({
        id: crypto.randomUUID(),
        tripId: generateTripId(existingTrips),
        status: "Assigned",
        assignedDate: todayIso(),
        vehicleId: assigned.truck.truckId,
        ...form,
      });
    }
  }

  const selectedAssignment = assignableDrivers.find((a) => a.driver.driverId === form.driverId);

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Trip" : "Assign Trip"} className="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Booking Information */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-gray-900">Booking Information</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Booking Reference No" required>
              <input
                type="text"
                readOnly
                disabled
                value={form.bookingReferenceNo}
                className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
              />
            </Field>

            <Field label="Booking Created Date" required>
              <input
                type="date"
                required
                value={form.bookingCreatedDate}
                onChange={(e) => handleBookingDateChange(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Trip Category" required>
              <select
                required
                value={form.tripCategory}
                onChange={(e) => update("tripCategory", e.target.value as Trip["tripCategory"])}
                className={inputClass}
              >
                <option value="" disabled>
                  Select trip category
                </option>
                {TRIP_CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Movement Category" required>
              <select
                required
                value={form.movementCategory}
                onChange={(e) => update("movementCategory", e.target.value as Trip["movementCategory"])}
                className={inputClass}
              >
                <option value="" disabled>
                  Select movement category
                </option>
                {MOVEMENT_CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* Customer Information */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-gray-900">Customer Information</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Customer Account" required>
              <select
                required
                value={form.customerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Select a customer
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Shipper / Consignee" required>
              <input
                type="text"
                required
                value={form.shipperConsignee}
                onChange={(e) => update("shipperConsignee", e.target.value)}
                className={inputClass}
                placeholder="e.g. Sri Lakshmi Traders"
              />
            </Field>
          </div>

          {/* Customer Details Display */}
          {form.customerId && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 className="mb-3 text-sm font-semibold text-blue-900">Customer Details</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(() => {
                  const customer = customers.find((c) => c.id === form.customerId);
                  if (!customer) return null;
                  return (
                    <>
                      <div>
                        <p className="text-xs font-medium text-blue-700">Contact Person</p>
                        <p className="mt-1 text-sm text-blue-900">{customer.contactPersonnelName}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-blue-700">Phone</p>
                        <p className="mt-1 text-sm text-blue-900">{customer.phone}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-blue-700">Email</p>
                        <p className="mt-1 text-sm text-blue-900">{customer.email}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-blue-700">Customer Type</p>
                        <p className="mt-1 text-sm text-blue-900">{customer.customerType}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium text-blue-700">Address</p>
                        <p className="mt-1 text-sm text-blue-900">{customer.address}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-blue-700">GSTIN</p>
                        <p className="mt-1 text-sm text-blue-900">{customer.gstin}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-blue-700">Status</p>
                        <p className="mt-1 inline-block rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                          {customer.status}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </section>

        {/* Cargo Information */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-gray-900">Cargo Information</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {form.containerSpecification === "2 X 20 FEET CONTAINERS" ? (
              <>
                <Field label="Container Number for the First Container" required>
                  <input
                    type="text"
                    required
                    value={form.containerNumber1}
                    onChange={(e) => update("containerNumber1", e.target.value)}
                    className={inputClass}
                    placeholder="e.g. CONT-554821"
                  />
                </Field>
                <Field label="Container Number for the Second Container" required>
                  <input
                    type="text"
                    required
                    value={form.containerNumber2}
                    onChange={(e) => update("containerNumber2", e.target.value)}
                    className={inputClass}
                    placeholder="e.g. CONT-554822"
                  />
                </Field>
              </>
            ) : form.containerSpecification === "20 FT CONTAINER" || form.containerSpecification === "40 FT CONTAINER" ? (
              <Field label="Container Number" required>
                <input
                  type="text"
                  required
                  value={form.containerNumber}
                  onChange={(e) => update("containerNumber", e.target.value)}
                  className={inputClass}
                  placeholder="e.g. CONT-554821"
                />
              </Field>
            ) : form.containerSpecification === "OPEN LOAD CARGO" ? (
              <Field label="Cargo Reference" required>
                <input
                  type="text"
                  required
                  value={form.cargoReference}
                  onChange={(e) => update("cargoReference", e.target.value)}
                  className={inputClass}
                  placeholder="e.g. CARGO-12345"
                />
              </Field>
            ) : null}

            <Field label="Cargo Classification" required>
              <select
                required
                value={form.cargoClassification}
                onChange={(e) => update("cargoClassification", e.target.value as Trip["cargoClassification"])}
                className={inputClass}
              >
                <option value="" disabled>
                  Select cargo classification
                </option>
                {CARGO_CLASSIFICATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Container Specification" required>
              <select
                required
                value={form.containerSpecification}
                onChange={(e) => update("containerSpecification", e.target.value as Trip["containerSpecification"])}
                className={inputClass}
              >
                <option value="" disabled>
                  Select container specification
                </option>
                {CONTAINER_SPECIFICATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Release Order Reference" required>
              <input
                type="text"
                required
                value={form.releaseOrderReference}
                onChange={(e) => update("releaseOrderReference", e.target.value)}
                className={inputClass}
                placeholder="e.g. RO-99231"
              />
            </Field>

            <Field label="Cargo Weight (tons)" required>
              <input
                type="number"
                required
                min="0"
                step="0.1"
                value={form.cargoWeight}
                onChange={(e) => update("cargoWeight", e.target.value)}
                className={inputClass}
                placeholder="e.g. 14"
              />
            </Field>
          </div>
        </section>

        {/* Route Information */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-gray-900">Route Information</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Origin Location" required>
              <input
                type="text"
                required
                value={form.origin}
                onChange={(e) => update("origin", e.target.value)}
                className={inputClass}
                placeholder="e.g. Coimbatore"
              />
            </Field>

            <Field label="Destination Location" required>
              <input
                type="text"
                required
                value={form.destination}
                onChange={(e) => update("destination", e.target.value)}
                className={inputClass}
                placeholder="e.g. Bengaluru"
              />
            </Field>
          </div>
        </section>

        {/* Shipping Information */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-gray-900">Shipping Information</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Shipping Line" required>
              <input
                type="text"
                value={form.shippingLine}
                onChange={(e) => update("shippingLine", e.target.value)}
                className={inputClass}
                placeholder="e.g. Cochin Shipyard Lines"
              />
            </Field>

            <Field label="Vessel Name" required>
              <input
                type="text"
                value={form.vesselName}
                onChange={(e) => update("vesselName", e.target.value)}
                className={inputClass}
                placeholder="e.g. MV Malabar Star"
              />
            </Field>
          </div>
        </section>

        {/* Vehicle & Trip Assignment */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-gray-900">Vehicle &amp; Trip Assignment</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Transport Method" required>
              <select
                required
                value={form.transportMethod}
                onChange={(e) => update("transportMethod", e.target.value as Trip["transportMethod"])}
                className={inputClass}
              >
                <option value="" disabled>
                  Select transport method
                </option>
                {TRANSPORT_METHOD_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Scheduled Trip Date" required>
              <input
                type="date"
                required
                value={form.scheduledDate}
                onChange={(e) => update("scheduledDate", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Assigned Vehicle" className="sm:col-span-2">
              <select
                required
                value={form.driverId}
                onChange={(e) => update("driverId", e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  {assignableDrivers.length === 0 ? "No drivers with an assigned vehicle" : "Select a driver / vehicle"}
                </option>
                {assignableDrivers.map(({ driver, truck }) => (
                  <option key={driver.id} value={driver.driverId}>
                    {driver.name} — {truck.registrationNumber}
                  </option>
                ))}
              </select>
              {selectedAssignment && (
                <span className="text-xs text-gray-500">
                  Vehicle: {selectedAssignment.truck.truckId} — {selectedAssignment.truck.registrationNumber}
                </span>
              )}
            </Field>
          </div>
        </section>

        {/* Payment & Advances */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-gray-900">Payment &amp; Advances</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bill To" required>
              <select
                required
                value={form.billTo}
                onChange={(e) => update("billTo", e.target.value as Trip["billTo"])}
                className={inputClass}
              >
                <option value="" disabled>
                  Select bill to
                </option>
                {BILL_TO_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Payment Type" required>
              <select
                required
                value={form.paymentType}
                onChange={(e) => update("paymentType", e.target.value as Trip["paymentType"])}
                className={inputClass}
              >
                <option value="" disabled>
                  Select payment type
                </option>
                {PAYMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Customer Cash Advance (₹)" required>
              <input
                type="number"
                min="0"
                value={form.customerCashAdvance}
                onChange={(e) => update("customerCashAdvance", e.target.value)}
                className={inputClass}
                placeholder="e.g. 5000"
              />
            </Field>

            <Field label="Customer Fuel Advance (₹)" required>
              <input
                type="number"
                min="0"
                value={form.customerFuelAdvanceAmount}
                onChange={(e) => update("customerFuelAdvanceAmount", e.target.value)}
                className={inputClass}
                placeholder="e.g. 8000"
              />
            </Field>

            <Field label="Customer Fuel Advance (Litres)" required>
              <input
                type="number"
                min="0"
                value={form.customerFuelAdvanceLitres}
                onChange={(e) => update("customerFuelAdvanceLitres", e.target.value)}
                className={inputClass}
                placeholder="e.g. 85"
              />
            </Field>
          </div>
        </section>

        {/* Driver Compensation */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-gray-900">Driver Compensation</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Driver Advance Amount (₹)" required>
              <input
                type="number"
                min="0"
                value={form.driverAdvanceAmount}
                onChange={(e) => update("driverAdvanceAmount", e.target.value)}
                className={inputClass}
                placeholder="e.g. 2000"
              />
            </Field>

            <Field label="Driver Advance Payment Method" required>
              <input
                type="text"
                required
                list="driver-advance-payment-method-options"
                value={form.driverAdvancePaymentMethod}
                onChange={(e) => update("driverAdvancePaymentMethod", e.target.value as Trip["driverAdvancePaymentMethod"])}
                className={inputClass}
                placeholder="Select or type payment method"
              />
              <datalist id="driver-advance-payment-method-options">
                {DRIVER_ADVANCE_PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>

            <Field label="Driver Compensation Type" required>
              <input
                type="text"
                required
                list="driver-compensation-type-options"
                value={form.driverCompensationType}
                onChange={(e) => update("driverCompensationType", e.target.value as Trip["driverCompensationType"])}
                className={inputClass}
                placeholder="Select or type compensation type"
              />
              <datalist id="driver-compensation-type-options">
                {DRIVER_COMPENSATION_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
          </div>
        </section>

        {/* Transport Cost Details */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-gray-900">Transport Cost Details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Transport Hire Amount (₹)" required>
              <input
                type="number"
                min="0"
                value={form.transportHireAmount}
                onChange={(e) => update("transportHireAmount", e.target.value)}
                className={inputClass}
                placeholder="e.g. 32000"
              />
            </Field>

            <Field label="Transport Crossing Amount (₹)" required>
              <input
                type="number"
                min="0"
                value={form.transportCrossingAmount}
                onChange={(e) => update("transportCrossingAmount", e.target.value)}
                className={inputClass}
                placeholder="e.g. 0"
              />
            </Field>
          </div>
        </section>

        {/* Operational Notes */}
        <section className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-gray-900">Operational Notes</h3>
          <div className="grid grid-cols-1 gap-4">
            <Field label="Internal Remarks" required>
              <textarea
                value={form.internalRemarks}
                onChange={(e) => update("internalRemarks", e.target.value)}
                className={`${inputClass} min-h-20 resize-y`}
                placeholder="Notes visible to internal staff only"
              />
            </Field>

            <Field label="Booking Instructions" required>
              <textarea
                value={form.bookingInstructions}
                onChange={(e) => update("bookingInstructions", e.target.value)}
                className={`${inputClass} min-h-20 resize-y`}
                placeholder="Instructions related to this booking"
              />
            </Field>
          </div>
        </section>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={assignableDrivers.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Assign Trip
          </button>
        </div>
      </form>
    </Dialog>
  );
}
