"use client";

import { useState, useMemo, useEffect, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass, inputClassLower } from "@/components/ui/Field";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import type { Trip } from "@/types/trip";
import type { Customer } from "@/types/customer";
import type { TripSheetData } from "@/types/trip-sheet";
import type { SacCode } from "@/types/sac-code";
import { sacCodesApi, tripsApi } from "@/lib/api";
import { todayIst } from "@/lib/format-date";
import { amountToWords } from "@/lib/invoice-builder";
import { INVOICE_TYPES, roundGrandTotal, type InvoiceType, type ServiceLine } from "./GenerateInvoiceDialog";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { haltBilledOn } from "@/lib/halt-pay";

const emptyService = (): ServiceLine => ({
  descriptionOfService: "", sacCode: "", sacId: "", gstRate: "", quantity: "", rate: "",
});

// A service line the user hasn't touched yet — used so a SAC-table pick fills
// the empty default line (Service 1) instead of appending an empty Service 1.
const isBlankService = (s: ServiceLine): boolean =>
  !s.descriptionOfService.trim() && !s.sacCode.trim() &&
  !s.gstRate.trim() && !s.quantity.trim() && !s.rate.trim();

// Maps each admin-configured expense heading → the TripSheet field that holds its value
// (mirrors GenerateInvoiceDialog's EXPENSE_TO_SHEET_FIELD, duplicated here since it isn't exported).
const EXPENSE_TO_SHEET_FIELD: Partial<Record<string, keyof TripSheetData>> = {
  "Hire Amount":                   "hireAmount",
  "Lift On / Off":                 "liftOnOffExpense",
  "Weight Sheet Expense":          "weightSheetExpense",
  // Party (customer-caused) halt only — the company's own halt is our expense,
  // not something to bill the customer for.
  "Halt Pay":                      "partyHaltPay",
  "Port Pass Expense":             "portPassExpense",
  "Mamol Expense":                 "mamolExpense",
  "Claimable Mamol Expense":       "claimableMamolExpense",
  "Crane Operator":                "craneOperatorExpense",
  "Parking":                       "parkingExpense",
  "Toll Charges":                  "tollCharges",
  "Other Expenses (Additional)":   "otherExpenses",
};

function getLinkedExpenseValue(linkedExpense: string | undefined, sheet: TripSheetData | undefined): string {
  if (!linkedExpense || !sheet) return "";
  const field = EXPENSE_TO_SHEET_FIELD[linkedExpense];
  if (!field) return "";
  const val = sheet[field];
  return typeof val === "string" ? val : "";
}

function shortContainerType(spec: string): string {
  if (spec === "20 FT CONTAINER") return "20 FT";
  if (spec === "40 FT CONTAINER") return "40 FT";
  if (spec === "2 X 20 FEET CONTAINERS") return "2X20 FT";
  if (spec === "OPEN LOAD CARGO") return "OPEN LOAD";
  return spec;
}

function buildNarration(containerNo: string, spec: string, origin: string, destination: string, scheduledDate: string): string {
  const dateFormatted = scheduledDate ? scheduledDate.split("-").reverse().join("-") : "";
  return [containerNo, shortContainerType(spec), origin, destination, dateFormatted]
    .map((v) => (v || "").trim())
    .join("/");
}

function resolveContainerNo(trip: Trip): string {
  if (trip.containerSpecification === "2 X 20 FEET CONTAINERS") {
    return [trip.containerNumber1, trip.containerNumber2].filter(Boolean).join(" / ");
  }
  if (trip.containerSpecification === "OPEN LOAD CARGO") return trip.cargoReference ?? "";
  return trip.containerNumber ?? "";
}

type TripLine = {
  tripDbId: string;
  trip: Trip;
  containerType: string;
  containerNo: string;
  consignee: string;
  modeOfShipment: string;
  cfs: string;
  shippingLine: string;
  vesselName: string;
  from: string;
  to: string;
  narration: string;
  services: ServiceLine[];
};

type SharedFields = {
  invoiceType: InvoiceType;
  invoiceDate: string;
  billTo: string;
  gstNumber: string;
  bankName: string;
  branchName: string;
  accountNumber: string;
  ifscCode: string;
  contactPerson: string;
  email: string;
  contact: string;
  gstApplicable: "Yes" | "No";
  igstApplicable: "Yes" | "No";
};

