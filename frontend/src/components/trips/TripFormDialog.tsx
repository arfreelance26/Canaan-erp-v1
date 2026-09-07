"use client";

import { X, Info, Sparkles, MapPin, Truck as TruckIcon, User } from "lucide-react";
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
import type { CustomerPricing } from "@/types/customer-pricing";
import type { FinalCustomerPricing } from "@/types/final-customer-pricing";
import type { Branch } from "@/types/branch";
import { branchesApi, customersApi, defaultBattaApi, tripsApi, trucksApi, type DefaultBattaRate } from "@/lib/api";
import { confirmAction, showError, showSuccess } from "@/lib/swal";
import { todayIst } from "@/lib/format-date";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { cn } from "@/lib/utils";
import { BranchChangeNoteDialog } from "@/components/fleet/BranchChangeNoteDialog";
import { BranchChangeScopeDialog } from "@/components/trips/BranchChangeScopeDialog";

export const TRIP_DRAFT_KEY = "erp_trip_form_draft";
const TRIP_VEHICLE_DRAFT_KEY = "erp_trip_form_draft_vehicle";

export function clearTripDraft() {
  clearFormDraft(TRIP_DRAFT_KEY);
  try { sessionStorage.removeItem(TRIP_VEHICLE_DRAFT_KEY); } catch {}
}

// Driver Compensation Type "DEFAULT" reads from Default Batta Management,
// which keys its cells as "20FT CONTAINER" / "2X20 FEET CONTAINERS" (no
// spaces before FT/X) while the trip form's containerSpecification keeps the
// spaced form — this maps one to the other.
const COMPENSATION_TYPE_OPTIONS = ["Normal", "DEFAULT", "CUSTOM"] as const;

