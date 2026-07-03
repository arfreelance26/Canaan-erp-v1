import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";
import type { Customer } from "@/types/customer";
import type { BillOfSupplyInvoiceProps } from "@/components/invoices/BillOfSupplyInvoice";
import type { TransportMemoInvoiceProps } from "@/components/invoices/TransportMemoInvoice";
import type { TaxInvoiceProps } from "@/components/invoices/TaxInvoice";
import type { ServiceItem } from "@/components/invoices/BillOfSupplyInvoice";

// ── Amount to words (Indian numbering system) ──────────────────────────────

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = TENS[Math.floor(n / 10)] ?? "";
  const o = ONES[n % 10] ?? "";
  return o ? `${t} ${o}` : t;
}

function numToWords(n: number): string {
  if (n === 0) return "Zero";
  const crore    = Math.floor(n / 10_000_000);
  const lakh     = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const hundred  = Math.floor((n % 1_000) / 100);
  const rest     = n % 100;

  const parts: string[] = [];
  if (crore)    parts.push(`${twoDigits(crore)} Crore`);
  if (lakh)     parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred)  parts.push(`${ONES[hundred]} Hundred`);
  if (rest)     parts.push(twoDigits(rest));
  return parts.join(" ");
}

export function amountToWords(amount: string): string {
  const num    = parseFloat(amount) || 0;
  const rupees = Math.floor(num);
  const paise  = Math.round((num - rupees) * 100);

  let words = `Rupees ${numToWords(rupees)}`;
  if (paise) words += ` and ${numToWords(paise)} Paise`;
  return words + " Only";
}

// ── Helpers ────────────────────────────────────────────────────────────────

function n(v: string): number { return parseFloat(v) || 0; }