function buildTripLine(trip: Trip, sheet: TripSheetData | undefined, saved?: Record<string, unknown>): TripLine {
  const containerNo = resolveContainerNo(trip);
  const base: TripLine = {
    tripDbId: trip.id,
    trip,
    containerType: trip.containerSpecification ?? "",
    containerNo,
    consignee: trip.shipperConsignee ?? "",
    modeOfShipment: trip.cargoClassification ?? "",
    cfs: "",
    shippingLine: trip.shippingLine ?? "",
    vesselName: trip.vesselName ?? "",
    from: trip.origin ?? "",
    to: trip.destination ?? "",
    narration: buildNarration(containerNo, trip.containerSpecification, trip.origin ?? "", trip.destination ?? "", trip.scheduledDate ?? ""),
    services: [emptyService()],
  };
  if (!saved) return base;
  const s = (v: unknown) => (v != null ? String(v) : "");
  return {
    ...base,
    containerType: s(saved.container_type) || base.containerType,
    containerNo: s(saved.container_no) || base.containerNo,
    consignee: s(saved.consignee) || base.consignee,
    modeOfShipment: s(saved.mode_of_shipment) || base.modeOfShipment,
    cfs: s(saved.cfs),
    shippingLine: s(saved.shipping_line) || base.shippingLine,
    vesselName: s(saved.vessel_name) || base.vesselName,
    from: s(saved.origin) || base.from,
    to: s(saved.destination) || base.to,
    narration: s(saved.narration) || base.narration,
    services: Array.isArray(saved.services) && saved.services.length > 0
      ? (saved.services as ServiceLine[])
      : base.services,
  };
}

// The selected trips become ONE invoice. Numeric trip-sheet expense fields are summed
// across the trips, and hire is the sum of each trip's booking hire.
function aggregateSheets(trips: Trip[], sheets: Map<string, TripSheetData>): TripSheetData | undefined {
  if (trips.length === 0) return undefined;
  const base = { ...(sheets.get(trips[0].id) ?? {}) } as Record<string, unknown>;
  const sumFields = new Set(
    Object.values(EXPENSE_TO_SHEET_FIELD).filter((f): f is keyof TripSheetData => !!f && f !== "hireAmount"),
  );
  for (const field of sumFields) {
    base[field] = String(
      trips.reduce((sum, t) => sum + (parseFloat(String(sheets.get(t.id)?.[field] ?? "0"))  || 0), 0),
    );
  }
  base.hireAmount = String(trips.reduce((sum, t) => sum + (parseFloat(t.transportHireAmount ?? "0") || 0), 0));
  return base as unknown as TripSheetData;
}

// One invoice line for all the selected trips. Saved services win when present.
function buildCombinedLine(trips: Trip[], sheets: Map<string, TripSheetData>, savedInvoices?: Map<string, Record<string, unknown>>): TripLine {
  const line: TripLine = {
    ...buildTripLine(trips[0], sheets.get(trips[0].id), undefined),
    containerNo: Array.from(new Set(trips.map(resolveContainerNo).filter(Boolean))).join(" / "),
    from: Array.from(new Set(trips.map((t) => t.origin ?? "").filter(Boolean))).join(" / "),
    to: Array.from(new Set(trips.map((t) => t.destination ?? "").filter(Boolean))).join(" / "),
    narration: trips
      .map((t) => buildNarration(resolveContainerNo(t), t.containerSpecification, t.origin ?? "", t.destination ?? "", t.scheduledDate ?? ""))
      .join("; "),
    services: [emptyService()],
  };
  const saved = trips.map((t) => savedInvoices?.get(t.id)).find((s) => Array.isArray(s?.services) && (s!.services as unknown[]).length > 0);
  if (!saved) return line;
  const str = (v: unknown) => (v != null ? String(v) : "");
  return {
    ...line,
    containerType: str(saved.container_type) || line.containerType,
    containerNo: str(saved.container_no) || line.containerNo,
    consignee: str(saved.consignee) || line.consignee,
    modeOfShipment: str(saved.mode_of_shipment) || line.modeOfShipment,
    cfs: str(saved.cfs),
    shippingLine: str(saved.shipping_line) || line.shippingLine,
    vesselName: str(saved.vessel_name) || line.vesselName,
    from: str(saved.origin) || line.from,
    to: str(saved.destination) || line.to,
    narration: str(saved.narration) || line.narration,
    services: saved.services as ServiceLine[],
  };
}

// Edits saved with per-trip service lines (older combined invoices) keep the per-trip form.
function countSavedWithServices(trips: Trip[], savedInvoices?: Map<string, Record<string, unknown>>): number {
  return trips.filter((t) => {
    const s = savedInvoices?.get(t.id)?.services;
    return Array.isArray(s) && s.length > 0;
  }).length;
}

