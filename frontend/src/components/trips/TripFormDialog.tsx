"use client";

import { X, Calendar as CalendarIcon, Info, Sparkles } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
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
  CARGO_WEIGHT_OPTIONS,
  generateBookingReferenceNo,
  generateTripId,
} from "@/lib/trip-data";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { Branch } from "@/types/branch";
import { branchesApi } from "@/lib/api";
import { todayIst } from "@/lib/format-date";

const sectionHeadingClass =
  "text-xs font-semibold uppercase tracking-wider text-blue-900 bg-blue-50 px-3 py-2 rounded-lg";

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
  driverAdvance: "",
  driverCompensationType: "",
  transportHireAmount: "",
  transportCrossingAmount: "",
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
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (open) {
      if (initialData) {
        const { id: _id, tripId: _tripId, status: _status, vehicleId: _vehicleId, ...rest } = initialData;
        setForm(rest);
      } else {
        const initialDate = todayIst();
        setForm({
          ...emptyForm,
          bookingCreatedDate: initialDate,
          bookingReferenceNo: generateBookingReferenceNo(existingTrips, initialDate),
        });
      }
    }
  }, [open, initialData]);

  // Derive the branch percentage for the currently selected truck
  const selectedAssignment = assignableDrivers.find((a) => a.driver.driverId === form.driverId);
  const selectedTruckBranch = selectedAssignment?.truck.branchRegisteredTo ?? "";
  const selectedBranch = branches.find((b) => b.name === selectedTruckBranch);
  const compensationPct = selectedBranch ? parseFloat(selectedBranch.driverHaltDayPercentage || "0") : null;
  const isNormalComp = form.driverCompensationType === "Normal";

  function calcCompensation(hireAmount: string, pct: number | null): string {
    if (pct === null || !hireAmount) return "";
    const hire = parseFloat(hireAmount);
    if (isNaN(hire) || hire <= 0) return "";
    return String(Math.round(hire * (pct / 100)));
  }

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

  // When the assigned vehicle/driver changes, re-derive branch and auto-calculate if Normal
  function handleDriverChange(driverId: string) {
    setForm((prev) => {
      const assignment = assignableDrivers.find((a) => a.driver.driverId === driverId);
      const branch = branches.find((b) => b.name === (assignment?.truck.branchRegisteredTo ?? ""));
      const pct = branch ? parseFloat(branch.driverHaltDayPercentage || "0") : null;
      const driverAdvanceAmount =
        prev.driverCompensationType === "Normal"
          ? calcCompensation(prev.transportHireAmount, pct)
          : prev.driverAdvanceAmount;
      return { ...prev, driverId, driverAdvanceAmount };
    });
  }

  // When hire amount changes, auto-calculate if Normal comp type is active
  function handleHireAmountChange(value: string) {
    setForm((prev) => {
      const assignment = assignableDrivers.find((a) => a.driver.driverId === prev.driverId);
      const branch = branches.find((b) => b.name === (assignment?.truck.branchRegisteredTo ?? ""));
      const pct = branch ? parseFloat(branch.driverHaltDayPercentage || "0") : null;
      const driverAdvanceAmount =
        prev.driverCompensationType === "Normal"
          ? calcCompensation(value, pct)
          : prev.driverAdvanceAmount;
      return { ...prev, transportHireAmount: value, driverAdvanceAmount };
    });
  }

  // When compensation type changes, auto-calculate for Normal or clear for Fixed (user enters manually)
  function handleCompensationTypeChange(val: string) {
    setForm((prev) => {
      const assignment = assignableDrivers.find((a) => a.driver.driverId === prev.driverId);
      const branch = branches.find((b) => b.name === (assignment?.truck.branchRegisteredTo ?? ""));
      const pct = branch ? parseFloat(branch.driverHaltDayPercentage || "0") : null;
      const driverAdvanceAmount =
        val === "Normal"
          ? calcCompensation(prev.transportHireAmount, pct)
          : "";
      return { ...prev, driverCompensationType: val as Trip["driverCompensationType"], driverAdvanceAmount };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const assigned = assignableDrivers.find((a) => a.driver.driverId === form.driverId);
    if (!assigned) return;

    if (initialData) {
      onSave({
        id: initialData.id,
        tripId: initialData.tripId,
        status: initialData.status,
        assignedDate: initialData.assignedDate,
        vehicleId: initialData.vehicleId,
        ...form,
      });
    } else {
      onSave({
        id: crypto.randomUUID(),
        tripId: generateTripId(existingTrips),
        status: "Assigned",
        assignedDate: todayIst(),
        vehicleId: assigned.truck.truckId,
        ...form,
      });
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Trip" : "Assign Trip"} className="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Booking Information */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>Booking Information</p>
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
              <GlassSelect
                value={form.tripCategory}
                onChange={(val) => update("tripCategory", val as Trip["tripCategory"])}
                options={[
                  { value: "", label: "Select trip category" },
                  ...TRIP_CATEGORY_OPTIONS.map(o => ({ value: o, label: o }))
                ]}
              />
            </Field>

            <Field label="Movement Category" required>
              <GlassSelect
                value={form.movementCategory}
                onChange={(val) => update("movementCategory", val as Trip["movementCategory"])}
                options={[
                  { value: "", label: "Select movement category" },
                  ...MOVEMENT_CATEGORY_OPTIONS.map(o => ({ value: o, label: o }))
                ]}
              />
            </Field>
          </div>
        </section>

        {/* Customer Information */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>Customer Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Customer Account" required>
              <GlassSelect
                value={form.customerId}
                onChange={(val) => handleCustomerChange(val)}
                options={[
                  { value: "", label: "Select a customer" },
                  ...customers.map(c => ({ value: c.id, label: c.name }))
                ]}
              />
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
          <p className={sectionHeadingClass}>Cargo Information</p>
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
              <GlassSelect
                value={form.cargoClassification}
                onChange={(val) => update("cargoClassification", val as Trip["cargoClassification"])}
                options={[
                  { value: "", label: "Select cargo classification" },
                  ...CARGO_CLASSIFICATION_OPTIONS.map(o => ({ value: o, label: o }))
                ]}
              />
            </Field>

            <Field label="Container Specification" required>
              <GlassSelect
                value={form.containerSpecification}
                onChange={(val) => update("containerSpecification", val as Trip["containerSpecification"])}
                options={[
                  { value: "", label: "Select container specification" },
                  ...CONTAINER_SPECIFICATION_OPTIONS.map(o => ({ value: o, label: o }))
                ]}
              />
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
              <GlassSelect
                value={form.cargoWeight}
                onChange={(val) => update("cargoWeight", val)}
                options={[
                  { value: "", label: "Select cargo weight" },
                  ...CARGO_WEIGHT_OPTIONS.map(o => ({ value: o, label: o }))
                ]}
              />
            </Field>
          </div>
        </section>

        {/* Route Information */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>Route Information</p>
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
          <p className={sectionHeadingClass}>Shipping Information</p>
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
          <p className={sectionHeadingClass}>Vehicle &amp; Trip Assignment</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Transport Method" required>
              <GlassSelect
                value={form.transportMethod}
                onChange={(val) => update("transportMethod", val as Trip["transportMethod"])}
                options={[
                  { value: "", label: "Select transport method" },
                  ...TRANSPORT_METHOD_OPTIONS.map(o => ({ value: o, label: o }))
                ]}
              />
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
              <GlassSelect
                value={form.driverId}
                onChange={handleDriverChange}
                options={[
                  { value: "", label: assignableDrivers.length === 0 ? "No drivers with an assigned vehicle" : "Select a driver / vehicle" },
                  ...assignableDrivers.map(({ driver, truck }) => ({
                    value: driver.driverId,
                    label: `${driver.name} — ${truck.registrationNumber}`
                  }))
                ]}
              />
              {selectedAssignment && (
                <span className="text-xs text-gray-500">
                  Vehicle: {selectedAssignment.truck.truckId} — {selectedAssignment.truck.registrationNumber}
                  {selectedTruckBranch && (
                    <> · Branch: <strong>{selectedTruckBranch}</strong></>
                  )}
                  {compensationPct !== null && (
                    <> · Compensation: <strong>{compensationPct}%</strong></>
                  )}
                </span>
              )}
            </Field>
          </div>
        </section>

        {/* Payment & Advances */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>Payment &amp; Advances</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bill To" required>
              <GlassSelect
                value={form.billTo}
                onChange={(val) => update("billTo", val as Trip["billTo"])}
                options={[
                  { value: "", label: "Select bill to" },
                  ...BILL_TO_OPTIONS.map(o => ({ value: o, label: o }))
                ]}
              />
            </Field>

            <Field label="Payment Type" required>
              <GlassSelect
                value={form.paymentType}
                onChange={(val) => update("paymentType", val as Trip["paymentType"])}
                options={[
                  { value: "", label: "Select payment type" },
                  ...PAYMENT_TYPE_OPTIONS.map(o => ({ value: o, label: o }))
                ]}
              />
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
          <p className={sectionHeadingClass}>Driver Compensation</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Driver Compensation Type" required>
              <GlassCombobox
                required
                value={form.driverCompensationType}
                onChange={handleCompensationTypeChange}
                placeholder="Select or type compensation type"
                options={DRIVER_COMPENSATION_TYPE_OPTIONS.map(opt => ({ value: opt, label: opt }))}
              />
            </Field>

            <Field label="Driver Advance Payment Method" required>
              <GlassCombobox
                required
                value={form.driverAdvancePaymentMethod}
                onChange={(val) => update("driverAdvancePaymentMethod", val as Trip["driverAdvancePaymentMethod"])}
                placeholder="Select or type payment method"
                options={DRIVER_ADVANCE_PAYMENT_METHOD_OPTIONS.map(opt => ({ value: opt, label: opt }))}
              />
            </Field>

            <Field label="Driver Advance (₹)">
              <input
                type="number"
                min="0"
                value={form.driverAdvance}
                onChange={(e) => update("driverAdvance", e.target.value)}
                className={inputClass}
                placeholder="e.g. 1000"
              />
            </Field>

            <Field label="Driver Batta Amount (₹)" required>
              <input
                type="number"
                min="0"
                value={form.driverAdvanceAmount}
                onChange={(e) => update("driverAdvanceAmount", e.target.value)}
                readOnly={isNormalComp}
                className={`${inputClass} ${isNormalComp ? "cursor-not-allowed bg-green-50 text-green-800" : ""}`}
                placeholder={isNormalComp ? "Auto-calculated" : "Enter fixed batta amount"}
              />
              {isNormalComp && form.driverAdvanceAmount && (
                <span className="mt-1 flex items-center gap-1 text-xs text-green-700">
                  <Sparkles className="h-3 w-3" />
                  Auto-calculated: ₹{Number(form.driverAdvanceAmount).toLocaleString("en-IN")}
                  {compensationPct !== null && selectedTruckBranch
                    ? ` (${compensationPct}% of hire amount — ${selectedTruckBranch} branch)`
                    : " — assign a vehicle with a configured branch to auto-calculate"}
                </span>
              )}
              {isNormalComp && !form.driverAdvanceAmount && (
                <span className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                  <Info className="h-3 w-3" />
                  {!form.driverId
                    ? "Select a vehicle first"
                    : !selectedTruckBranch || compensationPct === null
                    ? `Branch "${selectedTruckBranch || "unknown"}" has no compensation % configured`
                    : "Enter hire amount below to auto-calculate"}
                </span>
              )}
            </Field>
          </div>
        </section>

        {/* Transport Cost Details */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>Transport Cost Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Transport Hire Amount (₹)" required>
              <input
                type="number"
                min="0"
                value={form.transportHireAmount}
                onChange={(e) => handleHireAmountChange(e.target.value)}
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
          <p className={sectionHeadingClass}>Operational Notes</p>
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