function fmt(v: number): string {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

function resolveContainerNo(trip: Trip, closure: TripClosureData): string {
  // Use the simplified containerNo from closure; fall back to trip fields
  if (closure.containerNo) return closure.containerNo;
  const spec = closure.containerType || trip.containerSpecification;
  if (spec === "2 X 20 FEET CONTAINERS") {
    const a = trip.containerNumber1;
    const b = trip.containerNumber2;
    return `${a} / ${b}`;
  }
  if (spec === "OPEN LOAD CARGO") return trip.cargoReference;
  return trip.containerNumber;
}

function buildServiceItems(closure: TripClosureData): ServiceItem[] {
  const billingAmt = n(closure.billingAmount);
  if (billingAmt > 0) {
    return [{
      description: "Container Transport Services",
      sacCode: "996791",
      qty: 1,
      rate: fmt(billingAmt),
      total: fmt(billingAmt),
    }];
  }
  const hireAmt = n(closure.hireAmount);
  return [{
    description: "Internal Transport Charges",
    sacCode: "996791",
    qty: 1,
    rate: fmt(hireAmt),
    total: fmt(hireAmt),
  }];
}

function reorderRef(ref: string): string {
  const parts = ref.split("/");
  if (parts.length < 4) return ref;
  // Fiscal year looks like "25-26" / "26-27"; sequence looks like "001".
  // Ensure order is always: CGI / date / fiscal-year / seq
  const a = parts[2]!;
  const b = parts[3]!;
  const aIsFiscal = /^\d{2}-\d{2}$/.test(a);
  if (!aIsFiscal) [parts[2], parts[3]] = [b, a];
  return parts.join("/");
}

function resolveInvoiceNo(trip: Trip, invoice?: Record<string, any>): string {
  if (invoice?.invoiceNo) return reorderRef(invoice.invoiceNo);
  const ref = trip.bookingReferenceNo.startsWith("CGI/")
    ? trip.bookingReferenceNo
    : `CGI/${trip.bookingReferenceNo}`;
  return reorderRef(ref);
}

function resolveBillToName(trip: Trip, closure: TripClosureData, customer: Customer | undefined): string {
  if (closure.billTo === "CONSIGNEE") {
    return trip.shipperConsignee;
  }
  return customer?.name ?? "";
}

// Shared fields used by all three invoice types
function commonFields(
  trip: Trip,
  closure: TripClosureData,
  sheet: TripSheetData | undefined,
  customer: Customer | undefined,
  invoice: Record<string, any> | undefined,
) {
  const totalBilling = n(closure.billingAmount) || n(closure.hireAmount);
  return {
    invoiceNo:        resolveInvoiceNo(trip, invoice),
    date:             fmtDate(invoice?.invoiceDate || new Date().toISOString().slice(0, 10)),
    billToName:       invoice?.billTo || resolveBillToName(trip, closure, customer),
    billToAddress:    customer?.address,
    bookingNo:        closure.bookingNo || trip.bookingReferenceNo,
    tripSheetNo:      sheet?.tripSheetNo ?? trip.tripId ?? "",
    refNo:            closure.releaseOrderNo || trip.releaseOrderReference,
    modeOfShipment:   trip.cargoClassification || "SEA",
    containerType:    closure.containerType || trip.containerSpecification,
    gstNumber:        invoice?.gstNumber || customer?.gstin || "",
    cfs:              undefined as string | undefined,
    lineForwarder:    trip.cargoClassification === "EXPORT" ? "" : (closure.line || trip.shippingLine),
    vesselName:       trip.cargoClassification === "EXPORT" ? "" : trip.vesselName,
    from:             closure.fromLocation || trip.origin,
    to:               closure.toLocation || trip.destination,
    containerNo:      resolveContainerNo(trip, closure),
    consignee:        trip.shipperConsignee,
    serviceItems:     invoice?.services?.length ? invoice.services.map((s: any) => ({
      description: s.descriptionOfService,
      sacCode: s.sacCode,
      qty: n(s.quantity),
      rate: fmt(n(s.rate)),
      total: fmt(n(s.quantity) * n(s.rate))
    })) : buildServiceItems(closure),
    subtotal:         fmt(totalBilling),
    amountInWords:    amountToWords(String(totalBilling)),
    grandTotal:       fmt(totalBilling),
    narration:        invoice?.narration || (() => {
      const containerNo = resolveContainerNo(trip, closure);
      const spec = closure.containerType || trip.containerSpecification;
      const origin = closure.fromLocation || trip.origin;
      const destination = closure.toLocation || trip.destination;
      const date = trip.scheduledDate ? trip.scheduledDate.split("-").reverse().join("-") : "";
      const shortSpec = spec === "20 FT CONTAINER" ? "20 FT" : spec === "40 FT CONTAINER" ? "40 FT" : spec === "2 X 20 FEET CONTAINERS" ? "2X20 FT" : spec === "OPEN LOAD CARGO" ? "OPEN LOAD" : spec;
      return [containerNo, shortSpec, origin, destination, date].filter(Boolean).join("/");
    })(),
    bankName:         "HDFC - 9181 - Shipping",
    branchName:       "TUTICORIN",
    accountNumber:    "50200037439181",
    ifscCode:         "HDFC0001104",
    contactPerson:    "S SUNDER",
    email:            "tutfin@canaanglobal.com",
    contact:          "9047015423",
  };
}

// ── Public builders ────────────────────────────────────────────────────────

export function buildBillOfSupply(
  trip: Trip,
  closure: TripClosureData,
  sheet: TripSheetData | undefined,
  customer: Customer | undefined,
  invoice?: Record<string, any>
): BillOfSupplyInvoiceProps {
  const total = invoice?.services?.length ? invoice.services.reduce((acc: number, s: any) => acc + (n(s.quantity) * n(s.rate)), 0) : (n(closure.billingAmount) || n(closure.hireAmount));
  return {
    ...commonFields(trip, closure, sheet, customer, invoice),
    subtotal: fmt(total),
    grandTotal: fmt(total),
    amountInWords: amountToWords(String(total)),
    hsnRows:  [{ hsn: "996791 — Goods Transport Services", taxableValue: fmt(total) }],
    hsnTotal: fmt(total),
  };
}

export function buildTransportMemo(
  trip: Trip,
  closure: TripClosureData,
  sheet: TripSheetData | undefined,
  customer: Customer | undefined,
  invoice?: Record<string, any>
): TransportMemoInvoiceProps {
  const total = invoice?.services?.length ? invoice.services.reduce((acc: number, s: any) => acc + (n(s.quantity) * n(s.rate)), 0) : (n(closure.billingAmount) || n(closure.hireAmount));
  return {
    ...commonFields(trip, closure, sheet, customer, invoice),
    // Transport Memo is always billed to Canaan Global International — never the customer
    billToName: invoice?.billTo || "Canaan Global International, Puthukottai, Tuticorin, Tamil Nadu, India.",
    billToAddress: undefined,
    subtotal: fmt(total),
    grandTotal: fmt(total),
    amountInWords: amountToWords(String(total)),
  };
}

export function buildTaxInvoice(
  trip: Trip,
  closure: TripClosureData,
  sheet: TripSheetData | undefined,
  customer: Customer | undefined,
  invoice?: Record<string, any>
): TaxInvoiceProps {
  const subtotal    = invoice?.services?.length ? invoice.services.reduce((acc: number, s: any) => acc + (n(s.quantity) * n(s.rate)), 0) : (n(closure.billingAmount) || n(closure.hireAmount));
  const sgst        = invoice?.gstApplicable === "Yes" ? parseFloat((subtotal * 0.09).toFixed(2)) : 0;
  const cgst        = invoice?.gstApplicable === "Yes" ? parseFloat((subtotal * 0.09).toFixed(2)) : 0;
  const igst        = invoice?.igstApplicable === "Yes" ? parseFloat((subtotal * 0.18).toFixed(2)) : 0;
  const grandTotal  = subtotal + sgst + cgst + igst;

  return {
    ...commonFields(trip, closure, sheet, customer, invoice),
    subtotal: fmt(subtotal),
    amountInWords: amountToWords(String(grandTotal)),
    grandTotal:    fmt(grandTotal),
    hsnRows: [
      { description: "996791 — Goods Transport Services", value: fmt(subtotal) },
      ...(sgst > 0 ? [{ description: "SGST @ 9%", value: fmt(sgst) }, { description: "CGST @ 9%", value: fmt(cgst) }] : []),
      ...(igst > 0 ? [{ description: "IGST @ 18%", value: fmt(igst) }] : []),
    ],
    hsnTotal: fmt(grandTotal),
  };
}
