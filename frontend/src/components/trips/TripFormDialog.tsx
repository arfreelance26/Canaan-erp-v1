"use client";

import { X, Info, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
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
  TRIP_CATEGORY_OPTIONS,
  CARGO_WEIGHT_OPTIONS,
  generateBookingReferenceNo,
  generateTripId,
} from "@/lib/trip-data";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { CustomerDestination } from "@/types/customer-destination";
import type { CustomerOrigin } from "@/types/customer-origin";
import type { CustomerPricing } from "@/types/customer-pricing";
import type { Branch } from "@/types/branch";
import { branchesApi, customersApi, tripsApi } from "@/lib/api";
import { todayIst } from "@/lib/format-date";
import { AutocompleteInput, saveToAutocompleteHistory, getAutocompleteHistory } from "@/components/ui/AutocompleteInput";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";

export const TRIP_DRAFT_KEY = "erp_trip_form_draft";
const TRIP_VEHICLE_DRAFT_KEY = "erp_trip_form_draft_vehicle";

export function clearTripDraft() {
  clearFormDraft(TRIP_DRAFT_KEY);
  try { sessionStorage.removeItem(TRIP_VEHICLE_DRAFT_KEY); } catch {}
}

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

const sectionHeadingClass =
  "text-xs font-semibold uppercase tracking-wider text-blue-900 bg-blue-50 px-3 py-2 rounded-lg";

type AssignableDriver = {
  driver: Driver;
  truck: Truck;
  isActive?: boolean;
};

type TripFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (trip: Trip) => void;
  initialData?: Trip | null;
  existingTrips: Trip[];
  customers: Customer[];
  assignableDrivers: AssignableDriver[];
  drivers: Driver[];
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
  driverChangeRemark: "",
  bookingInstructions: "",
  hasClosure: false,
  hasSheet: false,
  tripSheetCollected: false,
  tripSheetCollectedAt: null,
  tripSheetReceived: false,
  tripSheetReceivedAt: null,
  verificationStatus: "pending",
  isInvoiced: false,
  invoiceRequired: true,
};

