"use client";

import { useState, useMemo, useEffect, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass, inputClassLower } from "@/components/ui/Field";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripClosureData } from "@/types/trip-closure";
import type { SacCode } from "@/types/sac-code";
import { sacCodesApi, tripsApi } from "@/lib/api";
import { todayIst } from "@/lib/format-date";
import { useFormDraft, clearFormDraft } from "@/hooks/useFormDraft";

export const INVOICE_TYPES = ["Bill of Supply", "Transport Memo", "Tax Invoice"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export type ServiceLine = {
  descriptionOfService: string;
  sacCode: string;
  sacId: string;   // unique ID of the selected SAC record (disambiguates duplicate codes)
  gstRate: string;
  quantity: string;
  rate: string;
};

export type InvoiceFormData = {
  invoiceNo: string;
  invoiceDate: string;
  bookingReferenceNo: string;
  tripSheetNo: string;
  billTo: string;
  gstNumber: string;
  modeOfShipment: string;
  containerType: string;
  cfs: string;
  shippingLine: string;
  vesselName: string;
  from: string;
  to: string;
  containerNo: string;
  consignee: string;
  services: ServiceLine[];
  bankName: string;
  branchName: string;
  accountNumber: string;
  ifscCode: string;
  contactPerson: string;
  email: string;
  contact: string;
  narration: string;
  invoiceType: InvoiceType;
  gstApplicable: "Yes" | "No";
  igstApplicable: "Yes" | "No";
};

function numberToWords(amount: number): string {
  if (!amount || isNaN(amount)) return "";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function inWords(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + inWords(n % 100) : "");
  }
  const intPart = Math.floor(amount);
  const paise = Math.round((amount - intPart) * 100);
  const crore = Math.floor(intPart / 10000000);
  const lakh = Math.floor((intPart % 10000000) / 100000);
  const thousand = Math.floor((intPart % 100000) / 1000);
  const rest = intPart % 1000;
  const parts: string[] = [];
  if (crore) parts.push(inWords(crore) + " Crore");
  if (lakh) parts.push(inWords(lakh) + " Lakh");
  if (thousand) parts.push(inWords(thousand) + " Thousand");
  if (rest) parts.push(inWords(rest));
  let result = "Rupees " + (parts.join(" ") || "Zero");
  if (paise) result += " and " + inWords(paise) + " Paise";
  return result + " Only";
}

const emptyService = (): ServiceLine => ({
  descriptionOfService: "", sacCode: "", sacId: "", gstRate: "", quantity: "", rate: "",
});

// A service line the user hasn't touched yet — used so newly added SAC/hint lines
// fill the empty default line (Service 1) instead of appending an empty Service 1.
const isBlankService = (s: ServiceLine): boolean =>
  !s.descriptionOfService.trim() && !s.sacCode.trim() &&
  !s.gstRate.trim() && !s.quantity.trim() && !s.rate.trim();

function emptyForm(): InvoiceFormData {
  return {
    invoiceNo: "", invoiceDate: "", bookingReferenceNo: "", tripSheetNo: "",
    billTo: "", gstNumber: "", modeOfShipment: "", containerType: "",
    cfs: "", shippingLine: "", vesselName: "", from: "", to: "",
    containerNo: "", consignee: "", services: [emptyService()], bankName: "", branchName: "",
    accountNumber: "", ifscCode: "", contactPerson: "", email: "",
    contact: "", narration: "", invoiceType: "Bill of Supply",
    gstApplicable: "No", igstApplicable: "No",
  };
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
    .map((v) => v.trim())
    .join("/");
}

const roClass = "w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 cursor-not-allowed";
const sh = "text-xs font-semibold uppercase tracking-wider text-blue-900 bg-blue-50 px-3 py-2 rounded-lg";

import type { TripSheetData } from "@/types/trip-sheet";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { INVOICE_HINTS_KEY, type InvoiceHint } from "@/components/trips/VerifyTripDialog";