function buildSharedFields(trips: Trip[], customer: Customer | undefined, first?: Record<string, unknown>): SharedFields {
  const isSelf = trips[0]?.billTo === "SELF/CGI";
  const isGta = customer?.isGta === "Yes";
  const invoiceType: InvoiceType = isSelf ? "Transport Memo" : isGta ? "Bill of Supply" : "Tax Invoice";
  const base: SharedFields = {
    invoiceType,
    invoiceDate: todayIst(),
    billTo: isSelf ? "Canaan Global International, Puthukottai, Tuticorin, Tamil Nadu, India." : (customer?.name ?? trips[0]?.billTo ?? ""),
    gstNumber: isSelf ? "33AAJFC9781F1Z8" : (customer?.gstin ?? ""),
    bankName: "HDFC - 9181 - Shipping",
    branchName: "TUTICORIN",
    accountNumber: "50200037439181",
    ifscCode: "HDFC0001104",
    contactPerson: "S SUNDER",
    email: "tutfin@canaanglobal.com",
    contact: "9047015423",
    gstApplicable: invoiceType === "Tax Invoice" ? "Yes" : "No",
    igstApplicable: "No",
  };
  if (!first) return base;
  const s = (v: unknown, fallback: string) => (v != null && v !== "" ? String(v) : fallback);
  return {
    ...base,
    invoiceType: (first.invoice_type as InvoiceType) ?? base.invoiceType,
    invoiceDate: s(first.invoice_date, base.invoiceDate),
    billTo: s(first.bill_to, base.billTo),
    gstNumber: s(first.gst_number, base.gstNumber),
    bankName: s(first.bank_name, base.bankName),
    branchName: s(first.branch_name, base.branchName),
    accountNumber: s(first.account_number, base.accountNumber),
    ifscCode: s(first.ifsc_code, base.ifscCode),
    contactPerson: s(first.contact_person, base.contactPerson),
    email: s(first.email, base.email),
    contact: s(first.contact, base.contact),
    gstApplicable: (first.gst_applicable as "Yes" | "No") ?? base.gstApplicable,
    igstApplicable: (first.igst_applicable as "Yes" | "No") ?? base.igstApplicable,
  };
}

const roClass = "w-full rounded-lg border border-separator-border bg-fill-1 px-3 py-2 text-sm text-text-primary cursor-not-allowed";
const sh = "text-caption-1-semibold text-accent-text-strong bg-accent-surface px-3 py-2 rounded-lg";

type Props = {
  open: boolean;
  trips: Trip[];
  sheets: Map<string, TripSheetData>;
  customer: Customer | undefined;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  mode: "create" | "edit";
  savedInvoices?: Map<string, Record<string, unknown>>;
};