export function TripFormDialog({
  open,
  onClose,
  onSave,
  initialData,
  existingTrips,
  customers,
  assignableDrivers,
  drivers,
}: TripFormDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const [vehicleAssignmentId, setVehicleAssignmentId] = useState<string>("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customerDestinations, setCustomerDestinations] = useState<CustomerDestination[]>([]);
  const [customerOrigins, setCustomerOrigins] = useState<CustomerOrigin[]>([]);
  const [customerPricing, setCustomerPricing] = useState<CustomerPricing[]>([]);
  const [dbOrigins, setDbOrigins] = useState<string[]>([]);
  const [dbDestinations, setDbDestinations] = useState<string[]>([]);
  const wasOpenRef = useRef(false);
  const vehicleRestoredRef = useRef(false);

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => setBranches([]));
    tripsApi.getAutocompleteValues().then((v) => { setDbOrigins(v.origins); setDbDestinations(v.destinations); }).catch(() => {});
  }, []);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (justOpened) {
      if (initialData) {
        const { id: _id, tripId: _tripId, status: _status, vehicleId: _vehicleId, ...rest } = initialData;
        setForm(rest);
        const vehicleAssignment = assignableDrivers.find((a) => a.truck.truckId === initialData.vehicleId);
        setVehicleAssignmentId(vehicleAssignment?.driver.driverId ?? "");
        if (initialData.customerId) {
          customersApi.listDestinations(initialData.customerId).then(setCustomerDestinations).catch(() => {});
          customersApi.listPricing(initialData.customerId).then(setCustomerPricing).catch(() => {});
          customersApi.listOrigins(initialData.customerId).then(setCustomerOrigins).catch(() => {});
        }
      } else {
        const initialDate = todayIst();
        setVehicleAssignmentId("");
        setCustomerDestinations([]);
        setCustomerPricing([]);
        setCustomerOrigins([]);
        setForm({
          ...emptyForm,
          bookingCreatedDate: initialDate,
          bookingReferenceNo: generateBookingReferenceNo(existingTrips, initialDate),
        });
      }
    }
  }, [open, initialData]);

  // Preserve unsaved "Add Trip" input across close/reopen — only for a genuinely new trip,
  // never when editing (editing always loads real data from initialData above).
  useFormDraft(TRIP_DRAFT_KEY, open && !initialData, form, setForm);

  // vehicleAssignmentId is not part of `form`, so useFormDraft can't save/restore it.
  // We persist it in a separate sessionStorage key using the same restoredRef pattern.
  const draftActive = open && !initialData;

  // Restore: runs when the form opens and assignableDrivers are available.
  // Defined after the [open, initialData] effect so both fire in the same flush —
  // React 18 batches the two setVehicleAssignmentId calls; restore wins as it runs last.
  useEffect(() => {
    if (!draftActive) {
      vehicleRestoredRef.current = false;
      return;
    }
    if (vehicleRestoredRef.current || assignableDrivers.length === 0) return;
    vehicleRestoredRef.current = true;
    try {
      const stored = sessionStorage.getItem(TRIP_VEHICLE_DRAFT_KEY);
      if (stored && assignableDrivers.some((a) => a.driver.driverId === stored)) {
        setVehicleAssignmentId(stored);
      }
    } catch {}
  }, [draftActive, assignableDrivers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save: only write non-empty values and only after restore has run.
  useEffect(() => {
    if (!draftActive || !vehicleRestoredRef.current) return;
    try {
      if (vehicleAssignmentId) {
        sessionStorage.setItem(TRIP_VEHICLE_DRAFT_KEY, vehicleAssignmentId);
      }
    } catch {}
  }, [draftActive, vehicleAssignmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (form.tripCategory === "RETURN TRIP") return;
    const rule = BATTA_RULES[form.tripCategory]?.[form.containerSpecification];
    if (rule) {
      setForm((prev) => ({
        ...prev,
        driverCompensationType: rule.type as Trip["driverCompensationType"],
        driverAdvanceAmount: rule.amount,
      }));
    }
  }, [form.tripCategory, form.containerSpecification]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAssignment = assignableDrivers.find((a) => a.driver.driverId === vehicleAssignmentId);
  const selectedTruckBranch = selectedAssignment?.truck.branchRegisteredTo ?? "";
  const selectedBranch = branches.find((b) => b.name === selectedTruckBranch);
  const compensationPct = selectedBranch ? parseFloat(selectedBranch.driverHaltDayPercentage || "0") : null;
  const isNormalComp = form.driverCompensationType === "Normal";
  const isShifting = form.tripCategory === "SHIFTING";
  const isReturnTrip = form.tripCategory === "RETURN TRIP";
  const battaRule = BATTA_RULES[form.tripCategory]?.[form.containerSpecification];

  const destinationOptions = customerDestinations
    .map((d) => {
      const label = d.destinationName ?? d.destinationAddress ?? "";
      return { value: label, label };
    })
    .filter((o) => o.value !== "");

  const customerOriginNames = customerOrigins.map((o) => o.originName).filter(Boolean);

  const allOriginOptions = (() => {
    const existing = new Set(customerOriginNames.map((o) => o.toLowerCase()));
    const historyPool = [
      ...getAutocompleteHistory("erp_origin_history"),
      ...dbOrigins,
    ].filter((h, i, arr) => arr.indexOf(h) === i);
    return [
      ...customerOriginNames,
      ...historyPool.filter((h) => !existing.has(h.toLowerCase())),
    ];
  })();

  const allDestinationOptions = (() => {
    const existing = new Set(destinationOptions.map((d) => d.value.toLowerCase()));
    const historyPool = [
      ...getAutocompleteHistory("erp_destination_history"),
      ...dbDestinations,
    ].filter((h, i, arr) => arr.indexOf(h) === i); // dedupe
    return [
      ...destinationOptions,
      ...historyPool
        .filter((h) => !existing.has(h.toLowerCase()))
        .map((h) => ({ value: h, label: h })),
    ];
  })();

  function containerTypeToSpec(ct: string): Trip["containerSpecification"] | "" {
    const map: Record<string, Trip["containerSpecification"]> = {
      "20 FEET": "20 FT CONTAINER",
      "40 FEET": "40 FT CONTAINER",
      "2 X 20 FEET": "2 X 20 FEET CONTAINERS",
      "OPEN LOAD": "OPEN LOAD CARGO",
    };
    return map[ct] ?? "";
  }

  function applyPricingFields(p: CustomerPricing): Partial<typeof emptyForm> {
    const destinationString = typeof p.customerDestination === 'object' && p.customerDestination !== null
      ? ((p.customerDestination as any).destinationName ?? (p.customerDestination as any).destinationAddress ?? "")
      : String(p.customerDestination || "");

    return {
      destination: destinationString,
      cargoClassification: (p.cargoClassification as Trip["cargoClassification"]) || "",
      containerSpecification: (containerTypeToSpec(p.containerType) as Trip["containerSpecification"]) || "",
      cargoWeight: p.weightInTons || "",
      transportHireAmount: p.rate || "",
    };
  }

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
      ...(initialData ? {} : { bookingReferenceNo: generateBookingReferenceNo(existingTrips, value) }),
    }));
  }

  function handleCustomerChange(customerId: string) {
    const selectedCustomer = customers.find((c) => c.id === customerId);
    const returnTrip = form.tripCategory === "RETURN TRIP";
    setForm((prev) => ({
      ...prev,
      customerId,
      shipperConsignee: selectedCustomer?.name ?? prev.shipperConsignee,
      origin: "",
      destination: "",
      cargoClassification: "",
      containerSpecification: "",
      cargoWeight: "",
      transportHireAmount: "",
    }));
    setCustomerDestinations([]);
    setCustomerPricing([]);
    setCustomerOrigins([]);
    if (customerId) {
      customersApi.listDestinations(customerId).then(setCustomerDestinations).catch(() => {});
      customersApi.listPricing(customerId).then((pricing) => {
        setCustomerPricing(pricing);
        if (pricing.length > 0 && !returnTrip) {
          setForm((prev) => ({ ...prev, ...applyPricingFields(pricing[0]) }));
        }
      }).catch(() => {});
      customersApi.listOrigins(customerId).then((origins) => {
        setCustomerOrigins(origins);
        if (origins.length > 0 && !returnTrip) {
          setForm((prev) => ({ ...prev, origin: origins[0].originName }));
        }
      }).catch(() => {});
    }
  }

  function handleDestinationChange(destination: string) {
    if (form.tripCategory === "RETURN TRIP") {
      setForm((prev) => ({ ...prev, destination }));
      return;
    }
    const matchingPricing = customerPricing.find((p) => p.customerDestination === destination);
    setForm((prev) => ({
      ...prev,
      ...(matchingPricing ? applyPricingFields(matchingPricing) : { destination }),
    }));
  }

  function handleVehicleChange(assignmentDriverId: string) {
    setVehicleAssignmentId(assignmentDriverId);
    setForm((prev) => {
      if (prev.tripCategory === "RETURN TRIP") return { ...prev, driverId: assignmentDriverId };
      const assignment = assignableDrivers.find((a) => a.driver.driverId === assignmentDriverId);
      const branch = branches.find((b) => b.name === (assignment?.truck.branchRegisteredTo ?? ""));
      const pct = branch ? parseFloat(branch.driverHaltDayPercentage || "0") : null;
      const driverAdvanceAmount =
        prev.driverCompensationType === "Normal"
          ? calcCompensation(prev.transportHireAmount, pct)
          : prev.driverAdvanceAmount;
      return { ...prev, driverId: assignmentDriverId, driverAdvanceAmount };
    });
  }

  function handleHireAmountChange(value: string) {
    setForm((prev) => {
      if (prev.tripCategory === "RETURN TRIP") return { ...prev, transportHireAmount: value };
      const assignment = assignableDrivers.find((a) => a.driver.driverId === vehicleAssignmentId);
      const branch = branches.find((b) => b.name === (assignment?.truck.branchRegisteredTo ?? ""));
      const pct = branch ? parseFloat(branch.driverHaltDayPercentage || "0") : null;
      const driverAdvanceAmount =
        prev.driverCompensationType === "Normal"
          ? calcCompensation(value, pct)
          : prev.driverAdvanceAmount;
      return { ...prev, transportHireAmount: value, driverAdvanceAmount };
    });
  }

  function handleCompensationTypeChange(val: string) {
    setForm((prev) => {
      if (prev.tripCategory === "RETURN TRIP") {
        return { ...prev, driverCompensationType: val as Trip["driverCompensationType"] };
      }
      const assignment = assignableDrivers.find((a) => a.driver.driverId === vehicleAssignmentId);
      const branch = branches.find((b) => b.name === (assignment?.truck.branchRegisteredTo ?? ""));
      const pct = branch ? parseFloat(branch.driverHaltDayPercentage || "0") : null;
      const rule = BATTA_RULES[prev.tripCategory]?.[prev.containerSpecification];
      let driverAdvanceAmount: string;
      if (val === "Normal") {
        driverAdvanceAmount = calcCompensation(prev.transportHireAmount, pct);
      } else if (rule) {
        driverAdvanceAmount = rule.amount;
      } else {
        driverAdvanceAmount = prev.driverAdvanceAmount;
      }
      return { ...prev, driverCompensationType: val as Trip["driverCompensationType"], driverAdvanceAmount };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const assigned = assignableDrivers.find((a) => a.driver.driverId === vehicleAssignmentId);
    if (!assigned) {
      alert("Please select a vehicle before assigning the trip.");
      return;
    }
    if (vehicleAssignmentId && form.driverId !== vehicleAssignmentId && !form.driverChangeRemark.trim()) {
      alert("Please provide a reason for changing the driver.");
      return;
    }

    saveToAutocompleteHistory("erp_origin_history", form.origin);
    saveToAutocompleteHistory("erp_destination_history", form.destination);

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

  const selectedCustomer = customers.find((c) => c.id === form.customerId);

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
              <DatePickerInput
                required
                value={form.bookingCreatedDate}
                onChange={(v) => handleBookingDateChange(v)}
              />
            </Field>

            <Field label="Trip Category" required>
              <GlassSelect
                value={form.tripCategory}
                onChange={(val) => {
                  if (val === "SHIFTING") {
                    setForm((prev) => ({
                      ...prev,
                      tripCategory: val as Trip["tripCategory"],
                      billTo: "",
                      paymentType: "",
                      customerCashAdvance: "",
                      customerFuelAdvanceAmount: "",
                      customerFuelAdvanceLitres: "",
                    }));
                  } else if (val === "RETURN TRIP") {
                    setForm((prev) => ({
                      ...prev,
                      tripCategory: val as Trip["tripCategory"],
                      driverAdvance: "",
                    }));
                  } else {
                    update("tripCategory", val as Trip["tripCategory"]);
                  }
                }}
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
              <GlassCombobox
                value={form.customerId}
                onChange={(val) => {
                  const byId = customers.find((c) => c.id === val);
                  if (byId) { handleCustomerChange(byId.id); return; }
                  const byName = customers.find((c) => c.name.toLowerCase() === val.toLowerCase());
                  if (byName) handleCustomerChange(byName.id);
                }}
                options={customers.map(c => ({ value: c.id, label: c.name }))}
                placeholder="Select a customer"
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

          {/* {selectedCustomer && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 className="mb-3 text-sm font-semibold text-blue-900">Customer Details</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {selectedCustomer.contactPersonnelName && (
                  <div>
                    <p className="text-xs font-medium text-blue-700">Contact Person</p>
                    <p className="mt-1 text-sm text-blue-900">{selectedCustomer.contactPersonnelName}</p>
                  </div>
                )}
                {selectedCustomer.phone && (
                  <div>
                    <p className="text-xs font-medium text-blue-700">Phone</p>
                    <p className="mt-1 text-sm text-blue-900">{selectedCustomer.phone}</p>
                  </div>
                )}
                {selectedCustomer.email && (
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium text-blue-700">Email</p>
                    <p className="mt-1 text-sm text-blue-900">{selectedCustomer.email}</p>
                  </div>
                )}
              </div>
            </div>
          )} */}
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
              <AutocompleteInput
                required
                value={form.origin}
                onChange={(v) => update("origin", v)}
                storageKey="erp_origin_history"
                suggestions={allOriginOptions}
                placeholder="e.g. Coimbatore"
              />
              {customerOriginNames.some((o) => o.toLowerCase() === form.origin.toLowerCase()) && (
                <span className="mt-1 flex items-center gap-1 text-xs text-green-700">
                  <Sparkles className="h-3 w-3" />
                  Auto-filled from this customer&apos;s previously used origin
                </span>
              )}
            </Field>

            <Field label="Destination Location" required>
              <GlassCombobox
                required
                value={form.destination}
                onChange={handleDestinationChange}
                placeholder={allDestinationOptions.length > 0 ? "Select or type destination" : "e.g. Bengaluru"}
                options={allDestinationOptions}
              />
              {customerPricing.find((p) => {
                const dest = typeof p.customerDestination === "object" && p.customerDestination !== null
                  ? ((p.customerDestination as any).destinationName ?? (p.customerDestination as any).destinationAddress ?? "")
                  : String(p.customerDestination || "");
                return dest === form.destination;
              }) && (
                <span className="mt-1 flex items-center gap-1 text-xs text-green-700">
                  <Sparkles className="h-3 w-3" />
                  Cargo classification, container spec, weight &amp; hire amount auto-filled from customer pricing
                </span>
              )}
            </Field>
          </div>
        </section>

        {/* Shipping Information */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>Shipping Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Shipping Line">
              <input
                type="text"
                value={form.shippingLine}
                onChange={(e) => update("shippingLine", e.target.value)}
                className={inputClass}
                placeholder="e.g. Cochin Shipyard Lines"
              />
            </Field>

            <Field label="Vessel Name">
              <input
                type="text"
                value={form.vesselName}
                onChange={(e) => update("vesselName", e.target.value)}
                className={inputClass}
                placeholder="e.g. MV Malabar Star"
              />
            </Field>

            <Field label="Release Order Reference">
              <input
                type="text"
                value={form.releaseOrderReference}
                onChange={(e) => update("releaseOrderReference", e.target.value)}
                className={inputClass}
                placeholder="e.g. RO-99231"
              />
            </Field>
          </div>
        </section>

        {/* Vehicle & Trip Assignment */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>Vehicle &amp; Trip Assignment</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Scheduled Trip Date" required>
              <DatePickerInput
                required
                value={form.scheduledDate}
                onChange={(v) => update("scheduledDate", v)}
              />
            </Field>

            <Field label="Assigned Vehicle" className="sm:col-span-2">
              <GlassCombobox
                value={vehicleAssignmentId}
                onChange={(val) => {
                  if (assignableDrivers.some((a) => a.driver.driverId === val)) handleVehicleChange(val);
                }}
                options={assignableDrivers.map(a => ({
                  value: a.driver.driverId,
                  label: `${a.truck.registrationNumber} — ${a.driver.name} (${a.truck.truckId})`,
                  disabled: a.isActive,
                }))}
                placeholder={assignableDrivers.length === 0 ? "No vehicles available" : "Select a vehicle"}
              />
              {selectedAssignment && (
                <span className="text-xs text-gray-500">
                  {selectedTruckBranch && <>Branch: <strong>{selectedTruckBranch}</strong></>}
                  {compensationPct !== null && (
                    <> · Compensation: <strong>{compensationPct}%</strong></>
                  )}
                </span>
              )}
            </Field>

            {vehicleAssignmentId && (
              <Field label="Vehicle Registration Number">
                <input
                  type="text"
                  readOnly
                  disabled
                  value={selectedAssignment?.truck.registrationNumber ?? ""}
                  className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
                />
              </Field>
            )}

            {vehicleAssignmentId && (
              <Field label="Driver" required>
                <GlassCombobox
                  value={form.driverId}
                  onChange={(val) => {
                    update("driverId", val);
                    if (val === vehicleAssignmentId) update("driverChangeRemark", "");
                  }}
                  options={drivers.map(d => ({ value: d.driverId, label: d.name }))}
                  placeholder="Select driver"
                />
              </Field>
            )}

            {vehicleAssignmentId && form.driverId && form.driverId !== vehicleAssignmentId && (
              <Field label="Reason for Driver Change" required className="sm:col-span-2">
                <textarea
                  required
                  rows={3}
                  value={form.driverChangeRemark}
                  onChange={(e) => update("driverChangeRemark", e.target.value)}
                  placeholder="State the reason why the driver was changed from the default assigned driver..."
                  className={`${inputClass} resize-none`}
                />
              </Field>
            )}
          </div>
        </section>

        {/* Payment & Advances */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>Payment &amp; Advances</p>
          {isShifting && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Billing not applicable for Shifting trips</span> — shifting trips are internal vehicle relocations between company locations and are not billed to any customer or consignee. All billing fields are locked.
              </p>
            </div>
          )}
          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${isShifting ? "pointer-events-none opacity-50" : ""}`}>
            <Field label="Bill To" required={!isShifting}>
              <GlassSelect
                value={form.billTo}
                onChange={(val) => update("billTo", val as Trip["billTo"])}
                disabled={isShifting}
                options={[
                  { value: "", label: "Select bill to" },
                  ...BILL_TO_OPTIONS.map(o => ({ value: o, label: o }))
                ]}
              />
            </Field>

            <Field label="Payment Type" required={!isShifting}>
              <GlassSelect
                value={form.paymentType}
                onChange={(val) => update("paymentType", val as Trip["paymentType"])}
                disabled={isShifting}
                options={[
                  { value: "", label: "Select payment type" },
                  ...PAYMENT_TYPE_OPTIONS.map(o => ({ value: o, label: o }))
                ]}
              />
            </Field>

            <Field label="Customer Cash Advance (₹)" required={!isShifting}>
              <DecimalInput type="number"
                min="0"
                value={form.customerCashAdvance}
                onChange={(e) => update("customerCashAdvance", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                readOnly={isShifting}
                className={`${inputClass} ${isShifting ? "cursor-not-allowed bg-gray-50 text-gray-400" : ""}`}
                placeholder="e.g. 5000"
              />
            </Field>

            <Field label="Customer Fuel Advance (₹)" required={!isShifting}>
              <DecimalInput type="number"
                min="0"
                value={form.customerFuelAdvanceAmount}
                onChange={(e) => update("customerFuelAdvanceAmount", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                readOnly={isShifting}
                className={`${inputClass} ${isShifting ? "cursor-not-allowed bg-gray-50 text-gray-400" : ""}`}
                placeholder="e.g. 8000"
              />
            </Field>

            <Field label="Customer Fuel Advance (Litres)" required={!isShifting}>
              <DecimalInput type="number"
                min="0"
                value={form.customerFuelAdvanceLitres}
                onChange={(e) => update("customerFuelAdvanceLitres", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                readOnly={isShifting}
                className={`${inputClass} ${isShifting ? "cursor-not-allowed bg-gray-50 text-gray-400" : ""}`}
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
              <GlassSelect
                value={form.driverCompensationType}
                onChange={handleCompensationTypeChange}
                options={[
                  { value: "", label: "Select compensation type" },
                  ...DRIVER_COMPENSATION_TYPE_OPTIONS.map(opt => ({ value: opt, label: opt })),
                ]}
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

            {!isReturnTrip && (
            <Field label="Driver Advance (₹)">
              <DecimalInput type="number"
                min="0"
                value={form.driverAdvance}
                onChange={(e) => update("driverAdvance", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass}
                placeholder="e.g. 1000"
              />
            </Field>
            )}

            <Field label="Driver Batta Amount (₹)" required>
              <DecimalInput type="number"
                min="0"
                value={form.driverAdvanceAmount}
                onChange={(e) => update("driverAdvanceAmount", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                readOnly={isNormalComp || isReturnTrip}
                className={`${inputClass} ${isNormalComp ? "cursor-not-allowed bg-green-50 text-green-800" : ""} ${isReturnTrip ? "cursor-not-allowed bg-gray-50 text-gray-400" : ""}`}
                placeholder={isReturnTrip ? "Calculated Further in the Operation" : isNormalComp ? "Auto-calculated" : "Enter fixed batta amount"}
              />
              {!isReturnTrip && battaRule && !isNormalComp && (
                <span className="mt-1 flex items-center gap-1 text-xs text-blue-500">
                  <Sparkles className="h-3 w-3" />
                  Auto-set to ₹{Number(battaRule.amount).toLocaleString("en-IN")} — {form.tripCategory} with {form.containerSpecification} ({battaRule.type} rate). Edit to override.
                </span>
              )}
              {!isReturnTrip && isNormalComp && form.driverAdvanceAmount && (
                <span className="mt-1 flex items-center gap-1 text-xs text-green-700">
                  <Sparkles className="h-3 w-3" />
                  Auto-calculated: ₹{Number(form.driverAdvanceAmount).toLocaleString("en-IN")}
                  {compensationPct !== null && selectedTruckBranch
                    ? ` (${compensationPct}% of hire amount — ${selectedTruckBranch} branch)`
                    : " — assign a vehicle with a configured branch to auto-calculate"}
                </span>
              )}
              {!isReturnTrip && isNormalComp && !form.driverAdvanceAmount && (
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
            <Field label="Hire Amount (₹)" required>
              <DecimalInput type="number"
                min="0"
                value={form.transportHireAmount}
                onChange={(e) => handleHireAmountChange(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass}
                placeholder="e.g. 32000"
              />
            </Field>
          </div>
        </section>

        {/* Operational Notes */}
        <section className="flex flex-col gap-4">
          <p className={sectionHeadingClass}>Operational Notes</p>
          <div className="grid grid-cols-1 gap-4">
            <Field label="Internal Remarks">
              <textarea
                value={form.internalRemarks}
                onChange={(e) => update("internalRemarks", e.target.value)}
                className={`${inputClass} min-h-20 resize-y`}
                placeholder="Notes visible to internal staff only"
              />
            </Field>

            <Field label="Booking Instructions">
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
            onClick={() => { clearTripDraft(); onClose(); }}
            className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={assignableDrivers.length === 0 || !form.driverId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Assign Trip
          </button>
        </div>
      </form>
    </Dialog>
  );
}