// Maps each admin-configured expense heading → the TripSheet field that holds its value
const EXPENSE_TO_SHEET_FIELD: Partial<Record<string, keyof TripSheetData>> = {
  "Hire Amount":                   "hireAmount",
  "Lift On / Off (லிப்டான்)":    "liftOnOffExpense",
  "Weight Sheet Expense":          "weightSheetExpense",
  "Halt Pay":                      "haltPay",
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

type Props = {
  open: boolean;
  trip: Trip | null;
  closure: TripClosureData | undefined;
  sheet: TripSheetData | undefined;
  driver: Driver | undefined;
  truck: Truck | undefined;
  customer: Customer | undefined;
  onClose: () => void;
  onSubmit: (data: InvoiceFormData, invoiceType: InvoiceType) => Promise<void>;
  savedInvoice?: Partial<InvoiceFormData>;
};

export function GenerateInvoiceDialog({ open, trip, closure, sheet, customer, truck, onClose, onSubmit, savedInvoice }: Props) {
  const [sacCodes, setSacCodes] = useState<SacCode[]>([]);
  const [invoiceHints, setInvoiceHints] = useState<InvoiceHint[]>([]);
  const [showSacTable, setShowSacTable] = useState(false);
  const [form, setForm] = useState<InvoiceFormData>(() => {
    if (!trip) return emptyForm();

    const containerNo =
      trip.containerSpecification === "2 X 20 FEET CONTAINERS"
        ? [trip.containerNumber1, trip.containerNumber2].filter(Boolean).join(" / ")
        : trip.containerSpecification === "OPEN LOAD CARGO"
        ? trip.cargoReference ?? ""
        : trip.containerNumber ?? "";

    const billToVal = customer?.name ?? trip.billTo ?? "";
    const isSelf = trip.billTo === "SELF/CGI";
    const isGta = customer?.isGta === "Yes";
    const invoiceType = isSelf ? "Transport Memo" : isGta ? "Bill of Supply" : "Tax Invoice";

    const base: InvoiceFormData = {
      ...emptyForm(),
      invoiceDate: todayIst(),
      bookingReferenceNo: trip.bookingReferenceNo ?? "",
      tripSheetNo: sheet?.tripSheetNo ?? "",
      billTo: isSelf ? "Canaan Global International, Puthukottai, Tuticorin, Tamil Nadu, India." : billToVal,
      gstNumber: isSelf ? "33AAJFC9781F1Z8" : (customer?.gstin ?? ""),
      containerType: trip.containerSpecification ?? "",
      shippingLine: trip.shippingLine ?? "",
      vesselName: trip.vesselName ?? "",
      from: trip.origin ?? "",
      to: trip.destination ?? "",
      containerNo,
      consignee: trip.shipperConsignee ?? "",
      modeOfShipment: trip.cargoClassification ?? "",
      bankName: "HDFC - 9181 - Shipping",
      branchName: "TUTICORIN",
      accountNumber: "50200037439181",
      ifscCode: "HDFC0001104",
      contactPerson: "S SUNDER",
      email: "tutfin@canaanglobal.com",
      contact: "9047015423",
      narration: buildNarration(containerNo, trip.containerSpecification, trip.origin ?? "", trip.destination ?? "", trip.scheduledDate ?? ""),
      invoiceType,
      services: [emptyService()],
      gstApplicable: invoiceType === "Tax Invoice" ? "Yes" : "No",
      igstApplicable: "No"
    };

    if (!savedInvoice) return base;
    return {
      ...base,
      ...savedInvoice,
      services: savedInvoice.services ?? base.services,
      bookingReferenceNo: base.bookingReferenceNo,
      tripSheetNo: base.tripSheetNo,
    };
  });
  const [saving, setSaving] = useState(false);
  const [taxWarning, setTaxWarning] = useState(false);

  const draftKey = `erp_invoice_draft_${trip?.id ?? "none"}`;
  useFormDraft(draftKey, open && !savedInvoice, form, setForm);

  useEffect(() => {
    sacCodesApi.list().then(setSacCodes).catch(() => {});
  }, []);

  // Once SAC codes load, back-fill sacId for any services that only have sacCode stored
  useEffect(() => {
    if (!sacCodes.length) return;
    setForm((prev) => ({
      ...prev,
      services: prev.services.map((s) => {
        if (s.sacId || !s.sacCode) return s;
        // Match by code + description first (handles duplicate codes), then code alone
        const match =
          sacCodes.find((sc) => sc.code === s.sacCode && sc.description === s.descriptionOfService) ??
          sacCodes.find((sc) => sc.code === s.sacCode);
        return match ? { ...s, sacId: String(match.id) } : s;
      }),
    }));
  }, [sacCodes]);

  useEffect(() => {
    if (!open || !trip) return;
    try {
      const saved = localStorage.getItem(INVOICE_HINTS_KEY(trip.id));
      setInvoiceHints(saved ? JSON.parse(saved) : []);
    } catch {
      setInvoiceHints([]);
    }
  }, [open, trip?.id]);

  // Insert a new service line — but if there's still an untouched blank line
  // (e.g. the default Service 1), fill that one instead of appending after it.
  function addOrFillService(line: ServiceLine) {
    setForm((prev) => {
      const idx = prev.services.findIndex(isBlankService);
      const services = idx >= 0
        ? prev.services.map((s, i) => (i === idx ? line : s))
        : [...prev.services, line];
      return { ...prev, services };
    });
  }

  function addHintAsService(hint: InvoiceHint, index: number) {
    addOrFillService({ ...emptyService(), descriptionOfService: hint.label, rate: String(hint.value), quantity: "1" });
    const remaining = invoiceHints.filter((_, i) => i !== index);
    setInvoiceHints(remaining);
    if (trip) {
      remaining.length === 0
        ? localStorage.removeItem(INVOICE_HINTS_KEY(trip.id))
        : localStorage.setItem(INVOICE_HINTS_KEY(trip.id), JSON.stringify(remaining));
    }
  }

  function dismissHints() {
    setInvoiceHints([]);
    if (trip) localStorage.removeItem(INVOICE_HINTS_KEY(trip.id));
  }

  const [fetchedInvoiceNo, setFetchedInvoiceNo] = useState("");
  useEffect(() => {
    if (!open) { setFetchedInvoiceNo(""); return; }
    if (savedInvoice?.invoiceNo) return;
    setFetchedInvoiceNo("");
    tripsApi.getNextInvoiceNo(form.invoiceType)
      .then((r) => setFetchedInvoiceNo(r.invoice_no))
      .catch(() => setFetchedInvoiceNo(""));
  }, [open, form.invoiceType, savedInvoice?.invoiceNo]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoInvoiceNo = savedInvoice?.invoiceNo || fetchedInvoiceNo;

  const taxSelected = form.gstApplicable === "Yes" || form.igstApplicable === "Yes";
  const isSelf = trip?.billTo === "SELF/CGI";
  const isBillOfSupplyLocked = !isSelf && (customer?.isGta === "Yes" || customer?.customerType === "Transports");

  const originalBillTo = customer?.name ?? trip?.billTo ?? "";
  const originalGstNumber = customer?.gstin ?? "";

  function update<K extends keyof InvoiceFormData>(key: K, value: InvoiceFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleInvoiceTypeChange(type: InvoiceType) {
    if (type === "Tax Invoice" && !taxSelected) { setTaxWarning(true); return; }
    setTaxWarning(false);
    if (type === "Transport Memo") {
      setForm((prev) => ({
        ...prev,
        invoiceType: type,
        billTo: "Canaan Global International, Puthukottai, Tuticorin, Tamil Nadu, India.",
        gstNumber: "33AAJFC9781F1Z8",
        gstApplicable: "No",
        igstApplicable: "No",
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        invoiceType: type,
        billTo: prev.invoiceType === "Transport Memo" ? originalBillTo : prev.billTo,
        gstNumber: prev.invoiceType === "Transport Memo" ? originalGstNumber : prev.gstNumber,
      }));
    }
  }

  function updateService<K extends keyof ServiceLine>(index: number, key: K, value: ServiceLine[K]) {
    setForm((prev) => {
      const services = prev.services.map((s, i) => {
        if (i !== index) return s;
        const updated = { ...s, [key]: value };
        if (key === "sacCode") {
          const match = sacCodes.find((sc) => sc.code === value);
          updated.gstRate = match ? (parseFloat(match.gstRate) > 0 ? match.gstRate : "") : "";
        }
        return updated;
      });
      return { ...prev, services };
    });
  }

  // SAC combobox: value is the SAC record ID (unique) so duplicate codes are disambiguated.
  // On picking an entry, auto-fill code, GST rate, description, and (if rate is blank) the
  // linked expense value from the trip sheet.
  function handleSacChange(index: number, sacId: string) {
    setForm((prev) => {
      const services = prev.services.map((s, i) => {
        if (i !== index) return s;
        const match = sacCodes.find((sc) => String(sc.id) === sacId);
        if (match) {
          const linkedVal = getLinkedExpenseValue(match.linkedExpense, sheet);
          const shouldFillRate = !s.rate || parseFloat(s.rate) === 0;
          return {
            ...s,
            sacId,
            sacCode: match.code,
            gstRate: parseFloat(match.gstRate) > 0 ? match.gstRate : "",
            descriptionOfService: match.description || s.descriptionOfService,
            rate: shouldFillRate && linkedVal && parseFloat(linkedVal) > 0 ? linkedVal : s.rate,
          };
        }
        return { ...s, sacId, sacCode: sacId };
      });
      return { ...prev, services };
    });
  }

  function handleTaxToggle(key: "gstApplicable" | "igstApplicable", opt: "Yes" | "No") {
    setForm((prev) => {
      const other = key === "gstApplicable" ? "igstApplicable" : "gstApplicable";
      const next = { ...prev, [key]: opt };
      if (opt === "Yes") {
        next[other] = "No";
        next.invoiceType = "Tax Invoice";
        // Pre-fill any service lines that have no GST rate yet with 18%
        next.services = prev.services.map((s) =>
          s.gstRate ? s : { ...s, gstRate: "18" }
        );
        setTaxWarning(false);
      } else if (prev[other] !== "Yes") {
        next.invoiceType = "Bill of Supply";
      }
      return next;
    });
  }

  function addService() {
    setForm((prev) => ({ ...prev, services: [...prev.services, emptyService()] }));
  }

  function removeService(index: number) {
    setForm((prev) => ({ ...prev, services: prev.services.filter((_, i) => i !== index) }));
  }

  // When Tax Invoice + GST/IGST is active → all services use 18%; else use per-service SAC rate
  const taxOverride = taxSelected; // gstApplicable=Yes or igstApplicable=Yes
  const isIgst = form.igstApplicable === "Yes";
  const isGst = form.gstApplicable === "Yes";

  const serviceCalcs = useMemo(() =>
    form.services.map((s) => {
      const subtotal = (parseFloat(s.quantity) || 0) * (parseFloat(s.rate) || 0);
      const effectiveRate = parseFloat(s.gstRate) || 0;
      const gstAmount = parseFloat((subtotal * (effectiveRate / 100)).toFixed(2));
      return { subtotal, gstAmount, lineTotal: subtotal + gstAmount, effectiveRate };
    }),
  [form.services]);

  const subtotalAll = useMemo(() => serviceCalcs.reduce((sum, s) => sum + s.subtotal, 0), [serviceCalcs]);
  const totalGst = useMemo(() => serviceCalcs.reduce((sum, s) => sum + s.gstAmount, 0), [serviceCalcs]);
  const grandTotal = useMemo(() => subtotalAll + totalGst, [subtotalAll, totalGst]);
  const amountInWords = useMemo(() => numberToWords(grandTotal), [grandTotal]);

  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({ ...form, invoiceNo: autoInvoiceNo }, form.invoiceType);
      if (!savedInvoice) clearFormDraft(draftKey);
    } finally {
      setSaving(false);
    }
  }

  if (!trip) return null;

  return (
    <>
    <Dialog open={open} onClose={onClose} title={`${savedInvoice ? "Edit" : "Generate"} Invoice — ${trip.tripId}`} className="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* Invoice Type + Tax Details */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">

          <section className="flex flex-col gap-4">
            <p className={sh}>Invoice Type</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {INVOICE_TYPES.map((type) => {
                const lockedMemo = isSelf && type !== "Transport Memo";
                const lockedBos = isBillOfSupplyLocked && type !== "Bill of Supply";
                const blocked = !isSelf && !isBillOfSupplyLocked && type === "Tax Invoice" && !taxSelected;
                const disabled = lockedMemo || lockedBos || blocked;
                const lockTitle = lockedMemo
                  ? "Locked — Bill To is Self/CGI"
                  : lockedBos
                  ? `Locked — customer is ${customer?.isGta === "Yes" ? "a GTA" : "a Transporter"}`
                  : type === "Transport Memo"
                  ? "Billed to Canaan Global International"
                  : undefined;
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && handleInvoiceTypeChange(type)}
                    className={[
                      "rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all",
                      form.invoiceType === type
                        ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
                        : disabled
                        ? "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                    ].join(" ")}
                    title={lockTitle}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400">
              {isSelf
                ? "Locked to Transport Memo — this trip is billed to Canaan Global International."
                : isBillOfSupplyLocked
                ? `Locked to Bill of Supply — customer is ${customer?.isGta === "Yes" ? "a registered GTA" : "a Transporter"} (GST-exempt under Notification 12/2017).`
                : form.invoiceType === "Bill of Supply"
                ? "GST-exempt supply invoice — for GTA-to-GTA services under Notification 12/2017."
                : form.invoiceType === "Transport Memo"
                ? "Internal transport memo — for own-fleet movements billed to Canaan Global International."
                : "Full tax invoice — 18% GST applied uniformly across all service lines."}
            </p>
            {!isSelf && !isBillOfSupplyLocked && taxWarning && (
              <p className="text-xs font-medium text-amber-600">
                Please select GST or IGST in Tax Details before choosing Tax Invoice.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <p className={sh}>Tax Details</p>
            <div className="flex flex-col gap-3">
              {(["gstApplicable", "igstApplicable"] as const)
                .filter((key) => {
                  if (key === "gstApplicable") return form.igstApplicable !== "Yes";
                  return form.gstApplicable !== "Yes";
                })
                .map((key) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-gray-600">
                      {key === "gstApplicable" ? "GST Applicable? (CGST 9% + SGST 9%)" : "IGST Applicable? (18%)"}
                    </span>
                    <div className="flex gap-2">
                      {(["Yes", "No"] as const).map((opt) => {
                        const lockedByself = isSelf && opt === "Yes";
                        return (
                          <button
                            key={opt}
                            type="button"
                            disabled={lockedByself}
                            onClick={() => !lockedByself && handleTaxToggle(key, opt)}
                            className={[
                              "flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-all",
                              lockedByself
                                ? "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
                                : form[key] === opt
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
              {isSelf && (
                <p className="text-xs text-gray-400">
                  GST/IGST locked to No — Transport Memos to Canaan Global International are not taxable.
                </p>
              )}
              {!isSelf && taxSelected && (
                <p className="text-xs text-amber-600 font-medium">
                  {isIgst ? "IGST 18% will be applied to all service lines." : "CGST 9% + SGST 9% will be applied to all service lines."}
                </p>
              )}
            </div>
          </section>

        </div>

        {/* Section 1: Invoice Details */}
        <section className="flex flex-col gap-4">
          <p className={sh}>1. Invoice Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Invoice No">
              <input readOnly disabled value={autoInvoiceNo} className={roClass} placeholder={open ? "Fetching next number…" : ""} />
            </Field>
            <Field label="Invoice Date" required>
              <DatePickerInput value={form.invoiceDate} onChange={(v) => update("invoiceDate", v)} required />
            </Field>
            <Field label="Booking Reference No">
              <input readOnly disabled value={form.bookingReferenceNo} className={roClass} />
            </Field>
            <Field label="Trip Sheet No">
              <input readOnly disabled value={form.tripSheetNo} className={roClass} />
            </Field>
          </div>
        </section>

        {/* Section 2: Customer Details */}
        <section className="flex flex-col gap-4">
          <p className={sh}>2. Customer Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bill To">
              <input readOnly disabled value={form.billTo} className={roClass} />
            </Field>
            <Field label="GST Number">
              <input value={form.gstNumber} onChange={(e) => update("gstNumber", e.target.value.toUpperCase())} className={inputClass} placeholder="e.g. 33AABCU9603R1ZT" />
            </Field>
          </div>
        </section>



        {/* Section 3: Container Details */}
        <section className="flex flex-col gap-4">
          <p className={sh}>3. Container Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Container Type">
              <input readOnly disabled value={form.containerType} className={roClass} />
            </Field>
            <Field label="Container No">
              <input readOnly disabled value={form.containerNo} className={roClass} />
            </Field>
            <Field label="Consignee">
              <input readOnly disabled value={form.consignee} className={roClass} />
            </Field>
          </div>
        </section>

        {/* Section 4: Service Details */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className={sh}>4. Service Details</p>
            <div className="flex items-center gap-2">
              {trip.transportHireAmount && Number(trip.transportHireAmount) > 0 && (
                <span className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  Trip Hire Amount &nbsp;·&nbsp; ₹{Number(trip.transportHireAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowSacTable(true)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                View SAC Code Table
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {invoiceHints.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-amber-800">
                    Flagged during verification — add to service lines if billable:
                  </p>
                  <button type="button" onClick={dismissHints} className="text-xs text-amber-500 hover:text-amber-700 font-medium">
                    Dismiss all
                  </button>
                </div>
                {invoiceHints.map((hint, i) => (
                  <div key={i} className="flex items-center justify-between rounded bg-white/80 border border-amber-100 px-2.5 py-1.5">
                    <span className="text-xs text-amber-700">
                      {hint.label}
                      <span className="ml-2 font-semibold">
                        ₹{hint.value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => addHintAsService(hint, i)}
                      className="rounded border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      + Add Service
                    </button>
                  </div>
                ))}
              </div>
            )}
            {form.services.map((svc, i) => {
              const calc = serviceCalcs[i];
              return (
                <div key={i} className="relative flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  {form.services.length > 1 && (
                    <button type="button" onClick={() => removeService(i)} className="absolute right-3 top-3 text-xs font-semibold text-red-500 hover:text-red-700">
                      Remove
                    </button>
                  )}
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Service {i + 1}</span>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Description of Service" className="sm:col-span-2">
                      <input
                        value={svc.descriptionOfService}
                        onChange={(e) => updateService(i, "descriptionOfService", e.target.value)}
                        className={inputClass}
                        placeholder="e.g. Transportation of cargo from Chennai to Coimbatore"
                      />
                    </Field>
                    <Field label="SAC Code">
                      <GlassCombobox
                        value={svc.sacId}
                        onChange={(val) => handleSacChange(i, val)}
                        options={sacCodes.map((sc) => ({ value: String(sc.id), label: `${sc.code} — ${sc.description}` }))}
                        placeholder="Select or type SAC code"
                      />
                    </Field>
                    <Field label={`GST Rate (%)${taxSelected ? ` — ${isIgst ? "IGST" : "GST"}` : ""}`}>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={svc.gstRate}
                          onChange={(e) => updateService(i, "gstRate", e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          className={`${inputClass} pr-8`}
                          placeholder="e.g. 18"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                      </div>
                    </Field>
                    <Field label="Quantity">
                      <DecimalInput type="number" min="0" step="any"
                        value={svc.quantity}
                        onChange={(e) => updateService(i, "quantity", e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={inputClass}
                        placeholder="e.g. 1"
                      />
                    </Field>
                    <Field label="Rate (INR)">
                      <DecimalInput type="number" min="0" step="0.01"
                        value={svc.rate}
                        onChange={(e) => updateService(i, "rate", e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={inputClass}
                        placeholder="e.g. 32000"
                      />
                    </Field>
                  </div>
                  {calc.subtotal > 0 && (
                    <div className="mt-1 flex flex-wrap gap-3 border-t border-gray-200 pt-3 text-xs text-gray-500">
                      <span>Subtotal: <strong className="text-gray-700">₹{fmt(calc.subtotal)}</strong></span>
                      {calc.gstAmount > 0 && (
                        <span>
                          {isIgst ? "IGST" : "GST"} ({svc.gstRate || 0}%):
                          <strong className="text-amber-700"> +₹{fmt(calc.gstAmount)}</strong>
                        </span>
                      )}
                      <span>Line Total: <strong className="text-emerald-700">₹{fmt(calc.lineTotal)}</strong></span>
                    </div>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={addService} className="self-start rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">
              + Add Service
            </button>
          </div>
        </section>

        {/* Section 7: Amount Details */}
        <section className="flex flex-col gap-4">
          <p className={sh}>7. Amount Details</p>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
              <span className="text-sm text-gray-600">Subtotal (before GST)</span>
              <span className="text-sm font-semibold text-gray-800">₹{fmt(subtotalAll)}</span>
            </div>

            {isGst && totalGst > 0 && (
              <>
                <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5">
                  <span className="text-sm text-amber-700">CGST (9%)</span>
                  <span className="text-sm font-semibold text-amber-700">+ ₹{fmt(totalGst / 2)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5">
                  <span className="text-sm text-amber-700">SGST (9%)</span>
                  <span className="text-sm font-semibold text-amber-700">+ ₹{fmt(totalGst / 2)}</span>
                </div>
              </>
            )}

            {isIgst && totalGst > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5">
                <span className="text-sm text-amber-700">IGST (18%)</span>
                <span className="text-sm font-semibold text-amber-700">+ ₹{fmt(totalGst)}</span>
              </div>
            )}

            {!taxOverride && totalGst > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5">
                <span className="text-sm text-amber-700">Total GST (per SAC codes)</span>
                <span className="text-sm font-semibold text-amber-700">+ ₹{fmt(totalGst)}</span>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="text-sm font-semibold text-gray-700">Grand Total</span>
              <span className="text-lg font-bold text-emerald-700">₹{grandTotal > 0 ? fmt(grandTotal) : "0.00"}</span>
            </div>
            <Field label="Amount in Words">
              <input readOnly disabled value={amountInWords} className={roClass} placeholder="Auto-calculated from Grand Total" />
            </Field>
          </div>
        </section>

        {/* Section 8: Bank Details */}
        <section className="flex flex-col gap-4">
          <p className={sh}>8. Bank Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bank Name">
              <input value={form.bankName} onChange={(e) => update("bankName", e.target.value)} className={inputClass} placeholder="e.g. HDFC Bank" />
            </Field>
            <Field label="Branch Name">
              <input value={form.branchName} onChange={(e) => update("branchName", e.target.value)} className={inputClass} placeholder="e.g. Anna Nagar, Chennai" />
            </Field>
            <Field label="Account Number">
              <input value={form.accountNumber} onChange={(e) => update("accountNumber", e.target.value)} className={inputClass} placeholder="e.g. 50100123456789" />
            </Field>
            <Field label="IFSC Code">
              <input value={form.ifscCode} onChange={(e) => update("ifscCode", e.target.value.toUpperCase())} className={inputClass} placeholder="e.g. HDFC0001234" />
            </Field>
          </div>
        </section>

        {/* Section 9: Contact Details */}
        <section className="flex flex-col gap-4">
          <p className={sh}>9. Contact Details</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Contact Person">
              <input value={form.contactPerson} onChange={(e) => update("contactPerson", e.target.value)} className={inputClass} placeholder="e.g. Raju Kumar" />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className={inputClassLower} placeholder="e.g. accounts@canaan.in" />
            </Field>
            <Field label="Contact">
              <input value={form.contact} onChange={(e) => update("contact", e.target.value)} className={inputClass} placeholder="e.g. +91 98765 43210" />
            </Field>
          </div>
        </section>

        {/* Section 10: Additional Details */}
        <section className="flex flex-col gap-4">
          <p className={sh}>10. Additional Details</p>
          <Field label="Narration">
            <textarea rows={3} value={form.narration} onChange={(e) => update("narration", e.target.value)} className={inputClass} placeholder="e.g. Payment to be made within 30 days of invoice date" />
          </Field>
        </section>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <div className="text-sm text-gray-500">
            Trip: <span className="font-semibold text-gray-800">{trip.tripId}</span>
            &nbsp;·&nbsp;
            Grand Total: <span className="font-semibold text-emerald-700">₹{grandTotal > 0 ? fmt(grandTotal) : "0.00"}</span>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => { clearFormDraft(draftKey); onClose(); }} disabled={saving} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving || (!savedInvoice && !autoInvoiceNo)} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? (savedInvoice ? "Saving…" : "Generating…") : (!savedInvoice && !autoInvoiceNo) ? "Fetching No…" : (savedInvoice ? "Save Changes" : "Generate Invoice")}
            </button>
          </div>
        </div>

      </form>
    </Dialog>

    {/* SAC Code Table Modal */}
    <Dialog open={showSacTable} onClose={() => setShowSacTable(false)} title="SAC Code Reference Table" className="max-w-2xl">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-gray-500">
          {sacCodes.length} codes available · Click <span className="font-semibold text-blue-600">+ Add</span> to insert a service line pre-filled with that code.
        </p>
        <div className="overflow-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider">Description of Service</th>
                <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider w-28">SAC Code</th>
                <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider w-20">GST (%)</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider w-48">Retrieves From</th>
                <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sacCodes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">Loading SAC codes…</td>
                </tr>
              ) : (
                sacCodes.map((sc, i) => {
                  const linkedVal = getLinkedExpenseValue(sc.linkedExpense, sheet);
                  const hasValue = linkedVal && parseFloat(linkedVal) > 0;
                  return (
                    <tr key={sc.id} className={`transition-colors ${i % 2 === 0 ? "bg-white hover:bg-blue-50/50" : "bg-gray-50/60 hover:bg-blue-50/50"}`}>
                      <td className="px-4 py-2.5 text-gray-700 whitespace-normal break-words">{sc.description}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-xs font-semibold text-blue-700 tracking-wider">{sc.code}</td>
                      <td className="px-4 py-2.5 text-center">
                        {parseFloat(sc.gstRate) > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-bold text-amber-700">
                            {sc.gstRate}%
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {sc.linkedExpense ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-indigo-700 leading-tight">{sc.linkedExpense}</span>
                            {hasValue ? (
                              <span className="text-xs font-semibold text-emerald-700">
                                ₹{parseFloat(linkedVal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">No data on sheet</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            addOrFillService({
                              ...emptyService(),
                              descriptionOfService: sc.description,
                              sacCode: sc.code,
                              sacId: String(sc.id),
                              gstRate: parseFloat(sc.gstRate) > 0 ? sc.gstRate : "",
                              quantity: "1",
                              rate: hasValue ? linkedVal : "",
                            });
                            setShowSacTable(false);
                          }}
                          className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all duration-150"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Add
                        </button>
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
            onClick={() => setShowSacTable(false)}
            className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Dialog>
    </>
  );
}
