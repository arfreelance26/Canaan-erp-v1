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

const emptyService = (): ServiceLine => ({
  descriptionOfService: "", sacCode: "", sacId: "", gstRate: "", quantity: "", rate: "",
});

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

const roClass = "w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-not-allowed";
const sh = "text-xs font-semibold uppercase tracking-wider text-blue-900 bg-blue-50 px-3 py-2 rounded-lg";

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
  const [lines, setLines] = useState<TripLine[]>(() =>
    trips.map((t) => buildTripLine(t, sheets.get(t.id), savedInvoices?.get(t.id)))
  );
  const [saving, setSaving] = useState(false);
  const [taxWarning, setTaxWarning] = useState(false);

  useEffect(() => { sacCodesApi.list().then(setSacCodes).catch(() => {}); }, []);

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
  const grandTotalRounded = useMemo(() => roundGrandTotal(grandTotal), [grandTotal]);
  const amountInWords = useMemo(() => amountToWords(String(grandTotalRounded)), [grandTotalRounded]);

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
        trips: lines.map((l) => ({
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
    <Dialog open={open} onClose={onClose} title={`${mode === "edit" ? "Edit" : "Generate"} Combined Invoice — ${trips.length} Trips`} className="max-w-6xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs text-indigo-700">
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
                      "rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all",
                      shared.invoiceType === type
                        ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
                        : disabled
                        ? "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
            {!isSelf && !isBillOfSupplyLocked && taxWarning && (
              <p className="text-xs font-medium text-amber-600">Please select GST or IGST in Tax Details before choosing Tax Invoice.</p>
            )}
          </section>

          <section className="flex flex-col gap-5">
            <p className={sh}>Tax Details</p>
            <div className="flex flex-col gap-3">
              {(["gstApplicable", "igstApplicable"] as const).map((key) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-600">
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
                            "flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-all",
                            lockedByself
                              ? "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
                              : shared[key] === opt
                              ? "border-blue-600 bg-blue-50 text-blue-700"
                              : "border-gray-200 bg-white text-gray-500 hover:border-gray-300",
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
            <section key={line.tripDbId} className="flex flex-col gap-4 rounded-xl border-2 border-gray-200 bg-gray-50/60 p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className={sh}>Trip {li + 1} of {lines.length} — {line.trip.tripId}</p>
                {line.trip.transportHireAmount && Number(line.trip.transportHireAmount) > 0 && (
                  <span className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Trip Hire Amount &nbsp;·&nbsp; ₹{Number(line.trip.transportHireAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                )}
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
                    <div key={si} className="relative flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3">
                      {line.services.length > 1 && (
                        <button type="button" onClick={() => removeService(li, si)} className="absolute right-3 top-3 text-xs font-semibold text-red-500 hover:text-red-700">
                          Remove
                        </button>
                      )}
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Service {si + 1}</span>
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
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
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
                        <div className="mt-1 flex flex-wrap gap-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
                          <span>Subtotal: <strong className="text-gray-700">₹{fmt(svcCalc.subtotal)}</strong></span>
                          {svcCalc.gstAmount > 0 && <span>{isIgst ? "IGST" : "GST"}: <strong className="text-amber-700">+₹{fmt(svcCalc.gstAmount)}</strong></span>}
                        </div>
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={() => addService(li)} className="self-start rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50">
                  + Add Service
                </button>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <span className="text-xs font-semibold text-emerald-700">Trip Sub Total</span>
                <span className="text-sm font-bold text-emerald-700">₹{fmt(calc.lineTotal)}</span>
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
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
              <span className="text-sm text-gray-600">Subtotal — all {lines.length} trips (before GST)</span>
              <span className="text-sm font-semibold text-gray-800">₹{fmt(grandSubtotal)}</span>
            </div>
            {isGst && grandGst > 0 && (
              <>
                <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5">
                  <span className="text-sm text-amber-700">CGST (9%)</span>
                  <span className="text-sm font-semibold text-amber-700">+ ₹{fmt(grandGst / 2)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5">
                  <span className="text-sm text-amber-700">SGST (9%)</span>
                  <span className="text-sm font-semibold text-amber-700">+ ₹{fmt(grandGst / 2)}</span>
                </div>
              </>
            )}
            {isIgst && grandGst > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5">
                <span className="text-sm text-amber-700">IGST (18%)</span>
                <span className="text-sm font-semibold text-amber-700">+ ₹{fmt(grandGst)}</span>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="text-sm font-semibold text-gray-700">Grand Total ({lines.length} trips)</span>
              <span className="text-lg font-bold text-emerald-700">₹{grandTotalRounded > 0 ? fmtWhole(grandTotalRounded) : "0"}</span>
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

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <div className="text-sm text-gray-500">
            {lines.length} trips &nbsp;·&nbsp; Grand Total: <span className="font-semibold text-emerald-700">₹{grandTotalRounded > 0 ? fmtWhole(grandTotalRounded) : "0"}</span>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || (mode === "create" && !fetchedInvoiceNo) || (mode === "create" && grandTotal === 0)}
              title={mode === "create" && grandTotal === 0 ? "Grand Total is ₹0 — enter at least one service amount before generating" : undefined}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? (mode === "edit" ? "Saving…" : "Generating…") : (mode === "create" && !fetchedInvoiceNo) ? "Fetching No…" : (mode === "create" && grandTotal === 0) ? "Enter Amounts First" : (mode === "edit" ? "Save Changes" : "Generate Combined Invoice")}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