function toDefaultBattaCargoType(containerSpecification: string): string {
  const map: Record<string, string> = {
    "20 FT CONTAINER": "20FT CONTAINER",
    "40 FT CONTAINER": "40FT CONTAINER",
    "2 X 20 FEET CONTAINERS": "2X20 FEET CONTAINERS",
    "OPEN LOAD CARGO": "OPEN LOAD CARGO",
  };
  return map[containerSpecification] ?? containerSpecification;
}

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
  // Resolves to whether the trip was actually persisted — TripFormDialog needs
  // this to know it's safe to commit a pending branch change (see handleSubmit).
  onSave: (trip: Trip) => Promise<boolean>;
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
  isBattaApplicable: false,
  openLoadHireType: "",
  ratePerTon: "",
  transportHireAmount: "",
  transportCrossingAmount: "",
  transportCommissionAmount: "",
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
  // Optimistic branch reassignment from the quick-change pills below the
  // Assigned Vehicle card — keyed by truck.id so it applies instantly without
  // waiting on assignableDrivers (a prop owned by the parent list) to refetch.
  const [branchOverrides, setBranchOverrides] = useState<Record<string, string>>({});
  // A pill click applies instantly (branchOverrides above + a recalculated
  // Driver Compensation) with no dialog — this is what "This Trip Only" vs
  // "Permanently" needs to know about later. branchDraft.truck is always the
  // ORIGINAL truck object, so truck.branchRegisteredTo stays the true "from"
  // branch even after the override is applied.
  const [branchDraft, setBranchDraft] = useState<{ truck: Truck; branchName: string } | null>(null);
  // The scope choice ("This Trip Only" vs "Permanently") and, for Permanently,
  // the note — both deferred to Assign/Save time (see handleSubmit) and shown
  // only if branchDraft is set. pendingTripPayload holds the trip built by
  // handleSubmit while these are being resolved; cancelling either dialog
  // aborts the submit entirely (nothing is saved, nothing sent to the backend),
  // so a cancelled trip never leaves an orphaned branch reassignment.
  const [branchChangeRequest, setBranchChangeRequest] = useState<{ truck: Truck; branchName: string } | null>(null);
  const [branchChangeNoteRequest, setBranchChangeNoteRequest] = useState<{ truck: Truck; branchName: string } | null>(null);
  const [pendingTripPayload, setPendingTripPayload] = useState<Trip | null>(null);
  // Default Batta Management rates for the assigned truck's current branch —
  // refetched whenever the effective branch changes. Compensation Type
  // "DEFAULT" looks amounts up from here by trip category + container type.
  const [defaultBattaRates, setDefaultBattaRates] = useState<DefaultBattaRate[]>([]);
  const [customerDestinations, setCustomerDestinations] = useState<CustomerDestination[]>([]);
  const [customerPricing, setCustomerPricing] = useState<CustomerPricing[]>([]);
  const [finalCustomerPricing, setFinalCustomerPricing] = useState<FinalCustomerPricing | null>(null);
  const [shippingLines, setShippingLines] = useState<string[]>([]);
  const [cargoReferences, setCargoReferences] = useState<string[]>([]);
  const wasOpenRef = useRef(false);
  const vehicleRestoredRef = useRef(false);

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => setBranches([]));
    tripsApi.listShippingLines().then(setShippingLines).catch(() => {});
    tripsApi.listCargoReferences().then(setCargoReferences).catch(() => {});
  }, []);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (justOpened) {
      setBranchOverrides({});
      setBranchDraft(null);
      setBranchChangeRequest(null);
      setBranchChangeNoteRequest(null);
      setPendingTripPayload(null);
      if (initialData) {
        const { id: _id, tripId: _tripId, status: _status, vehicleId: _vehicleId, ...rest } = initialData;
        setForm(rest);
        const vehicleAssignment = assignableDrivers.find((a) => a.truck.truckId === initialData.vehicleId);
        setVehicleAssignmentId(vehicleAssignment?.driver.driverId ?? "");
        if (initialData.customerId) {
          customersApi.listDestinations(initialData.customerId).then(setCustomerDestinations).catch(() => {});
          customersApi.listPricing(initialData.customerId).then(setCustomerPricing).catch(() => {});
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

  // Auto-zero lift-on for Coastal trips
  useEffect(() => {
    if (form.cargoClassification === "COASTAL") {
      setForm((prev) => ({ ...prev, liftOnAmount: "0" }));
    }
  }, [form.cargoClassification]); // eslint-disable-line react-hooks/exhaustive-deps

  const getTruckBranch = (truck: Truck): string => branchOverrides[truck.id] ?? truck.branchRegisteredTo;

  function setBranchOverride(truckId: string, branchName: string | null) {
    setBranchOverrides((prev) => {
      const next = { ...prev };
      if (branchName === null) delete next[truckId];
      else next[truckId] = branchName;
      return next;
    });
  }

  // Recompute Normal-type Driver Compensation against a branch's percentage.
  // Nothing else triggers this on a branch-pill click (the other recalcs only
  // fire from vehicle/hire-amount/compensation-type changes), so without this
  // the badge showing "% Comp." updates but the actual driverAdvanceAmount
  // field silently stays stale.
  function recalcCompensationForBranch(branchName: string) {
    setForm((prev) => {
      if (prev.tripCategory === "RETURN TRIP" || prev.driverCompensationType !== "Normal") return prev;
      const branch = branches.find((b) => b.name === branchName);
      const pct = branch ? parseFloat(branch.driverHaltDayPercentage || "0") : null;
      const battaBase = finalCustomerPricing?.accountsHireAmount ?? prev.transportHireAmount;
      return { ...prev, driverAdvanceAmount: calcCompensation(battaBase, pct) };
    });
  }

  // A pill click applies instantly — no dialog, no backend call. Picking the
  // truck's own actual registered branch (undoing a pending change) clears the
  // override; anything else records it as branchDraft so handleSubmit knows to
  // ask "This Trip Only" vs "Permanently" once the user is ready to save.
  function handleChangeVehicleBranch(truck: Truck, branchName: string) {
    if (getTruckBranch(truck) === branchName) return;
    const isRevert = branchName === truck.branchRegisteredTo;
    setBranchOverride(truck.id, isRevert ? null : branchName);
    setBranchDraft(isRevert ? null : { truck, branchName });
    recalcCompensationForBranch(branchName);
  }

  // Called once the user resolves the scope dialog shown at Assign/Save time
  // (see handleSubmit, which set branchChangeRequest + pendingTripPayload).
  function handleBranchChangeScope(scope: "trip_only" | "permanent") {
    if (!branchChangeRequest || !pendingTripPayload) return;
    const { truck, branchName } = branchChangeRequest;
    setBranchChangeRequest(null);

    if (scope === "permanent") {
      setBranchChangeNoteRequest({ truck, branchName });
      return;
    }

    const payload = pendingTripPayload;
    setPendingTripPayload(null);
    finalizeSubmit(payload, { truck, branchName, mode: "trip_only" });
  }

  async function submitVehicleBranchChange(note: string) {
    if (!branchChangeNoteRequest || !pendingTripPayload) return;
    const { truck, branchName } = branchChangeNoteRequest;
    setBranchChangeNoteRequest(null);
    const payload = pendingTripPayload;
    setPendingTripPayload(null);
    await finalizeSubmit(payload, { truck, branchName, mode: "permanent", note });
  }

  // Cancelling either dialog aborts the submit — the trip is not saved and no
  // branch-change call is made. The instant local branch pick made via the
  // pills is left as-is; clicking Assign again re-opens the same choice.
  function cancelBranchChangeRequest() {
    setBranchChangeRequest(null);
    setPendingTripPayload(null);
  }

  function cancelBranchChangeNoteRequest() {
    setBranchChangeNoteRequest(null);
    setPendingTripPayload(null);
  }

  // Persists the trip via the parent-owned onSave, then — only if that actually
  // succeeded — commits the deferred branch change. A failed trip save leaves
  // branchDraft/pendingTripPayload untouched by the caller so nothing here needs
  // to retry; the user just resubmits the form.
  async function finalizeSubmit(
    tripPayload: Trip,
    branchChange: { truck: Truck; branchName: string; mode: "trip_only" | "permanent"; note?: string } | null
  ) {
    const saved = await onSave(tripPayload);
    if (saved && branchChange) {
      try {
        if (branchChange.mode === "trip_only") {
          await trucksApi.changeBranchTripOnly(branchChange.truck.id, branchChange.branchName, tripPayload.tripId);
          showSuccess(`Branch updated to ${branchChange.branchName} for this trip only.`);
        } else {
          await trucksApi.changeBranchPermanently(branchChange.truck.id, branchChange.branchName, branchChange.note || "");
          showSuccess(`Branch updated to ${branchChange.branchName}.`);
        }
        setBranchDraft(null);
      } catch (err: unknown) {
        // The trip itself is already saved — this is a separate, non-blocking
        // failure. Leave the local override in place (it still reflects what
        // was used for this trip's compensation) but surface the problem.
        showError(
          err instanceof Error
            ? `Trip saved, but the branch change failed: ${err.message}`
            : "Trip saved, but the branch change failed."
        );
      }
    }
  }

  const selectedAssignment = assignableDrivers.find((a) => a.driver.driverId === vehicleAssignmentId);
  const selectedTruckBranch = selectedAssignment ? getTruckBranch(selectedAssignment.truck) : "";
  const selectedBranch = branches.find((b) => b.name === selectedTruckBranch);
  const compensationPct = selectedBranch ? parseFloat(selectedBranch.driverHaltDayPercentage || "0") : null;
  const isNormalComp = form.driverCompensationType === "Normal";
  const isDefaultComp = form.driverCompensationType === "DEFAULT";
  const isShifting = form.tripCategory === "SHIFTING";
  const isReturnTrip = form.tripCategory === "RETURN TRIP";
  const isExport = form.cargoClassification === "EXPORT";
  const isOpenLoad = form.cargoClassification === "OPEN LOAD" || form.containerSpecification === "OPEN LOAD CARGO";
  const isCoastal = form.cargoClassification === "COASTAL";
  const isTonBased = isOpenLoad && (form.openLoadHireType === "Ton Based" || form.openLoadHireType === "");
  const isFixedHire = isOpenLoad && form.openLoadHireType === "Fixed";
  // DEFAULT compensation: looked up from Default Batta Management by the
  // assigned truck's branch (defaultBattaRates is already scoped to it — see
  // the fetch effect above) + trip category + container type.
  const defaultBattaAmount = ((): number | null => {
    if (!form.tripCategory || !form.containerSpecification) return null;
    const cargoType = toDefaultBattaCargoType(form.containerSpecification);
    const row = defaultBattaRates.find((r) => r.tripType === form.tripCategory && r.cargoType === cargoType);
    return row?.amount ?? null;
  })();
  // "Self" customer: CGI is the shipper — billing, advances, and CHA are locked
  const isSelf = (() => {
    const c = customers.find((c) => c.id === form.customerId);
    const name = (c?.name ?? form.shipperConsignee ?? "").trim().toLowerCase();
    return name === "self" || name === "cgi";
  })();
  // Lift-on: manual entry for Shifting/Empty/Open, locked at 0 for Coastal, editable for others
  const isLiftOnLocked = isCoastal;
  const isLiftOnManual = isShifting || form.cargoClassification === "EMPTY" || isOpenLoad;
  // Hire Amount (excluding Commission Amount) — purely derived, never persisted.
  const hireExcludingCommission = (() => {
    const hire = parseFloat(form.transportHireAmount || "");
    const commission = parseFloat(form.transportCommissionAmount || "");
    if (isNaN(hire) && isNaN(commission)) return "";
    return String((isNaN(hire) ? 0 : hire) - (isNaN(commission) ? 0 : commission));
  })();

  // Refetch Default Batta Management rates whenever the assigned truck's
  // effective branch changes (branch pill click, vehicle switch, dialog open).
  useEffect(() => {
    if (!selectedBranch) {
      setDefaultBattaRates([]);
      return;
    }
    defaultBattaApi.list(String(selectedBranch.id)).then(setDefaultBattaRates).catch(() => setDefaultBattaRates([]));
  }, [selectedBranch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep driverAdvanceAmount in sync while "DEFAULT" is selected — branch,
  // trip category, or container type changing all flow through here since
  // defaultBattaAmount is recomputed every render from those same inputs.
  useEffect(() => {
    if (!isDefaultComp || isReturnTrip) return;
    setForm((prev) => {
      if (prev.driverCompensationType !== "DEFAULT") return prev;
      const next = defaultBattaAmount !== null ? String(defaultBattaAmount) : "";
      return prev.driverAdvanceAmount === next ? prev : { ...prev, driverAdvanceAmount: next };
    });
  }, [isDefaultComp, isReturnTrip, defaultBattaAmount]);

  type RouteOption = {
    originState: string;
    originAddress: string;
    destinationState: string;
    destLabel: string;
    hireAmount: string;
    commissionAmount: string;
    approxDistanceKm: string;
    cargoClassification: string;
    containerType: string;
    cargoWeight: string;
  };

  // Build one route entry per destination that has both originState and destinationState.
  // Cargo/container/weight now live on the destination itself; the rate still
  // comes from the matching pricing row for that destination (customer_pricing
  // is keyed 1:1 by destination label now that it no longer carries its own
  // cargo/container/weight combo).
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
        commissionAmount: matchedPricing?.commissionAmount ?? "",
        approxDistanceKm: d.approxDistanceKm ?? "",
        cargoClassification: d.cargoClassification ?? "",
        containerType: d.containerType ?? "",
        cargoWeight: d.weightInTons ?? "",
      };
    });

  function containerTypeToSpec(ct: string): Trip["containerSpecification"] | "" {
    const map: Record<string, Trip["containerSpecification"]> = {
      "20 FEET": "20 FT CONTAINER",
      "40 FEET": "40 FT CONTAINER",
      "2 X 20 FEET": "2 X 20 FEET CONTAINERS",
      "OPEN LOAD": "OPEN LOAD CARGO",
    };
    return map[ct] ?? "";
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
    if (customerId) {
      customersApi.listFinalPricing(customerId).then((fps) => setFinalCustomerPricing(fps[0] ?? null)).catch(() => {});
      customersApi.listDestinations(customerId).then(setCustomerDestinations).catch(() => {});
      customersApi.listPricing(customerId).then((pricing) => {
        setCustomerPricing(pricing);
        // Don't auto-apply pricing[0] — there may be multiple rows for the same customer
        // with different container specs. Wait for user to pick a route below.
      }).catch(() => {});
    }
  }

  function handleRouteSelect(route: RouteOption) {
    if (isShifting) return;
    const routeOrigin = route.originAddress || route.originState;
    const routeDestination = route.destLabel || route.destinationState;
    const alreadySelected = form.origin === routeOrigin && form.destination === routeDestination;
    if (alreadySelected) {
      setForm((prev) => ({
        ...prev,
        origin: "",
        destination: "",
        transportHireAmount: "",
        transportCommissionAmount: "",
        cargoClassification: "",
        containerSpecification: "",
        cargoWeight: "",
        approxTripDistance: "",
        approxKm: "",
        ...(prev.driverCompensationType === "Normal" ? { driverAdvanceAmount: "" } : {}),
      }));
      return;
    }
    const assignment = assignableDrivers.find((a) => a.driver.driverId === vehicleAssignmentId);
    const branch = branches.find((b) => b.name === (assignment ? getTruckBranch(assignment.truck) : ""));
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
      transportCommissionAmount: route.commissionAmount || "",
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

  // Cargo classification / container type / weight now live on the customer
  // destination itself (not on the pricing row — a destination is 1:1 with a
  // single cargo/container/weight combo, and its rate is looked up separately
  // via findRateForDestination).
  function findDestinationForSpec(
    destination: string,
    containerSpec: string,
    cargoClassification?: string,
    weightInTons?: string,
  ): CustomerDestination | undefined {
    return customerDestinations.find((d) => {
      const dest = d.destinationName ?? d.destinationAddress ?? "";
      if (dest !== destination) return false;
      if (containerSpec && containerTypeToSpec(d.containerType ?? "") !== containerSpec) return false;
      // Match on cargo classification only when both sides are non-empty
      if (cargoClassification && d.cargoClassification && d.cargoClassification !== cargoClassification) return false;
      // Match on weight only when both sides are non-empty
      if (weightInTons && d.weightInTons && d.weightInTons !== weightInTons) return false;
      return true;
    });
  }

  function findRateForDestination(destination: string): string {
    const p = customerPricing.find((p) => {
      const dest = typeof p.customerDestination === "object" && p.customerDestination !== null
        ? ((p.customerDestination as any).destinationName ?? (p.customerDestination as any).destinationAddress ?? "")
        : String(p.customerDestination || "");
      return dest === destination;
    });
    return p?.rate ?? "";
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
    // A pending branch change belongs to whichever truck was selected when it
    // was made — switching to a different vehicle leaves that truck behind, so
    // drop the pending change and its local override rather than carry it over.
    setBranchDraft((prev) => {
      if (prev && prev.truck.truckId !== assignment?.truck.truckId) {
        setBranchOverride(prev.truck.id, null);
        return null;
      }
      return prev;
    });

    setVehicleAssignmentId(assignmentDriverId);
    setForm((prev) => {
      if (prev.tripCategory === "RETURN TRIP") return { ...prev, driverId: assignmentDriverId };
      const branch = branches.find((b) => b.name === (assignment ? getTruckBranch(assignment.truck) : ""));
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
      const branch = branches.find((b) => b.name === (assignment ? getTruckBranch(assignment.truck) : ""));
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
      let driverAdvanceAmount: string;
      if (val === "Normal") {
        const assignment = assignableDrivers.find((a) => a.driver.driverId === vehicleAssignmentId);
        const branch = branches.find((b) => b.name === (assignment ? getTruckBranch(assignment.truck) : ""));
        const pct = branch ? parseFloat(branch.driverHaltDayPercentage || "0") : null;
        const battaBase = finalCustomerPricing?.accountsHireAmount ?? prev.transportHireAmount;
        driverAdvanceAmount = calcCompensation(battaBase, pct);
      } else if (val === "DEFAULT") {
        const cargoType = toDefaultBattaCargoType(prev.containerSpecification);
        const row = defaultBattaRates.find((r) => r.tripType === prev.tripCategory && r.cargoType === cargoType);
        driverAdvanceAmount = row?.amount != null ? String(row.amount) : "";
      } else {
        // CUSTOM — leave whatever is already there for manual editing
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

    if (!isShifting && (!form.origin || !form.destination)) {
      await showError("Please select a route from Available Routes.", "Route Required");
      return;
    }

    const tripPayload: Trip = initialData
      ? {
          id: initialData.id,
          tripId: initialData.tripId,
          status: initialData.status,
          assignedDate: initialData.assignedDate,
          vehicleId: assigned.truck.truckId,
          ...form,
        }
      : {
          id: crypto.randomUUID(),
          tripId: generateTripId(existingTrips),
          status: "Assigned",
          assignedDate: todayIst(),
          vehicleId: assigned.truck.truckId,
          ...form,
        };

    // Only ask "This Trip Only" vs "Permanently" if the branch was actually
    // changed via the pills. The trip itself isn't saved yet — finalizeSubmit
    // (called either below or once the scope/note dialogs resolve) does that.
    if (branchDraft) {
      setPendingTripPayload(tripPayload);
      setBranchChangeRequest({ truck: branchDraft.truck, branchName: branchDraft.branchName });
      return;
    }

    await finalizeSubmit(tripPayload, null);
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
                      isBattaApplicable: false,
                    }));
                  } else if (val === "RETURN TRIP") {
                    setForm((prev) => ({
                      ...prev,
                      tripCategory: val as Trip["tripCategory"],
                      driverAdvance: "",
                      driverCompensationType: "CUSTOM",
                      isBattaApplicable: false,
                    }));
                  } else {
                    setForm((prev) => ({ ...prev, tripCategory: val as Trip["tripCategory"], isBattaApplicable: false }));
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
                  const matchedDest = form.destination
                    ? findDestinationForSpec(form.destination, val, cls, form.cargoWeight)
                    : undefined;
                  setForm((prev) => ({
                    ...prev,
                    containerSpecification: val as Trip["containerSpecification"],
                    cargoClassification: cls as Trip["cargoClassification"],
                    ...(matchedDest ? {
                      transportHireAmount: findRateForDestination(form.destination) || "",
                      cargoWeight: matchedDest.weightInTons || prev.cargoWeight,
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
                          This customer has no routes configured yet. Add one in the{" "}
                          <span className="font-medium text-blue-500">&ldquo;Add Customers&rdquo;</span>{" "}
                          page under Customer Destinations, then it will appear here to select.
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
                  <GlassSelect
                    value={form.origin}
                    onChange={(val) => update("origin", val)}
                    options={[
                      { value: "TUTICORIN", label: "TUTICORIN" },
                      { value: "CHENNAI", label: "CHENNAI" },
                    ]}
                  />
                  <span className="mt-1 text-xs text-amber-600">Shifting trips — origin restricted to Tuticorin or Chennai</span>
                </>
              ) : isExport ? (
                <>
                  <GlassSelect
                    value={form.origin}
                    onChange={(val) => update("origin", val)}
                    options={[
                      { value: "TUTICORIN", label: "TUTICORIN" },
                      { value: "CHENNAI", label: "CHENNAI" },
                    ]}
                  />
                  <span className="mt-1 text-xs text-blue-600">Export trips — origin restricted to Tuticorin or Chennai</span>
                </>
              ) : (
                <>
                  <div className={`${inputClass} flex cursor-not-allowed items-center bg-gray-50 text-gray-700`}>
                    <span className={form.origin ? "" : "text-gray-400"}>
                      {form.origin || "Select a route below"}
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-gray-400">
                    Set automatically when you select a route from Available Routes above
                  </span>
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
                  <div className={`${inputClass} flex cursor-not-allowed items-center bg-gray-50 text-gray-700`}>
                    <span className={form.destination ? "" : "text-gray-400"}>
                      {form.destination || "Select a route below"}
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-gray-400">
                    Set automatically when you select a route from Available Routes above
                  </span>
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
                <div className="mt-2 flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3.5 shadow-sm dark:border-gray-300/20 dark:bg-gray-200/60">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white shadow-sm dark:bg-blue-400/20 dark:text-blue-800">
                      <TruckIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-gray-900">
                        {selectedAssignment.truck.registrationNumber}
                        <span className="ml-1.5 font-normal text-gray-400">({selectedAssignment.truck.truckId})</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
                        <User className="h-3 w-3 shrink-0 text-gray-400" />
                        {selectedAssignment.driver.name}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      {selectedTruckBranch && (
                        <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                          {selectedTruckBranch}
                        </span>
                      )}
                      {compensationPct !== null && (
                        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          {compensationPct}% Comp.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick branch change — same pattern as Our Fleet's truck cards */}
                  {branches.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-200 pt-3 dark:border-gray-300/20">
                      <span className="mr-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        Branch
                      </span>
                      {branches.map((branch) => {
                        const active = selectedTruckBranch === branch.name;
                        return (
                          <button
                            key={branch.id}
                            type="button"
                            onClick={() => handleChangeVehicleBranch(selectedAssignment.truck, branch.name)}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                              active
                                ? "border-gray-900 bg-gray-900 text-white dark:border-blue-400/40 dark:bg-blue-400/20 dark:text-blue-800"
                                : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-300/30 dark:bg-gray-300/20 dark:text-gray-700 dark:hover:bg-gray-300/30"
                            )}
                          >
                            {branch.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                  ...COMPENSATION_TYPE_OPTIONS.map(opt => ({ value: opt, label: opt })),
                ]}
              />
              {isReturnTrip && (
                <span className="mt-1 text-xs text-blue-600">Fixed for Return Trip</span>
              )}
            </Field>

            {isReturnTrip && (
              <Field label="Is Batta Applicable">
                <div className="relative flex w-fit rounded-full border border-gray-200 bg-gray-100 p-1">
                  <span
                    className={`absolute top-1 bottom-1 left-1 w-20 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
                      form.isBattaApplicable ? "translate-x-20" : "translate-x-0"
                    }`}
                  />
                  {(["No", "Yes"] as const).map((label) => {
                    const value = label === "Yes";
                    const active = form.isBattaApplicable === value;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => update("isBattaApplicable", value)}
                        className={`relative z-10 w-20 rounded-full py-1.5 text-sm font-semibold transition-colors focus:outline-none ${
                          active ? "text-blue-700" : "text-gray-500"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <span className="mt-1 text-xs text-gray-500">
                  Return trip batta is normally paid beforehand and excluded from Net Payable — set
                  to &ldquo;Yes&rdquo; only if this driver still needs to be paid for it.
                </span>
              </Field>
            )}

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
                readOnly={isNormalComp || isDefaultComp}
                className={`${inputClass} ${(isNormalComp || isDefaultComp) ? "cursor-not-allowed bg-green-50 text-green-800" : ""}`}
                placeholder={isNormalComp ? "Auto-calculated" : isDefaultComp ? "Fetched from Default Batta Management" : "Enter custom batta amount"}
              />
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
              {!isReturnTrip && isDefaultComp && defaultBattaAmount !== null && (
                <span className="mt-1 flex items-center gap-1 text-xs text-blue-600">
                  <Sparkles className="h-3 w-3" />
                  Default rate — {selectedTruckBranch || "unknown branch"} / {form.tripCategory} / {form.containerSpecification}: ₹{Number(defaultBattaAmount).toLocaleString("en-IN")}
                </span>
              )}
              {!isReturnTrip && isDefaultComp && defaultBattaAmount === null && (
                <span className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                  <Info className="h-3 w-3" />
                  {!form.driverId
                    ? "Select a vehicle first"
                    : !form.tripCategory || !form.containerSpecification
                    ? "Select a trip category and container type to look up the default rate"
                    : `No default batta configured for ${selectedTruckBranch || "this branch"} / ${form.tripCategory} / ${form.containerSpecification} — set one in Default Batta Management, or switch to Custom.`}
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

            <Field label="Commission Amount (₹)">
              <DecimalInput type="number"
                min="0"
                value={form.transportCommissionAmount ?? ""}
                onChange={(e) => update("transportCommissionAmount", e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass}
                placeholder="Enter commission amount"
              />
              <span className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                <Info className="h-3 w-3" />
                Fetched from customer pricing when a route is selected above. Edit to override.
              </span>
            </Field>

            <Field label="Hire Amount (excluding Commission Amount) (₹)">
              <input
                type="text"
                readOnly
                disabled
                value={hireExcludingCommission ? `₹${Number(hireExcludingCommission).toLocaleString("en-IN")}` : ""}
                placeholder="Auto-calculated"
                className={`${inputClass} cursor-not-allowed bg-gray-50 text-gray-500`}
              />
              <span className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                <Info className="h-3 w-3" />
                Hire Amount − Commission Amount
              </span>
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

      <BranchChangeScopeDialog
        open={!!branchChangeRequest}
        truckLabel={branchChangeRequest ? `${branchChangeRequest.truck.registrationNumber} (${branchChangeRequest.truck.truckId})` : ""}
        fromBranch={branchChangeRequest ? branchChangeRequest.truck.branchRegisteredTo : ""}
        toBranch={branchChangeRequest?.branchName || ""}
        onChoose={handleBranchChangeScope}
        onClose={cancelBranchChangeRequest}
      />

      <BranchChangeNoteDialog
        open={!!branchChangeNoteRequest}
        truckLabel={branchChangeNoteRequest ? `${branchChangeNoteRequest.truck.registrationNumber} (${branchChangeNoteRequest.truck.truckId})` : ""}
        fromBranch={branchChangeNoteRequest ? branchChangeNoteRequest.truck.branchRegisteredTo : ""}
        toBranch={branchChangeNoteRequest?.branchName || ""}
        onSubmit={submitVehicleBranchChange}
        onClose={cancelBranchChangeNoteRequest}
      />
    </Dialog>
  );
}