export function GenerateCombinedInvoiceDialog({
  open, trips, sheets, customer, onClose, onSubmit, mode, savedInvoices,
}: Props) {
  const [sacCodes, setSacCodes] = useState<SacCode[]>([]);
  const firstSaved = trips[0] ? savedInvoices?.get(trips[0].id) : undefined;

  const [shared, setShared] = useState<SharedFields>(() => buildSharedFields(trips, customer, firstSaved));
  const isConsolidated = mode === "create" || countSavedWithServices(trips, savedInvoices) <= 1;
  const combinedSheet = useMemo(() => aggregateSheets(trips, sheets), [trips, sheets]);
  const combinedHire = trips.reduce((sum, t) => sum + (parseFloat(t.transportHireAmount ?? "0") || 0), 0);
  const hireFor = (l: TripLine) => (isConsolidated ? combinedHire : Number(l.trip.transportHireAmount || 0));
  const [lines, setLines] = useState<TripLine[]>(() =>
    isConsolidated
      ? [buildCombinedLine(trips, sheets, savedInvoices)]
      : trips.map((t) => buildTripLine(t, sheets.get(t.id), savedInvoices?.get(t.id)))
  );
  const [saving, setSaving] = useState(false);
  const [taxWarning, setTaxWarning] = useState(false);
  const [showSacTableFor, setShowSacTableFor] = useState<number | null>(null);

  useEffect(() => { sacCodesApi.list().then(setSacCodes).catch(() => {}); }, []);

  // Once SAC codes load, back-fill sacId for any service that only has sacCode
  // stored (legacy-shaped saved data) — otherwise the combobox can't show the
  // currently-selected code as selected. Mirrors GenerateInvoiceDialog.
  useEffect(() => {
    if (!sacCodes.length) return;
    setLines((prev) => prev.map((l) => ({
      ...l,
      services: l.services.map((s) => {
        if (s.sacId || !s.sacCode) return s;
        const match =
          sacCodes.find((sc) => sc.code === s.sacCode && sc.description === s.descriptionOfService) ??
          sacCodes.find((sc) => sc.code === s.sacCode);
        return match ? { ...s, sacId: String(match.id) } : s;
      }),
    })));
  }, [sacCodes]);

  const [fetchedInvoiceNo, setFetchedInvoiceNo] = useState("");
  useEffect(() => {
    if (!open) return;
    if (mode === "edit") { setFetchedInvoiceNo(String(firstSaved?.invoice_no ?? "")); return; }
    setFetchedInvoiceNo("");
    tripsApi.getNextInvoiceNo(shared.invoiceType)
      .then((r) => setFetchedInvoiceNo(r.invoice_no))
      .catch(() => setFetchedInvoiceNo(""));
  }, [open, shared.invoiceType, mode]);

  const isSelf = trips[0]?.billTo === "SELF/CGI";
  const isBillOfSupplyLocked = !isSelf && (customer?.isGta === "Yes" || customer?.customerType === "Transports");
  const taxSelected = shared.gstApplicable === "Yes" || shared.igstApplicable === "Yes";
  const isIgst = shared.igstApplicable === "Yes";
  const isGst = shared.gstApplicable === "Yes";
  const originalBillTo = customer?.name ?? trips[0]?.billTo ?? "";
  const originalGstNumber = customer?.gstin ?? "";

  function updateShared<K extends keyof SharedFields>(key: K, value: SharedFields[K]) {
    setShared((prev) => ({ ...prev, [key]: value }));
  }

  function handleInvoiceTypeChange(type: InvoiceType) {
    if (type === "Tax Invoice" && !taxSelected) { setTaxWarning(true); return; }
    setTaxWarning(false);
    if (type === "Transport Memo") {
      setShared((prev) => ({
        ...prev, invoiceType: type,
        billTo: "Canaan Global International, Puthukottai, Tuticorin, Tamil Nadu, India.",
        gstNumber: "33AAJFC9781F1Z8", gstApplicable: "No", igstApplicable: "No",
      }));
    } else {
      setShared((prev) => ({
        ...prev, invoiceType: type,
        billTo: prev.invoiceType === "Transport Memo" ? originalBillTo : prev.billTo,
        gstNumber: prev.invoiceType === "Transport Memo" ? originalGstNumber : prev.gstNumber,
      }));
    }
  }

  function handleTaxToggle(key: "gstApplicable" | "igstApplicable", opt: "Yes" | "No") {
    setShared((prev) => {
      const other = key === "gstApplicable" ? "igstApplicable" : "gstApplicable";
      const next = { ...prev, [key]: opt };
      if (opt === "Yes") {
        next[other] = "No";
        next.invoiceType = "Tax Invoice";
        setTaxWarning(false);
        setLines((ls) => ls.map((l) => ({
          ...l, services: l.services.map((sv) => (sv.gstRate ? sv : { ...sv, gstRate: "18" })),
        })));
      } else if (prev[other] !== "Yes") {
        next.invoiceType = "Bill of Supply";
      }
      return next;
    });
  }

  function updateLine<K extends keyof TripLine>(idx: number, key: K, value: TripLine[K]) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
  }

  function updateService(lineIdx: number, svcIdx: number, key: keyof ServiceLine, value: string) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== lineIdx) return l;
      const services = l.services.map((sv, j) => {
        if (j !== svcIdx) return sv;
        const updated = { ...sv, [key]: value };
        if (key === "sacCode") {
          const match = sacCodes.find((sc) => sc.code === value);
          updated.gstRate = match ? (parseFloat(match.gstRate) > 0 ? match.gstRate : "") : "";
        }
        return updated;
      });
      return { ...l, services };
    }));
  }

  function handleSacChange(lineIdx: number, svcIdx: number, sacId: string) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== lineIdx) return l;
      const services = l.services.map((sv, j) => {
        if (j !== svcIdx) return sv;
        const match = sacCodes.find((sc) => String(sc.id) === sacId);
        if (match) {
          return {
            ...sv, sacId, sacCode: match.code,
            gstRate: parseFloat(match.gstRate) > 0 ? match.gstRate : "",
            descriptionOfService: match.description || sv.descriptionOfService,
          };
        }
        return { ...sv, sacId, sacCode: sacId };
      });
      return { ...l, services };
    }));
  }

  function addService(lineIdx: number) {
    setLines((prev) => prev.map((l, i) => (i === lineIdx ? { ...l, services: [...l.services, emptyService()] } : l)));
  }

  // Insert a service line picked from the SAC Code Table into a specific trip's
  // services — fills an untouched blank line (e.g. the default Service 1) if one
  // exists, otherwise appends.
  function addOrFillService(lineIdx: number, line: ServiceLine) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== lineIdx) return l;
      const idx = l.services.findIndex(isBlankService);
      const services = idx >= 0
        ? l.services.map((s, j) => (j === idx ? line : s))
        : [...l.services, line];
      return { ...l, services };
    }));
  }

  function removeService(lineIdx: number, svcIdx: number) {
    setLines((prev) => prev.map((l, i) => (i === lineIdx ? { ...l, services: l.services.filter((_, j) => j !== svcIdx) } : l)));
  }

  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtWhole = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  const lineCalcs = useMemo(() => lines.map((l) => {
    const svcCalcs = l.services.map((sv) => {
      const subtotal = (parseFloat(sv.quantity) || 0) * (parseFloat(sv.rate) || 0);
      const rate = parseFloat(sv.gstRate) || 0;
      const gstAmount = parseFloat((subtotal * (rate / 100)).toFixed(2));
      return { subtotal, gstAmount };
    });
    const subtotal = svcCalcs.reduce((sum, c) => sum + c.subtotal, 0);
    const gst = svcCalcs.reduce((sum, c) => sum + c.gstAmount, 0);
    return { svcCalcs, subtotal, gst, lineTotal: subtotal + gst };
  }), [lines]);

  const grandSubtotal = useMemo(() => lineCalcs.reduce((sum, c) => sum + c.subtotal, 0), [lineCalcs]);
  const grandGst = useMemo(() => lineCalcs.reduce((sum, c) => sum + c.gst, 0), [lineCalcs]);
  const grandTotal = useMemo(() => grandSubtotal + grandGst, [grandSubtotal, grandGst]);

  // Party (customer-caused) halt on these trips that no invoice line bills yet.
  const partyHaltTrips = trips
    .map((t) => ({ tripId: t.tripId, amount: Number(sheets.get(t.id)?.partyHaltPay || 0) }))
    .filter((t) => t.amount > 0);
  const partyHaltOwed = partyHaltTrips.reduce((sum, t) => sum + t.amount, 0);
  const haltOnInvoice = lines.reduce((sum, l) => sum + haltBilledOn(l.services, sacCodes), 0);
  const grandTotalRounded = useMemo(() => roundGrandTotal(grandTotal), [grandTotal]);
  const amountInWords = useMemo(() => amountToWords(String(grandTotalRounded)), [grandTotalRounded]);

  // One payload entry per trip. The consolidated lines sit on the first trip; the others carry
  // the same shared details and no services, so totals are never counted twice.
  function consolidatedPayloadLines() {
    const master = lines[0];
    return trips.map((t, i) => ({
      trip_id: parseInt(t.id, 10),
      mode_of_shipment: master.modeOfShipment,
      container_type: master.containerType,
      cfs: master.cfs,
      shipping_line: master.shippingLine,
      vessel_name: master.vesselName,
      origin: master.from,
      destination: master.to,
      container_no: master.containerNo,
      consignee: master.consignee,
      services: i === 0 ? master.services : [],
      narration: i === 0 ? master.narration : "",
    }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        invoice_date: shared.invoiceDate || null,
        invoice_type: shared.invoiceType,
        bill_to: shared.billTo,
        gst_number: shared.gstNumber,
        bank_name: shared.bankName,
        branch_name: shared.branchName,
        account_number: shared.accountNumber,
        ifsc_code: shared.ifscCode,
        contact_person: shared.contactPerson,
        email: shared.email,
        contact: shared.contact,
        gst_applicable: shared.gstApplicable,
        igst_applicable: shared.igstApplicable,
        trips: isConsolidated ? consolidatedPayloadLines() : lines.map((l) => ({
          trip_id: parseInt(l.tripDbId, 10),
          mode_of_shipment: l.modeOfShipment,
          container_type: l.containerType,
          cfs: l.cfs,
          shipping_line: l.shippingLine,
          vessel_name: l.vesselName,
          origin: l.from,
          destination: l.to,
          container_no: l.containerNo,
          consignee: l.consignee,
          services: l.services,
          narration: l.narration,
        })),
      };
      await onSubmit(payload);
    } finally {
      setSaving(false);
    }
  }

  if (!open || trips.length === 0) return null;

  return (
    <>
    <Dialog open={open} onClose={onClose} title={`${mode === "edit" ? "Edit" : "Generate"} Combined Invoice — ${trips.length} Trips`} className="max-w-6xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        <div className="rounded-lg border border-purple-border bg-purple-surface px-4 py-2.5 text-xs text-purple-text">
          This single invoice covers <strong>{trips.length} trips</strong> for <strong>{customer?.name ?? "this customer"}</strong>:
          {" "}{trips.map((t) => t.tripId).join(", ")}. Header details (invoice type, tax, bank, contact) apply to the whole
          document — each trip keeps its own route, container and service lines below.
        </div>

        {/* Invoice Type + Tax Details */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <section className="flex flex-col gap-5">
            <p className={sh}>Invoice Type</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {INVOICE_TYPES.map((type) => {
                const lockedBos = isBillOfSupplyLocked && type !== "Bill of Supply";
                const blocked = !isSelf && !isBillOfSupplyLocked && type === "Tax Invoice" && !taxSelected;
                const disabled = lockedBos || blocked;
                return (
                  <button
                    key={type} type="button" disabled={disabled}
                    onClick={() => !disabled && handleInvoiceTypeChange(type)}
                    className={[
                      "rounded-xl border-2 px-4 py-3 text-body-semibold transition",
                      shared.invoiceType === type
                        ? "border-accent-solid bg-accent-surface text-accent-text shadow-sm"
                        : disabled
                        ? "border-separator-border bg-fill-1 text-text-tertiary cursor-not-allowed"
                        : "border-separator-border bg-background-primary-default text-text-secondary hover:border-border-button-default hover:bg-fill-2",
                    ].join(" ")}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
            {!isSelf && !isBillOfSupplyLocked && taxWarning && (
              <p className="text-caption-1-medium text-warning-text">Please select GST or IGST in Tax Details before choosing Tax Invoice.</p>
            )}
          </section>

          <section className="flex flex-col gap-5">
            <p className={sh}>Tax Details</p>
            <div className="flex flex-col gap-3">
              {(["gstApplicable", "igstApplicable"] as const).map((key) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <span className="text-caption-1-medium text-text-secondary">
                    {key === "gstApplicable" ? "GST Applicable? (CGST 9% + SGST 9%)" : "IGST Applicable? (18%)"}
                  </span>
                  <div className="flex gap-2">
                    {(["Yes", "No"] as const).map((opt) => {
                      const lockedByself = isSelf && opt === "Yes";
                      return (
                        <button
                          key={opt} type="button" disabled={lockedByself}
                          onClick={() => !lockedByself && handleTaxToggle(key, opt)}
                          className={[
                            "flex-1 rounded-lg border-2 py-2 text-body-semibold transition",
                            lockedByself
                              ? "border-separator-border bg-fill-1 text-text-tertiary cursor-not-allowed"
                              : shared[key] === opt
                              ? "border-accent-solid bg-accent-surface text-accent-text"
                              : "border-separator-border bg-background-primary-default text-text-secondary hover:border-border-button-default",
                          ].join(" ")}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Invoice + Customer details */}
        <section className="flex flex-col gap-5">
          <p className={sh}>Invoice Details</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Invoice No">
              <input readOnly disabled value={fetchedInvoiceNo} className={roClass} placeholder={open ? "Fetching next number…" : ""} />
            </Field>
            <Field label="Invoice Date">
              <input readOnly disabled value={shared.invoiceDate} className={roClass} />
            </Field>
            <Field label="Bill To">
              <input readOnly disabled value={shared.billTo} className={roClass} />
            </Field>
            <Field label="GST Number">
              <input value={shared.gstNumber} onChange={(e) => updateShared("gstNumber", e.target.value.toUpperCase())} className={inputClass} placeholder="e.g. 33AABCU9603R1ZT" />
            </Field>
          </div>
        </section>

        {/* Per-trip sections */}
        {lines.map((line, li) => {
          const calc = lineCalcs[li];
          return (
            <section key={line.tripDbId} className="flex flex-col gap-4 rounded-xl border-2 border-separator-border bg-fill-1 p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className={sh}>
                  {isConsolidated
                    ? `Combined invoice — ${trips.length} trip${trips.length !== 1 ? "s" : ""}: ${trips.map((t) => t.tripId).join(", ")}`
                    : `Trip ${li + 1} of ${lines.length} — ${line.trip.tripId}`}
                </p>
                <div className="flex items-center gap-2">
                  {hireFor(line) > 0 && (
                    <span className="flex items-center gap-1.5 rounded-full border border-accent-border bg-accent-surface px-3 py-1 text-caption-1-semibold text-accent-text">
                      {isConsolidated ? "Total Hire Amount" : "Trip Hire Amount"} &nbsp;·&nbsp; ₹{hireFor(line).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSacTableFor(li)}
                    className="flex items-center gap-1.5 rounded-lg border border-separator-border bg-background-primary-default px-3 py-1.5 text-caption-1-semibold text-text-secondary shadow-sm hover:border-accent-border-strong hover:bg-accent-surface-strong hover:text-accent-text transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    View SAC Code Table
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Container Type"><input readOnly disabled value={line.containerType} className={roClass} /></Field>
                <Field label="Container No"><input readOnly disabled value={line.containerNo} className={roClass} /></Field>
                <Field label="Consignee"><input readOnly disabled value={line.consignee} className={roClass} /></Field>
                <Field label="From"><input readOnly disabled value={line.from} className={roClass} /></Field>
                <Field label="To"><input readOnly disabled value={line.to} className={roClass} /></Field>
                <Field label="Mode of Shipment"><input readOnly disabled value={line.modeOfShipment} className={roClass} /></Field>
              </div>

              <div className="flex flex-col gap-3">
                {line.services.map((svc, si) => {
                  const svcCalc = calc.svcCalcs[si];
                  return (
                    <div key={si} className="relative flex flex-col gap-3 rounded-lg border border-separator-border bg-background-primary-default p-3">
                      {line.services.length > 1 && (
                        <button type="button" onClick={() => removeService(li, si)} className="absolute right-3 top-3 text-caption-1-semibold text-danger-text hover:text-danger-text">
                          Remove
                        </button>
                      )}
                      <span className="text-caption-1-semibold text-text-tertiary">Service {si + 1}</span>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Description of Service" className="sm:col-span-2">
                          <input value={svc.descriptionOfService} onChange={(e) => updateService(li, si, "descriptionOfService", e.target.value)} className={inputClass} placeholder="e.g. Transportation of cargo" />
                        </Field>
                        <Field label="SAC Code">
                          <GlassCombobox
                            value={svc.sacId}
                            onChange={(val) => handleSacChange(li, si, val)}
                            options={sacCodes.map((sc) => ({ value: String(sc.id), label: `${sc.code} — ${sc.description}` }))}
                            placeholder="Select or type SAC code"
                          />
                        </Field>
                        <Field label={`GST Rate (%)${taxSelected ? ` — ${isIgst ? "IGST" : "GST"}` : ""}`}>
                          <div className="relative">
                            <input type="number" min="0" max="100" step="0.01" value={svc.gstRate}
                              onChange={(e) => updateService(li, si, "gstRate", e.target.value)}
                              onWheel={(e) => e.currentTarget.blur()} className={`${inputClass} pr-8`} placeholder="e.g. 18" />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">%</span>
                          </div>
                        </Field>
                        <Field label="Quantity">
                          <DecimalInput type="number" min="0" step="any" value={svc.quantity}
                            onChange={(e) => updateService(li, si, "quantity", e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()} className={inputClass} placeholder="e.g. 1" />
                        </Field>
                        <Field label="Rate (INR)">
                          <DecimalInput type="number" min="0" step="0.01" value={svc.rate}
                            onChange={(e) => updateService(li, si, "rate", e.target.value)}
                            onWheel={(e) => e.currentTarget.blur()} className={inputClass} placeholder="e.g. 32000" />
                        </Field>
                      </div>
                      {svcCalc.subtotal > 0 && (
                        <div className="mt-1 flex flex-wrap gap-3 border-t border-separator-border pt-2 text-xs text-text-secondary">
                          <span>Subtotal: <strong className="text-text-primary">₹{fmt(svcCalc.subtotal)}</strong></span>
                          {svcCalc.gstAmount > 0 && <span>{isIgst ? "IGST" : "GST"}: <strong className="text-warning-text">+₹{fmt(svcCalc.gstAmount)}</strong></span>}
                        </div>
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={() => addService(li)} className="self-start rounded-lg border border-accent-border-strong px-3 py-1.5 text-caption-1-semibold text-accent-text hover:bg-accent-surface-strong">
                  + Add Service
                </button>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-success-border bg-success-surface px-3 py-2">
                <span className="text-caption-1-semibold text-success-text">Trip Sub Total</span>
                <span className="text-body-semibold text-success-text">₹{fmt(calc.lineTotal)}</span>
              </div>

              <Field label="Narration">
                <textarea rows={2} value={line.narration} onChange={(e) => updateLine(li, "narration", e.target.value)} className={inputClass} />
              </Field>
            </section>
          );
        })}

        {/* Grand total */}
        <section className="flex flex-col gap-5">
          <p className={sh}>Amount Details</p>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-lg border border-separator-border bg-fill-1 px-4 py-2.5">
              <span className="text-sm text-text-secondary">Subtotal — all {lines.length} trips (before GST)</span>
              <span className="text-body-semibold text-text-primary">₹{fmt(grandSubtotal)}</span>
            </div>
            {isGst && grandGst > 0 && (
              <>
                <div className="flex items-center justify-between rounded-lg border border-warning-border bg-warning-surface px-4 py-2.5">
                  <span className="text-sm text-warning-text">CGST (9%)</span>
                  <span className="text-body-semibold text-warning-text">+ ₹{fmt(grandGst / 2)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-warning-border bg-warning-surface px-4 py-2.5">
                  <span className="text-sm text-warning-text">SGST (9%)</span>
                  <span className="text-body-semibold text-warning-text">+ ₹{fmt(grandGst / 2)}</span>
                </div>
              </>
            )}
            {isIgst && grandGst > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-warning-border bg-warning-surface px-4 py-2.5">
                <span className="text-sm text-warning-text">IGST (18%)</span>
                <span className="text-body-semibold text-warning-text">+ ₹{fmt(grandGst)}</span>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border border-success-border bg-success-surface px-4 py-3">
              <span className="text-body-semibold text-text-primary">Grand Total ({lines.length} trips)</span>
              <span className="text-title-3-semibold text-success-text">₹{grandTotalRounded > 0 ? fmtWhole(grandTotalRounded) : "0"}</span>
            </div>
            <Field label="Amount in Words">
              <input readOnly disabled value={amountInWords} className={roClass} />
            </Field>
          </div>
        </section>

        {/* Bank Details */}
        <section className="flex flex-col gap-5">
          <p className={sh}>Bank Details</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Bank Name"><input value={shared.bankName} onChange={(e) => updateShared("bankName", e.target.value)} className={inputClass} /></Field>
            <Field label="Branch Name"><input value={shared.branchName} onChange={(e) => updateShared("branchName", e.target.value)} className={inputClass} /></Field>
            <Field label="Account Number"><input value={shared.accountNumber} onChange={(e) => updateShared("accountNumber", e.target.value)} className={inputClass} /></Field>
            <Field label="IFSC Code"><input value={shared.ifscCode} onChange={(e) => updateShared("ifscCode", e.target.value.toUpperCase())} className={inputClass} /></Field>
          </div>
        </section>

        {/* Contact Details */}
        <section className="flex flex-col gap-5">
          <p className={sh}>Contact Details</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field label="Contact Person"><input value={shared.contactPerson} onChange={(e) => updateShared("contactPerson", e.target.value)} className={inputClass} /></Field>
            <Field label="Email"><input type="email" value={shared.email} onChange={(e) => updateShared("email", e.target.value)} className={inputClassLower} /></Field>
            <Field label="Contact"><input value={shared.contact} onChange={(e) => updateShared("contact", e.target.value)} className={inputClass} /></Field>
          </div>
        </section>

        {/* Party halt not on the invoice — the customer owes it, and the driver is paid it. */}
        {partyHaltOwed > 0 && haltOnInvoice <= 0 && (
          <div className="rounded-xl border border-warning-border-strong bg-warning-surface px-4 py-3 text-sm text-warning-text-strong">
            <span className="font-semibold">₹{partyHaltOwed.toLocaleString("en-IN")} party halt</span> on{" "}
            {partyHaltTrips.map((t) => t.tripId).join(", ")}, but the invoice has no halting charges. Add a halting
            charges line so the customer is billed.
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-separator-border pt-4">
          <div className="text-sm text-text-secondary">
            {lines.length} trips &nbsp;·&nbsp; Grand Total: <span className="font-semibold text-success-text">₹{grandTotalRounded > 0 ? fmtWhole(grandTotalRounded) : "0"}</span>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-secondary hover:bg-fill-2 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || (mode === "create" && !fetchedInvoiceNo) || (mode === "create" && grandTotal === 0)}
              title={mode === "create" && grandTotal === 0 ? "Grand Total is ₹0 — enter at least one service amount before generating" : undefined}
              className="rounded-lg bg-purple-solid px-5 py-2 text-body-semibold text-on-solid hover:bg-purple-solid-hover disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? (mode === "edit" ? "Saving…" : "Generating…") : (mode === "create" && !fetchedInvoiceNo) ? "Fetching No…" : (mode === "create" && grandTotal === 0) ? "Enter Amounts First" : (mode === "edit" ? "Save Changes" : "Generate Combined Invoice")}
            </button>
          </div>
        </div>
      </form>
    </Dialog>

    {/* SAC Code Table Modal — scoped to whichever trip section opened it */}
    <Dialog open={showSacTableFor !== null} onClose={() => setShowSacTableFor(null)} title="SAC Code Reference Table" className="max-w-3xl">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-secondary">
          {sacCodes.length} codes available · Click <span className="font-semibold text-accent-text">+ Add</span> to insert a service line
          {showSacTableFor !== null && lines[showSacTableFor] ? <> into <strong>{lines[showSacTableFor].trip.tripId}</strong></> : null} pre-filled with that code.
        </p>
        <div className="overflow-auto rounded-xl border border-separator-border shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-accent-solid text-on-solid">
                <th className="px-4 py-2.5 text-left text-caption-1-semibold">Description of Service</th>
                <th className="px-4 py-2.5 text-center text-caption-1-semibold w-28">SAC Code</th>
                <th className="px-4 py-2.5 text-center text-caption-1-semibold w-20">GST (%)</th>
                <th className="px-4 py-2.5 text-left text-caption-1-semibold w-48">Retrieves From</th>
                <th className="px-4 py-2.5 text-center text-caption-1-semibold w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator-border">
              {sacCodes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-tertiary">Loading SAC codes…</td>
                </tr>
              ) : (
                sacCodes.map((sc, i) => {
                  const activeLine = showSacTableFor !== null ? lines[showSacTableFor] : undefined;
                  const linkedVal = activeLine ? getLinkedExpenseValue(sc.linkedExpense, isConsolidated ? combinedSheet : sheets.get(activeLine.trip.id)) : "";
                  const hasValue = linkedVal && parseFloat(linkedVal) > 0;
                  const scHasGst = parseFloat(sc.gstRate) > 0;
                  const blockedForTm = shared.invoiceType === "Transport Memo" && scHasGst;
                  return (
                    <tr key={sc.id} className={`transition-colors ${blockedForTm ? "opacity-50" : i % 2 === 0 ? "bg-background-primary-default hover:bg-accent-surface-strong/50" : "bg-fill-1 hover:bg-accent-surface-strong/50"}`}>
                      <td className="px-4 py-2.5 text-text-primary whitespace-normal break-words">{sc.description}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-caption-1-semibold text-accent-text">{sc.code}</td>
                      <td className="px-4 py-2.5 text-center">
                        {scHasGst ? (
                          <span className="inline-flex items-center rounded-full bg-warning-surface border border-warning-border px-2 py-0.5 text-caption-1-semibold text-warning-text">
                            {sc.gstRate}%
                          </span>
                        ) : (
                          <span className="text-xs text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {sc.linkedExpense ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-caption-1-medium text-purple-text leading-tight">{sc.linkedExpense}</span>
                            {hasValue ? (
                              <span className="text-caption-1-semibold text-success-text">
                                ₹{parseFloat(linkedVal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="text-xs text-text-tertiary">No data on sheet</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {blockedForTm ? (
                          <span
                            title="Transport Memo is strictly no-GST — this SAC code carries a GST rate"
                            className="inline-flex items-center gap-1 rounded-lg border border-separator-border bg-fill-1 px-2.5 py-1 text-caption-1-semibold text-text-tertiary cursor-not-allowed"
                          >
                            No GST
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (showSacTableFor === null) return;
                              addOrFillService(showSacTableFor, {
                                ...emptyService(),
                                descriptionOfService: sc.description,
                                sacCode: sc.code,
                                sacId: String(sc.id),
                                gstRate: parseFloat(sc.gstRate) > 0 ? sc.gstRate : "",
                                quantity: "1",
                                rate: hasValue ? linkedVal : "",
                              });
                              setShowSacTableFor(null);
                            }}
                            className="flex items-center gap-1 rounded-lg border border-accent-border bg-accent-surface px-2.5 py-1 text-caption-1-semibold text-accent-text hover:bg-accent-solid-hover hover:text-on-solid hover:border-accent-solid transition duration-150"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Add
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => setShowSacTableFor(null)}
            className="rounded-lg border border-separator-border bg-background-primary-default px-5 py-2 text-body-semibold text-text-secondary hover:bg-fill-2 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Dialog>
    </>
  );
}
