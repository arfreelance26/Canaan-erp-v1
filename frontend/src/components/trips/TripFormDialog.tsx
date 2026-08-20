"use client";

import { X, Info, Sparkles, MapPin } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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
import type { FinalCustomerPricing } from "@/types/final-customer-pricing";
import type { Branch } from "@/types/branch";
import { branchesApi, customersApi, tripsApi } from "@/lib/api";
import { confirmAction, showError } from "@/lib/swal";
import { todayIst } from "@/lib/format-date";
import { saveToAutocompleteHistory, getAutocompleteHistory }from "@/components/ui/AutocompleteInput";
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

// Enforce AAAA1234567 format: 4 uppercase letters then up to 7 digits, ignore all else
function enforceContainerFormat(value: string): string {
  const upper = value.toUpperCase();
  let letters = "";
  let digits = "";
  for (const ch of upper) {
    if (letters.length < 4 && /[A-Z]/.test(ch)) letters += ch;
    else if (letters.length === 4 && digits.length < 7 && /[0-9]/.test(ch)) digits += ch;
  }
  return letters + digits;
}

// Block invalid keystrokes in real-time: pos 0–3 = letters only, pos 4–10 = digits only
function handleContainerKeyDown(e: KeyboardEvent<HTMLInputElement>) {
  const { key, ctrlKey, metaKey, currentTarget } = e;
  if (key.length > 1 || ctrlKey || metaKey) return; // allow Backspace, arrows, Ctrl+C, etc.
  const pos = currentTarget.selectionStart ?? currentTarget.value.length;
  if (pos < 4 && !/[a-zA-Z]/.test(key)) { e.preventDefault(); return; }
  if (pos >= 4 && pos < 11 && !/[0-9]/.test(key)) { e.preventDefault(); return; }
  if (pos >= 11) e.preventDefault();
}

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
  openLoadHireType: "",
  ratePerTon: "",
  transportHireAmount: "",
  transportCrossingAmount: "",
  approxKm: "",
  approxTripDistance: "",
  liftOnAmount: "",
  liftOnRemarks: "",
  chaName: "CGSS",
  internalRemarks: "",
  driverChangeRemark: "",
  bookingInstructions: "",
  hasClosure: false,
  hasSheet: false,
  tripSheetCollected: false,
  tripSheetCollectedAt: null,
  tripSheetReceived: false,
  tripSheetReceivedAt: null,
  tripSheetDate: null,
  verificationStatus: "pending",
  verificationRejectionReason: null,
  isInvoiced: false,
  invoiceRequired: true,
  invoiceWaived: false,
  driverName: null,
  truckRegistration: null,
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
  const [finalCustomerPricing, setFinalCustomerPricing] = useState<FinalCustomerPricing | null>(null);
  const [dbOrigins, setDbOrigins] = useState<string[]>([]);
  const [dbDestinations, setDbDestinations] = useState<string[]>([]);
  const [shippingLines, setShippingLines] = useState<string[]>([]);
  const [cargoReferences, setCargoReferences] = useState<string[]>([]);
  const wasOpenRef = useRef(false);
  const vehicleRestoredRef = useRef(false);

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => setBranches([]));
    tripsApi.getAutocompleteValues().then((v) => { setDbOrigins(v.origins); setDbDestinations(v.destinations); }).catch(() => {});
    tripsApi.listShippingLines().then(setShippingLines).catch(() => {});
    tripsApi.listCargoReferences().then(setCargoReferences).catch(() => {});
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
          customersApi.listFinalPricing(initialData.customerId).then((fps) => setFinalCustomerPricing(fps[0] ?? null)).catch(() => {});
        }
      } else {
        const todayStr = todayIst();
        const [y, m, d] = todayStr.split("-").map(Number);
        // Booking Created Date defaults to yesterday
        const yest = new Date(y, m - 1, d - 1);
        const yesterdayStr = [
          yest.getFullYear(),
          String(yest.getMonth() + 1).padStart(2, "0"),
          String(yest.getDate()).padStart(2, "0"),
        ].join("-");
        setVehicleAssignmentId("");
        setCustomerDestinations([]);
        setCustomerPricing([]);
        setFinalCustomerPricing(null);
        setCustomerOrigins([]);
        setForm({
          ...emptyForm,
          bookingCreatedDate: yesterdayStr,
          scheduledDate: todayStr,
          bookingReferenceNo: generateBookingReferenceNo(existingTrips, yesterdayStr),
        });
      }
    }
  }, [open, initialData]);

  // Preserve unsaved "Add Trip" input across close/reopen — only for a genuinely new trip,
  // never when editing (editing always loads real data from initialData above).
  useFormDraft(TRIP_DRAFT_KEY, open && !initialData, form, (draft) => {
    // Always re-derive date defaults so a stale draft doesn't restore old values
    const todayStr = todayIst();
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const yest = new Date(ty, tm - 1, td - 1);
    const yesterdayStr = [
      yest.getFullYear(),
      String(yest.getMonth() + 1).padStart(2, "0"),
      String(yest.getDate()).padStart(2, "0"),
    ].join("-");
    setForm({
      ...emptyForm,
      ...draft,
      chaName: draft.chaName || "CGSS",
      bookingCreatedDate: yesterdayStr,
      scheduledDate: todayStr,
      bookingReferenceNo: generateBookingReferenceNo(existingTrips, yesterdayStr),
    });
    // Re-fetch customer-specific data when draft restores a customerId.
    // The [open, initialData] effect already cleared customerDestinations, so we
    // must reload them here or "Available Routes" will show empty on reopen.
    if (draft.customerId) {
      customersApi.listDestinations(draft.customerId).then(setCustomerDestinations).catch(() => {});
      customersApi.listPricing(draft.customerId).then(setCustomerPricing).catch(() => {});
      customersApi.listOrigins(draft.customerId).then(setCustomerOrigins).catch(() => {});
      customersApi.listFinalPricing(draft.customerId).then((fps) => setFinalCustomerPricing(fps[0] ?? null)).catch(() => {});
    }
  });

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

  // Auto-zero lift-on for Coastal trips
  useEffect(() => {
    if (form.cargoClassification === "COASTAL") {
      setForm((prev) => ({ ...prev, liftOnAmount: "0" }));
    }
  }, [form.cargoClassification]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAssignment = assignableDrivers.find((a) => a.driver.driverId === vehicleAssignmentId);
  const selectedTruckBranch = selectedAssignment?.truck.branchRegisteredTo ?? "";
  const selectedBranch = branches.find((b) => b.name === selectedTruckBranch);
  const compensationPct = selectedBranch ? parseFloat(selectedBranch.driverHaltDayPercentage || "0") : null;
  const isNormalComp = form.driverCompensationType === "Normal";
  const isShifting = form.tripCategory === "SHIFTING";
  const isReturnTrip = form.tripCategory === "RETURN TRIP";
  const isExport = form.cargoClassification === "EXPORT";
  const isOpenLoad = form.cargoClassification === "OPEN LOAD" || form.containerSpecification === "OPEN LOAD CARGO";
  const isCoastal = form.cargoClassification === "COASTAL";
  const isTonBased = isOpenLoad && (form.openLoadHireType === "Ton Based" || form.openLoadHireType === "");
  const isFixedHire = isOpenLoad && form.openLoadHireType === "Fixed";
  const battaRule = BATTA_RULES[form.tripCategory]?.[form.containerSpecification];
  // "Self" customer: CGI is the shipper — billing, advances, and CHA are locked
  const isSelf = (() => {
    const c = customers.find((c) => c.id === form.customerId);
    const name = (c?.name ?? form.shipperConsignee ?? "").trim().toLowerCase();
    return name === "self" || name === "cgi";
  })();
  // Lift-on: manual entry for Shifting/Empty/Open, locked at 0 for Coastal, editable for others
  const isLiftOnLocked = isCoastal;
  const isLiftOnManual = isShifting || form.cargoClassification === "EMPTY" || isOpenLoad;

  const destinationOptions = customerDestinations
    .map((d) => {
      const label = d.destinationName ?? d.destinationAddress ?? "";
      return { value: label, label };
    })
    .filter((o) => o.value !== "");

  const customerOriginNames = customerOrigins.map((o) => o.originName).filter(Boolean);

  // Origin states saved on the customer's destination records — shown first in the origin dropdown
  const customerDestinationOriginStates = [
    ...new Set(
      customerDestinations
        .map((d) => d.originState)
        .filter((s): s is string => !!s && s.trim() !== "")
    ),
  ];

  type RouteOption = {
    originState: string;
    originAddress: string;
    destinationState: string;
    destLabel: string;
    hireAmount: string;
    approxDistanceKm: string;
    cargoClassification: string;
    containerType: string;
    cargoWeight: string;
  };

  // Build one route entry per destination that has both originState and destinationState.
  // All pricing fields come from the first matching pricing row for that destination.
  const availableRoutes: RouteOption[] = customerDestinations
    .filter((d) => d.originState && d.destinationState)
    .map((d) => {
      const destLabel = d.destinationName ?? d.destinationAddress ?? "";
      const matchedPricing = customerPricing.find((p) => {
        const pDest =
          typeof p.customerDestination === "object" && p.customerDestination !== null
            ? ((p.customerDestination as any).destinationName ?? (p.customerDestination as any).destinationAddress ?? "")
            : String(p.customerDestination || "");
        return pDest === destLabel;
      });
      return {
        originState: d.originState!,
        originAddress: d.originAddress ?? "",
        destinationState: d.destinationState,
        destLabel,
        hireAmount: matchedPricing?.rate ?? "",
        approxDistanceKm: d.approxDistanceKm ?? "",
        cargoClassification: matchedPricing?.cargoClassification ?? "",
        containerType: matchedPricing?.containerType ?? "",
        cargoWeight: matchedPricing?.weightInTons ?? "",
      };
    });

  // Predefined standard port/logistics locations (always available in dropdowns)
  const PREDEFINED_LOCATIONS = [
    "Chennai Port",
    "Chennai Port Trust",
    "Kattupalli Port",
    "Ennore Port",
    "Kamarajar Port",
    "Chennai CFS",
    "CONCOR CFS Chennai",
    "Gateway Distriparks Chennai",
    "Customs Bonded Warehouse Chennai",
    "Manali",
    "Ambattur",
    "Irungattukottai",
    "Sriperumbudur",
    "Oragadam",
    "Mahindra World City",
    "Ponneri",
    "Thiruvallur",
    "Gummidipoondi",
    "Tada (AP)",
    "Pondicherry",
    "Bangalore",
    "Krishnapatnam Port",
    "Tuticorin Port",
    "Coimbatore",
    "Madurai",
  ];

  // Origin priority: destination origin states > customer origin names > history + predefined
  const allOriginOptions = (() => {
    // Destination origin states from the selected customer take priority
    if (customerDestinationOriginStates.length > 0) {
      const destStatesLower = customerDestinationOriginStates.map((s) => s.toLowerCase());
      const extras = customerOriginNames
        .filter((o) => !destStatesLower.includes(o.toLowerCase()))
        .map((o) => ({ value: o, label: o }));
      return [
        ...customerDestinationOriginStates.map((s) => ({ value: s, label: s })),
        ...extras,
      ];
    }
    if (customerOriginNames.length > 0) {
      return customerOriginNames.map((o) => ({ value: o, label: o }));
    }
    const historyPool = [
      ...getAutocompleteHistory("erp_origin_history"),
      ...dbOrigins,
    ].filter((h, i, arr) => arr.indexOf(h) === i);
    const historyLower = historyPool.map((h) => h.toLowerCase());
    return [
      ...historyPool.map((h) => ({ value: h, label: h })),
      ...PREDEFINED_LOCATIONS
        .filter((l) => !historyLower.includes(l.toLowerCase()))
        .map((l) => ({ value: l, label: l })),
    ];
  })();

  // When a customer is selected and has saved destinations, show ONLY those destinations.
  // Otherwise fall back to typed history + predefined port locations.
  const allDestinationOptions = (() => {
    if (destinationOptions.length > 0) {
      return destinationOptions;
    }
    const historyPool = [
      ...getAutocompleteHistory("erp_destination_history"),
      ...dbDestinations,
    ].filter((h, i, arr) => arr.indexOf(h) === i);
    const historyLower = historyPool.map((h) => h.toLowerCase());
    return [
      ...historyPool.map((h) => ({ value: h, label: h })),
      ...PREDEFINED_LOCATIONS
        .filter((l) => !historyLower.includes(l.toLowerCase()))
        .map((l) => ({ value: l, label: l })),
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
    let nextScheduledDate = "";
    if (value) {
      const [y, m, d] = value.split("-").map(Number);
      const next = new Date(y, m - 1, d + 1);
      nextScheduledDate = [
        next.getFullYear(),
        String(next.getMonth() + 1).padStart(2, "0"),
        String(next.getDate()).padStart(2, "0"),
      ].join("-");
    }
    setForm((prev) => ({
      ...prev,
      bookingCreatedDate: value,
      ...(nextScheduledDate ? { scheduledDate: nextScheduledDate } : {}),
      ...(initialData ? {} : { bookingReferenceNo: generateBookingReferenceNo(existingTrips, value) }),
    }));
  }

  function handleCustomerChange(customerId: string) {
    const selectedCustomer = customers.find((c) => c.id === customerId);
    const returnTrip = form.tripCategory === "RETURN TRIP";
    const shiftingTrip = form.tripCategory === "SHIFTING";
    const name = (selectedCustomer?.name ?? "").trim().toLowerCase();
    const selfCustomer = name === "self" || name === "cgi";
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
      // Self/CGI customer — lock billing and CHA
      ...(selfCustomer ? {
        paymentType: "Credit",
        customerCashAdvance: "",
        customerFuelAdvanceAmount: "",
        customerFuelAdvanceLitres: "",
        chaName: "CGI",
      } : {}),
    }));
    setCustomerDestinations([]);
    setCustomerPricing([]);
    setFinalCustomerPricing(null);
    setCustomerOrigins([]);
    if (customerId) {
      customersApi.listFinalPricing(customerId).then((fps) => setFinalCustomerPricing(fps[0] ?? null)).catch(() => {});
      customersApi.listDestinations(customerId).then((dests) => {
        setCustomerDestinations(dests);
        if (dests.length > 0 && !returnTrip && !shiftingTrip) {
          setForm((prev) => ({ ...prev, approxTripDistance: dests[0].approxDistanceKm ?? "", approxKm: dests[0].approxDistanceKm ?? prev.approxKm }));
        }
      }).catch(() => {});
      customersApi.listPricing(customerId).then((pricing) => {
        setCustomerPricing(pricing);
        // Don't auto-apply pricing[0] — there may be multiple rows for the same customer
        // with different container specs. Wait for user to pick destination + container spec.
      }).catch(() => {});
      customersApi.listOrigins(customerId).then((origins) => {
        setCustomerOrigins(origins);
        if (origins.length > 0 && !returnTrip && !shiftingTrip) {
          setForm((prev) => ({ ...prev, origin: origins[0].originName }));
        }
      }).catch(() => {});
    }
  }

  function handleOriginChange(origin: string) {
    setForm((prev) => ({ ...prev, origin }));
  }

  function handleRouteSelect(route: RouteOption) {
    if (isShifting) return;
    const assignment = assignableDrivers.find((a) => a.driver.driverId === vehicleAssignmentId);
    const branch = branches.find((b) => b.name === (assignment?.truck.branchRegisteredTo ?? ""));
    const pct = branch ? parseFloat(branch.driverHaltDayPercentage || "0") : null;
    const hireBase = finalCustomerPricing?.accountsHireAmount ?? route.hireAmount;
    // For EXPORT routes, origin must be TUTICORIN — the origin GlassSelect only
    // accepts TUTICORIN/CHENNAI, so we can't set an arbitrary originState here.
    // For all other types, prefer the stored address then fall back to state name.
    const cargo = route.cargoClassification as Trip["cargoClassification"] | undefined;
    const origin = cargo === "EXPORT" ? "TUTICORIN" : (route.originAddress || route.originState);
    const destination = route.destLabel || route.destinationState;
    const containerSpec = route.containerType ? containerTypeToSpec(route.containerType) : "";
    setForm((prev) => ({
      ...prev,
      origin,
      destination,
      ...(route.hireAmount ? { transportHireAmount: route.hireAmount } : {}),
      ...(route.cargoClassification
        ? { cargoClassification: route.cargoClassification as Trip["cargoClassification"] }
        : {}),
      ...(containerSpec
        ? { containerSpecification: containerSpec as Trip["containerSpecification"] }
        : {}),
      ...(route.cargoWeight ? { cargoWeight: route.cargoWeight } : {}),
      ...(prev.driverCompensationType === "Normal"
        ? { driverAdvanceAmount: calcCompensation(hireBase, pct) }
        : {}),
      approxTripDistance: route.approxDistanceKm,
      approxKm: route.approxDistanceKm || prev.approxKm,
    }));
  }

  function findPricingForDestAndSpec(
    destination: string,
    containerSpec: string,
    cargoClassification?: string,
    weightInTons?: string,
  ): CustomerPricing | undefined {
    return customerPricing.find((p) => {
      const dest = typeof p.customerDestination === "object" && p.customerDestination !== null
        ? ((p.customerDestination as any).destinationName ?? (p.customerDestination as any).destinationAddress ?? "")
        : String(p.customerDestination || "");
      if (dest !== destination) return false;
      if (containerSpec && containerTypeToSpec(p.containerType) !== containerSpec) return false;
      // Match on cargo classification only when both sides are non-empty
      if (cargoClassification && p.cargoClassification && p.cargoClassification !== cargoClassification) return false;
      // Match on weight only when both sides are non-empty
      if (weightInTons && p.weightInTons && p.weightInTons !== weightInTons) return false;
      return true;
    });
  }

  function handleDestinationChange(destination: string) {
    if (form.tripCategory === "RETURN TRIP" || form.tripCategory === "SHIFTING") {
      setForm((prev) => ({ ...prev, destination }));
      return;
    }
    const matchingPricing = findPricingForDestAndSpec(destination, form.containerSpecification, form.cargoClassification, form.cargoWeight);
    const matchingDest = customerDestinations.find((d) =>
      (d.destinationName ?? d.destinationAddress ?? "") === destination
    );
    setForm((prev) => ({
      ...prev,
      destination,
      // Only apply hire amount + cargo weight from matched pricing — don't override container spec
      ...(matchingPricing ? {
        transportHireAmount: matchingPricing.rate || "",
        cargoWeight: matchingPricing.weightInTons || prev.cargoWeight,
      } : {}),
      approxTripDistance: matchingDest?.approxDistanceKm ?? "",
      approxKm: matchingDest?.approxDistanceKm ?? prev.approxKm,
    }));
  }

  async function handleVehicleChange(assignmentDriverId: string) {
    const assignment = assignableDrivers.find((a) => a.driver.driverId === assignmentDriverId);
    if (assignment) {
      const truckId = assignment.truck.truckId;
      const today = todayIst();
      const sameDayTrips = existingTrips.filter(
        (t) => t.vehicleId === truckId && t.assignedDate === today && (!initialData || t.id !== initialData.id)
      );
      if (sameDayTrips.length > 0) {
        const refs = sameDayTrips.map((t) => t.bookingReferenceNo || t.tripId).join(", ");
        const proceed = await confirmAction(
          `${assignment.truck.registrationNumber} already has ${sameDayTrips.length} trip(s) assigned today`,
          `Trips: ${refs}\n\nThis truck is being assigned sequentially. Do you want to continue?`,
          "Yes, Continue"
        );
        if (!proceed) return;
      }
    }
    setVehicleAssignmentId(assignmentDriverId);
    setForm((prev) => {
      if (prev.tripCategory === "RETURN TRIP") return { ...prev, driverId: assignmentDriverId };
      const branch = branches.find((b) => b.name === (assignment?.truck.branchRegisteredTo ?? ""));
      const pct = branch ? parseFloat(branch.driverHaltDayPercentage || "0") : null;
      const battaBase = finalCustomerPricing?.accountsHireAmount ?? prev.transportHireAmount;
      const driverAdvanceAmount =
        prev.driverCompensationType === "Normal"
          ? calcCompensation(battaBase, pct)
          : prev.driverAdvanceAmount;
      return { ...prev, driverId: assignmentDriverId, driverAdvanceAmount };
    });
  }

  function handleHireAmountChange(value: string) {
    setForm((prev) => {
      if (prev.tripCategory === "RETURN TRIP" || prev.tripCategory === "SHIFTING") return { ...prev, transportHireAmount: value };
      const assignment = assignableDrivers.find((a) => a.driver.driverId === vehicleAssignmentId);
      const branch = branches.find((b) => b.name === (assignment?.truck.branchRegisteredTo ?? ""));
      const pct = branch ? parseFloat(branch.driverHaltDayPercentage || "0") : null;
      // Batta percentage base: accounts hire amount if set, else fall back to the new hire amount
      const battaBase = finalCustomerPricing?.accountsHireAmount ?? value;
      const driverAdvanceAmount =
        prev.driverCompensationType === "Normal"
          ? calcCompensation(battaBase, pct)
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
      const battaBase = finalCustomerPricing?.accountsHireAmount ?? prev.transportHireAmount;
      let driverAdvanceAmount: string;
      if (val === "Normal") {
        driverAdvanceAmount = calcCompensation(battaBase, pct);
      } else if (rule) {
        driverAdvanceAmount = rule.amount;
      } else {
        driverAdvanceAmount = prev.driverAdvanceAmount;
      }
      return { ...prev, driverCompensationType: val as Trip["driverCompensationType"], driverAdvanceAmount };
    });
  }

  function calcOpenLoadHire(weight: string, rate: string): string {
    const w = parseFloat(weight);
    const r = parseFloat(rate);
    return !isNaN(w) && !isNaN(r) && w > 0 && r > 0 ? String(w * r) : "";
  }

  function handleOpenLoadWeightChange(value: string) {
    setForm((prev) => ({
      ...prev,
      cargoWeight: value,
      transportHireAmount: prev.openLoadHireType === "Fixed"
        ? prev.transportHireAmount
        : calcOpenLoadHire(value, prev.ratePerTon ?? ""),
    }));
  }

  function handleRatePerTonChange(value: string) {
    setForm((prev) => ({
      ...prev,
      ratePerTon: value,
      transportHireAmount: calcOpenLoadHire(prev.cargoWeight, value),
    }));
  }

  function handleOpenLoadHireTypeChange(value: string) {
    setForm((prev) => ({
      ...prev,
      openLoadHireType: value as Trip["openLoadHireType"],
      // Reset calculated fields when switching modes
      ratePerTon: value === "Fixed" ? "" : prev.ratePerTon,
      transportHireAmount: value === "Fixed" ? "" : calcOpenLoadHire(prev.cargoWeight, prev.ratePerTon ?? ""),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const assigned = assignableDrivers.find((a) => a.driver.driverId === vehicleAssignmentId);
    if (!assigned) {
      await showError("Please select a vehicle before assigning the trip.", "Vehicle Required");
      return;
    }
    if (vehicleAssignmentId && form.driverId !== vehicleAssignmentId && !form.driverChangeRemark.trim()) {
      await showError("Please provide a reason for changing the driver.", "Reason Required");
      return;
    }

    // Container number validation: must be 4 uppercase letters + 7 digits (e.g. ABCD1234567)
    const CONTAINER_REGEX = /^[A-Z]{4}[0-9]{7}$/;
    const containersToValidate: { label: string; value: string }[] = [];
    if (form.containerSpecification === "2 X 20 FEET CONTAINERS") {
      containersToValidate.push({ label: "Container 1", value: form.containerNumber1 ?? "" });
      containersToValidate.push({ label: "Container 2", value: form.containerNumber2 ?? "" });
    } else if (
      form.containerSpecification === "20 FT CONTAINER" ||
      form.containerSpecification === "40 FT CONTAINER"
    ) {
      containersToValidate.push({ label: "Container Number", value: form.containerNumber ?? "" });
    }
    for (const c of containersToValidate) {
      const normalized = c.value.trim().toUpperCase().replace(/\s/g, "");
      if (normalized && !CONTAINER_REGEX.test(normalized)) {
        await showError(
          `Container numbers must be exactly 4 letters followed by 7 digits.\nExample: ABCD1234567\n\nGot: "${c.value}"`,
          `Invalid ${c.label}`
        );
        return;
      }
    }

    // Duplicate detection: same truck or same container on any active trip
    const ACTIVE = new Set(["Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"]);
    const targetVehicleId = assigned.truck.truckId;
    const editingId = initialData?.id;

    const truckConflicts = existingTrips.filter(
      (t) => t.vehicleId === targetVehicleId && ACTIVE.has(t.status) && t.id !== editingId
    );

    const formContainers = [form.containerNumber, form.containerNumber1, form.containerNumber2]
      .map((c) => (c ?? "").trim().toUpperCase())
      .filter(Boolean);
    const containerConflicts = formContainers.length > 0
      ? existingTrips.filter((t) => {
          if (!ACTIVE.has(t.status) || t.id === editingId) return false;
          const existing = [t.containerNumber, t.containerNumber1, t.containerNumber2]
            .map((c) => (c ?? "").trim().toUpperCase())
            .filter(Boolean);
          return formContainers.some((c) => existing.includes(c));
        })
      : [];

    if (truckConflicts.length > 0 || containerConflicts.length > 0) {
      const lines: string[] = [];
      if (truckConflicts.length > 0) {
        const refs = truckConflicts.map((t) => t.bookingReferenceNo || t.tripId).join(", ");
        lines.push(`Truck ${assigned.truck.registrationNumber} is already on active trip(s): ${refs}`);
      }
      if (containerConflicts.length > 0) {
        const refs = containerConflicts.map((t) => t.bookingReferenceNo || t.tripId).join(", ");
        const dupeContainers = formContainers.filter((c) =>
          containerConflicts.some((t) =>
            [t.containerNumber, t.containerNumber1, t.containerNumber2]
              .map((x) => (x ?? "").trim().toUpperCase())
              .includes(c)
          )
        );
        lines.push(`Container ${dupeContainers.join(", ")} already exists in active trip(s): ${refs}`);
      }
      const result = await confirmAction(
        "Duplicate Warning",
        lines.join("\n\n") + "\n\nDo you want to assign this trip anyway?",
        "Yes, Continue"
      );
      if (!result.isConfirmed) return;
    }

    saveToAutocompleteHistory("erp_origin_history", form.origin);
    saveToAutocompleteHistory("erp_destination_history", form.destination);

    if (initialData) {
      onSave({
        id: initialData.id,
        tripId: initialData.tripId,
        status: initialData.status,
        assignedDate: initialData.assignedDate,
        vehicleId: assigned.truck.truckId,
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
    <Dialog open={open} onClose={onClose} title={initialData ? "Edit Trip" : "Assign Trip"} className="max-w-4xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Booking Information */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>Booking Information</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
                      origin: "",
                      destination: "",
                      transportHireAmount: "",
                    }));
                  } else if (val === "RETURN TRIP") {
                    setForm((prev) => ({
                      ...prev,
                      tripCategory: val as Trip["tripCategory"],
                      driverAdvance: "",
                      driverCompensationType: "FIXED",
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
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>Customer Information</p>
          {isSelf && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <p className="text-sm text-blue-800">
                <span className="font-semibold">Self / CGI customer</span> — billing to customer is not applicable. Payment type is locked to Credit, advances are disabled, and CHA is auto-set to CGI.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Customer Account" required>
              {isReturnTrip ? (
                <GlassCombobox
                  value={form.shipperConsignee}
                  onChange={(val) => {
                    const matched = customers.find((c) => c.name.toLowerCase() === val.toLowerCase());
                    setForm((prev) => ({
                      ...prev,
                      shipperConsignee: val,
                      customerId: matched?.id ?? prev.customerId,
                    }));
                  }}
                  options={customers.map((c) => ({ value: c.name, label: c.name }))}
                  placeholder="Type or select customer"
                />
              ) : (
                <GlassCombobox
                  value={form.customerId}
                  onChange={(val) => {
                    const byId = customers.find((c) => c.id === val);
                    if (byId) { handleCustomerChange(byId.id); return; }
                    const byName = customers.find((c) => c.name.toLowerCase() === val.toLowerCase());
                    if (byName) handleCustomerChange(byName.id);
                  }}
                  options={customers.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Select a customer"
                />
              )}
            </Field>

            <Field label="Shipper / Consignee" required>
              <input
                type="text"
                required
                value={form.shipperConsignee}
                onChange={(e) => update("shipperConsignee", e.target.value)}
                className={inputClass}
                placeholder="Enter shipper / consignee name"
              />
            </Field>

            <Field label="CHA Name">
              <input
                type="text"
                value={form.chaName ?? ""}
                onChange={(e) => update("chaName", e.target.value)}
                readOnly={isSelf}
                className={`${inputClass} ${isSelf ? "cursor-not-allowed bg-gray-50 text-gray-500" : ""}`}
                placeholder={isSelf ? "CGI (auto-filled)" : "Enter CHA name"}
              />
              {isSelf && (
                <span className="mt-1 text-xs text-blue-600">Auto-set to CGI for Self customer</span>
              )}
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
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>Cargo Information</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {form.containerSpecification === "2 X 20 FEET CONTAINERS" ? (
              <>
                <Field label="Container Number for the First Container" required>
                  <input
                    type="text"
                    required
                    value={form.containerNumber1}
                    onKeyDown={handleContainerKeyDown}
                    onChange={(e) => update("containerNumber1", enforceContainerFormat(e.target.value))}
                    maxLength={11}
                    className={inputClass}
                    placeholder="Enter container number"
                  />
                </Field>
                <Field label="Container Number for the Second Container" required>
                  <input
                    type="text"
                    required
                    value={form.containerNumber2}
                    onKeyDown={handleContainerKeyDown}
                    onChange={(e) => update("containerNumber2", enforceContainerFormat(e.target.value))}
                    maxLength={11}
                    className={inputClass}
                    placeholder="Enter container number"
                  />
                </Field>
              </>
            ) : form.containerSpecification === "20 FT CONTAINER" || form.containerSpecification === "40 FT CONTAINER" ? (
              <Field label="Container Number" required>
                <input
                  type="text"
                  required
                  value={form.containerNumber}
                  onKeyDown={handleContainerKeyDown}
                  onChange={(e) => update("containerNumber", enforceContainerFormat(e.target.value))}
                  maxLength={11}
                  className={inputClass}
                  placeholder="e.g. TWCU2081370"
                />
              </Field>
            ) : form.containerSpecification === "OPEN LOAD CARGO" ? (
              <Field label="Cargo Reference" required>
                <GlassCombobox
                  required
                  value={form.cargoReference}
                  onChange={(val) => update("cargoReference", val)}
                  options={cargoReferences.map((r) => ({ value: r, label: r }))}
                  placeholder="Enter or select cargo reference"
                />
              </Field>
            ) : null}

            <Field label="Cargo Classification" required>
              <GlassSelect
                value={form.cargoClassification}
                onChange={(val) => {
                  const spec = val === "OPEN LOAD" ? "OPEN LOAD CARGO" : form.containerSpecification === "OPEN LOAD CARGO" ? "" : form.containerSpecification;
                  const wasExport = form.cargoClassification === "EXPORT";
                  setForm((prev) => ({
                    ...prev,
                    cargoClassification: val as Trip["cargoClassification"],
                    containerSpecification: spec as Trip["containerSpecification"],
                    // Auto-set origin to TUTICORIN when EXPORT is chosen; clear if switching away from EXPORT
                    ...(val === "EXPORT" ? { origin: "TUTICORIN" } : wasExport ? { origin: "" } : {}),
                  }));
                }}
                options={[
                  { value: "", label: "Select cargo classification" },
                  ...CARGO_CLASSIFICATION_OPTIONS.map(o => ({ value: o, label: o }))
                ]}
              />
            </Field>

            <Field label="Container Specification" required>
              <GlassSelect
                value={form.containerSpecification}
                onChange={(val) => {
                  const cls = val === "OPEN LOAD CARGO" ? "OPEN LOAD" : form.cargoClassification === "OPEN LOAD" ? "" : form.cargoClassification;
                  // Re-fetch hire amount for the new spec against the already-chosen destination
                  const matchedPricing = form.destination
                    ? customerPricing.find((p) => {
                        const dest = typeof p.customerDestination === "object" && p.customerDestination !== null
                          ? ((p.customerDestination as any).destinationName ?? (p.customerDestination as any).destinationAddress ?? "")
                          : String(p.customerDestination || "");
                        if (dest !== form.destination) return false;
                        if (containerTypeToSpec(p.containerType) !== val) return false;
                        if (cls && p.cargoClassification && p.cargoClassification !== cls) return false;
                        if (form.cargoWeight && p.weightInTons && p.weightInTons !== form.cargoWeight) return false;
                        return true;
                      })
                    : undefined;
                  setForm((prev) => ({
                    ...prev,
                    containerSpecification: val as Trip["containerSpecification"],
                    cargoClassification: cls as Trip["cargoClassification"],
                    ...(matchedPricing ? {
                      transportHireAmount: matchedPricing.rate || "",
                      cargoWeight: matchedPricing.weightInTons || prev.cargoWeight,
                    } : {}),
                  }));
                }}
                options={[
                  { value: "", label: "Select container specification" },
                  ...CONTAINER_SPECIFICATION_OPTIONS.map(o => ({ value: o, label: o }))
                ]}
              />
            </Field>

            {isOpenLoad && (
              <Field label="Open Load Hire Type" required>
                <GlassSelect
                  value={form.openLoadHireType ?? ""}
                  onChange={handleOpenLoadHireTypeChange}
                  options={[
                    { value: "", label: "Select hire type" },
                    { value: "Ton Based", label: "Ton Based — Cargo Weight × Rate per Ton" },
                    { value: "Fixed", label: "Fixed — Enter Hire Amount Directly" },
                  ]}
                />
              </Field>
            )}

            <Field label="Cargo Weight (tons)" required={isOpenLoad && isTonBased}>
              {isOpenLoad ? (
                <DecimalInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cargoWeight}
                  onChange={(e) => handleOpenLoadWeightChange(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={inputClass}
                  placeholder="Enter weight in tons"
                />
              ) : (
                <GlassSelect
                  value={form.cargoWeight}
                  onChange={(val) => update("cargoWeight", val)}
                  options={[
                    { value: "", label: "Select cargo weight" },
                    ...CARGO_WEIGHT_OPTIONS.map(o => ({ value: o, label: o }))
                  ]}
                />
              )}
            </Field>

            {isTonBased && (
              <Field label="Rate Per Ton (₹)" required>
                <DecimalInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.ratePerTon}
                  onChange={(e) => handleRatePerTonChange(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={inputClass}
                  placeholder="Enter rate per ton"
                />
                {form.cargoWeight && form.ratePerTon && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-green-700">
                    <Sparkles className="h-3 w-3" />
                    Hire Amount auto-calculated: ₹{(parseFloat(form.cargoWeight) * parseFloat(form.ratePerTon)).toLocaleString("en-IN")}
                  </span>
                )}
              </Field>
            )}
          </div>
        </section>

        {/* Route Information */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>Route Information</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">

            {/* Available Routes — always visible except for Shifting trips */}
            {!isShifting && (
              <div className="sm:col-span-2">
                <Field label="Available Routes">
                  {availableRoutes.length === 0 ? (
                    <div className="flex items-start gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3.5">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-gray-100">
                        <MapPin className="h-4 w-4 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-500">No Available Routes</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
                          Add routes in the{" "}
                          <span className="font-medium text-blue-500">&ldquo;Add Customers&rdquo;</span>{" "}
                          page under Customer Destinations, or manually type the address in the fields below.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2.5 pt-0.5">
                        {availableRoutes.map((route, i) => {
                          const originLabel = route.originAddress || route.originState;
                          const destLabel = route.destLabel || route.destinationState;
                          const isSelected =
                            form.origin === (route.originAddress || route.originState) &&
                            form.destination === (route.destLabel || route.destinationState);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleRouteSelect(route)}
                              className={[
                                "flex flex-col items-start gap-1.5 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-150",
                                isSelected
                                  ? "border-blue-400 bg-blue-600 text-white shadow-md"
                                  : "border-gray-200 bg-white text-gray-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700",
                              ].join(" ")}
                            >
                              {/* Route line */}
                              <div className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                                <span>{originLabel}</span>
                                <span className={`text-xs ${isSelected ? "text-blue-200" : "text-gray-400"}`}>→</span>
                                <span>{destLabel}</span>
                              </div>
                              {/* Badges */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {route.cargoClassification && (
                                  <span className={[
                                    "rounded-md px-2 py-0.5 text-xs font-medium",
                                    isSelected
                                      ? "bg-blue-500 text-blue-100"
                                      : "border border-blue-100 bg-blue-50 text-blue-700",
                                  ].join(" ")}>
                                    {route.cargoClassification}
                                  </span>
                                )}
                                {route.containerType && (
                                  <span className={[
                                    "rounded-md px-2 py-0.5 text-xs font-medium",
                                    isSelected
                                      ? "bg-blue-500 text-blue-100"
                                      : "border border-purple-100 bg-purple-50 text-purple-700",
                                  ].join(" ")}>
                                    {route.containerType}
                                  </span>
                                )}
                                {route.hireAmount && (
                                  <span className={[
                                    "rounded-md px-2 py-0.5 text-xs font-bold",
                                    isSelected
                                      ? "bg-blue-500 text-blue-100"
                                      : "border border-emerald-200 bg-emerald-50 text-emerald-700",
                                  ].join(" ")}>
                                    ₹{Number(route.hireAmount).toLocaleString("en-IN")}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-xs text-gray-400">
                        Select a route to auto-fill trip details
                      </p>
                    </>
                  )}
                </Field>
              </div>
            )}

            <Field label="Origin Location" required>
              {isShifting ? (
                <>
                  <input
                    type="text"
                    required
                    value={form.origin}
                    onChange={(e) => update("origin", e.target.value)}
                    className={inputClass}
                    placeholder="Enter origin location"
                  />
                  <span className="mt-1 text-xs text-amber-600">Shifting trips — enter origin manually, no auto-fill from customer</span>
                </>
              ) : isExport ? (
                <>
                  <GlassSelect
                    value={form.origin}
                    onChange={(val) => handleOriginChange(val)}
                    options={[
                      { value: "TUTICORIN", label: "TUTICORIN" },
                      { value: "CHENNAI", label: "CHENNAI" },
                    ]}
                  />
                  <span className="mt-1 text-xs text-blue-600">Export trips — origin restricted to Tuticorin or Chennai</span>
                </>
              ) : (
                <>
                  <GlassCombobox
                    required
                    value={form.origin}
                    onChange={handleOriginChange}
                    placeholder="Select or type origin"
                    options={allOriginOptions}
                  />
                  {customerDestinationOriginStates.length > 0 && (
                    <span className="mt-1 text-xs text-blue-600">
                      Showing origin states from this customer&apos;s destinations
                    </span>
                  )}
                  {customerDestinationOriginStates.length === 0 && customerOriginNames.length > 0 && (
                    <span className="mt-1 text-xs text-blue-600">
                      Showing saved origins for this customer
                    </span>
                  )}
                </>
              )}
            </Field>

            <Field label="Destination Location" required>
              {isShifting ? (
                <>
                  <input
                    type="text"
                    required
                    value={form.destination}
                    onChange={(e) => update("destination", e.target.value)}
                    className={inputClass}
                    placeholder="Enter destination location"
                  />
                  <span className="mt-1 text-xs text-amber-600">Shifting trips — enter destination manually, no auto-fill from customer</span>
                </>
              ) : (
                <>
                  <GlassCombobox
                    required
                    value={form.destination}
                    onChange={handleDestinationChange}
                    placeholder="Select or type destination"
                    options={allDestinationOptions}
                  />
                  {form.destination && form.transportHireAmount && findPricingForDestAndSpec(form.destination, form.containerSpecification, form.cargoClassification, form.cargoWeight) && (
                    <span className="mt-1 flex items-center gap-1 text-xs text-green-700">
                      <Sparkles className="h-3 w-3" />
                      Hire amount auto-filled from customer pricing for this destination &amp; container spec
                    </span>
                  )}
                </>
              )}
            </Field>

          </div>
        </section>

        {/* Shipping Information */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>Shipping Information</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Shipping Line">
              <GlassCombobox
                value={form.shippingLine}
                onChange={(val) => update("shippingLine", val)}
                options={shippingLines.map((s) => ({ value: s, label: s }))}
                placeholder="Enter or select shipping line"
              />
            </Field>

            <Field label="Vessel Name">
              <input
                type="text"
                value={form.vesselName}
                onChange={(e) => update("vesselName", e.target.value)}
                className={inputClass}
                placeholder="Enter vessel name"
              />
            </Field>

            <Field label="Release Order Reference">
              <input
                type="text"
                value={form.releaseOrderReference}
                onChange={(e) => update("releaseOrderReference", e.target.value)}
                className={inputClass}
                placeholder="Enter release order reference"
              />
            </Field>
          </div>
        </section>

        {/* Vehicle & Trip Assignment */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>Vehicle &amp; Trip Assignment</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Scheduled Trip Date" required>
              <DatePickerInput
                required
                value={form.scheduledDate}
                onChange={(v) => update("scheduledDate", v)}
              />
            </Field>

            <Field label="Approximate KM">
              <DecimalInput
                type="number"
                min="0"
                step="1"
                value={form.approxKm ?? ""}
                onChange={(e) => update("approxKm", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass}
                placeholder="Enter approximate KM"
              />
              <span className="mt-1 text-xs text-gray-400">
                Auto-fetched from customer destination — editable if needed. Used as baseline for ±10% KM variance check in trip sheet.
              </span>
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
                  placeholder="Enter reason for driver change"
                  className={`${inputClass} resize-none`}
                />
              </Field>
            )}
          </div>
        </section>

        {/* Payment & Advances */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>Payment &amp; Advances</p>
          {isShifting && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Billing not applicable for Shifting trips</span> — shifting trips are internal vehicle relocations between company locations and are not billed to any customer or consignee. All billing fields are locked.
              </p>
            </div>
          )}
          {(() => {
            const locked = isShifting || isSelf;
            return (
              <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${locked ? "pointer-events-none opacity-50" : ""}`}>
                <Field label="Bill To" required={!locked}>
                  <GlassSelect
                    value={form.billTo}
                    onChange={(val) => {
                      const newBillTo = val as Trip["billTo"];
                      setForm((prev) => ({
                        ...prev,
                        billTo: newBillTo,
                        ...(newBillTo === "SELF/CGI" ? { paymentType: "Credit" } : {}),
                      }));
                    }}
                    disabled={locked}
                    options={[
                      { value: "", label: isSelf ? "Not applicable (Self customer)" : "Select bill to" },
                      ...BILL_TO_OPTIONS.map(o => ({ value: o, label: o }))
                    ]}
                  />
                </Field>

                <Field label="Payment Type" required={!locked}>
                  <GlassSelect
                    value={(isSelf || form.billTo === "SELF/CGI") ? "Credit" : form.paymentType}
                    onChange={(val) => update("paymentType", val as Trip["paymentType"])}
                    disabled={locked || form.billTo === "SELF/CGI"}
                    options={[
                      { value: "", label: "Select payment type" },
                      ...PAYMENT_TYPE_OPTIONS.map(o => ({ value: o, label: o }))
                    ]}
                  />
                  {isSelf && (
                    <span className="mt-1 text-xs text-blue-600">Locked to Credit for Self customer</span>
                  )}
                  {!isSelf && form.billTo === "SELF/CGI" && (
                    <span className="mt-1 text-xs text-orange-600 font-medium">Locked to Credit — Bill To is SELF/CGI</span>
                  )}
                </Field>

                <Field label="Customer Cash Advance (₹)" required={!locked}>
                  <DecimalInput type="number"
                    min="0"
                    value={form.customerCashAdvance}
                    onChange={(e) => update("customerCashAdvance", e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    readOnly={locked}
                    className={`${inputClass} ${locked ? "cursor-not-allowed bg-gray-50 text-gray-400" : ""}`}
                    placeholder="Enter cash advance amount"
                  />
                </Field>

                <Field label="Customer Fuel Advance (₹)" required={!locked}>
                  <DecimalInput type="number"
                    min="0"
                    value={form.customerFuelAdvanceAmount}
                    onChange={(e) => update("customerFuelAdvanceAmount", e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    readOnly={locked}
                    className={`${inputClass} ${locked ? "cursor-not-allowed bg-gray-50 text-gray-400" : ""}`}
                    placeholder="Enter fuel advance amount"
                  />
                </Field>

                <Field label="Customer Fuel Advance (Litres)" required={!locked}>
                  <DecimalInput type="number"
                    min="0"
                    value={form.customerFuelAdvanceLitres}
                    onChange={(e) => update("customerFuelAdvanceLitres", e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    readOnly={locked}
                    className={`${inputClass} ${locked ? "cursor-not-allowed bg-gray-50 text-gray-400" : ""}`}
                    placeholder="Enter fuel advance litres"
                  />
                </Field>
              </div>
            );
          })()}
        </section>

        {/* Driver Compensation */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>Driver Compensation</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Driver Compensation Type" required>
              <GlassSelect
                value={form.driverCompensationType}
                onChange={handleCompensationTypeChange}
                disabled={isReturnTrip}
                options={[
                  { value: "", label: "Select compensation type" },
                  ...DRIVER_COMPENSATION_TYPE_OPTIONS.map(opt => ({ value: opt, label: opt })),
                ]}
              />
              {isReturnTrip && (
                <span className="mt-1 text-xs text-blue-600">Fixed for Return Trip</span>
              )}
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
                placeholder="Enter driver advance"
              />
            </Field>
            )}


            <Field label="Driver Batta Amount (₹)" required>
              <DecimalInput type="number"
                min="0"
                value={form.driverAdvanceAmount}
                onChange={(e) => update("driverAdvanceAmount", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                readOnly={isNormalComp}
                className={`${inputClass} ${isNormalComp ? "cursor-not-allowed bg-green-50 text-green-800" : ""}`}
                placeholder={isNormalComp ? "Auto-calculated" : "Enter fixed batta amount"}
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
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>Transport Cost Details</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Hire Amount (₹)" required>
              <DecimalInput type="number"
                min="0"
                value={form.transportHireAmount}
                onChange={(e) => handleHireAmountChange(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                readOnly={
                  (!isReturnTrip && !isOpenLoad && !isShifting) ||
                  (isTonBased && !!(form.cargoWeight && form.ratePerTon))
                }
                className={`${inputClass} ${
                  (!isReturnTrip && !isOpenLoad && !isShifting) || (isTonBased && form.cargoWeight && form.ratePerTon)
                    ? "cursor-not-allowed bg-gray-50 text-gray-500"
                    : ""
                }`}
                placeholder="Enter hire amount"
              />
              {!isReturnTrip && !isOpenLoad && !isShifting && (
                <span className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                  <Info className="h-3 w-3" />
                  Hire amount is set from customer pricing and is locked. Only editable for Return, Shifting, and Open Load trips.
                </span>
              )}
              {isShifting && (
                <span className="mt-1 text-xs text-amber-600">Shifting trips — enter hire amount manually</span>
              )}
              {isTonBased && form.cargoWeight && form.ratePerTon && (
                <span className="mt-1 flex items-center gap-1 text-xs text-green-700">
                  <Sparkles className="h-3 w-3" />
                  Auto-calculated from Cargo Weight × Rate Per Ton
                </span>
              )}
              {isFixedHire && (
                <span className="mt-1 text-xs text-gray-500">Fixed hire — enter the agreed amount directly</span>
              )}
            </Field>
          </div>
        </section>

        {/* Operational Notes */}
        <section className="flex flex-col gap-5">
          <p className={sectionHeadingClass}>Operational Notes</p>
          <div className="grid grid-cols-1 gap-5">
            <Field label="Internal Remarks">
              <textarea
                value={form.internalRemarks}
                onChange={(e) => update("internalRemarks", e.target.value)}
                className={`${inputClass} min-h-20 resize-y`}
                placeholder="Enter internal remarks"
              />
            </Field>

            <Field label="Booking Instructions">
              <textarea
                value={form.bookingInstructions}
                onChange={(e) => update("bookingInstructions", e.target.value)}
                className={`${inputClass} min-h-20 resize-y`}
                placeholder="Enter booking instructions"
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
