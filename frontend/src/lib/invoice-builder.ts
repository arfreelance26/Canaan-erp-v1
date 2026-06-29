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

  let words = `INR ${numToWords(rupees)} Rupees`;
  if (paise) words += ` and ${numToWords(paise)} Paise`;
  return words + " Only";
}

// ── Helpers ────────────────────────────────────────────────────────────────

function n(v: string): number { return parseFloat(v) || 0; }

function fmt(v: number): string {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    description: "Container Transport Hire",
    sacCode: "996791",
    qty: 1,
    rate: fmt(hireAmt),
    total: fmt(hireAmt),
  }];
}

function resolveInvoiceNo(trip: Trip): string {
  return `CGI/${trip.bookingReferenceNo}`;
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
) {
  const totalBilling = n(closure.billingAmount) || n(closure.hireAmount);
  return {
    invoiceNo:        resolveInvoiceNo(trip),
    date:             closure.tripCompletedDate || new Date().toISOString().slice(0, 10),
    billToName:       resolveBillToName(trip, closure, customer),
    billToAddress:    customer?.address,
    bookingNo:        closure.bookingNo || trip.bookingReferenceNo,
    tripSheetNo:      sheet?.tripSheetNo ?? "",
    refNo:            closure.releaseOrderNo || trip.releaseOrderReference,
    modeOfShipment:   closure.line || trip.shippingLine || "SEA",
    containerType:    closure.containerType || trip.containerSpecification,
    gstNumber:        customer?.gstin ?? "",
    cfs:              undefined as string | undefined,
    lineForwarder:    closure.line || trip.shippingLine,
    vesselName:       trip.vesselName,
    from:             closure.fromLocation || trip.origin,
    to:               closure.toLocation || trip.destination,
    containerNo:      resolveContainerNo(trip, closure),
    consignee:        trip.shipperConsignee,
    serviceItems:     buildServiceItems(closure),
    subtotal:         fmt(totalBilling),
    amountInWords:    amountToWords(String(totalBilling)),
    grandTotal:       fmt(totalBilling),
    narration:        `Transport charges for ${closure.containerType || trip.containerSpecification} from ${closure.fromLocation || trip.origin} to ${closure.toLocation || trip.destination} — Ref: ${trip.bookingReferenceNo}`,
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
): BillOfSupplyInvoiceProps {
  const total = n(closure.billingAmount) || n(closure.hireAmount);
  return {
    ...commonFields(trip, closure, sheet, customer),
    hsnRows:  [{ hsn: "996791 — Goods Transport Services", taxableValue: fmt(total) }],
    hsnTotal: fmt(total),
  };
}

export function buildTransportMemo(
  trip: Trip,
  closure: TripClosureData,
  sheet: TripSheetData | undefined,
  customer: Customer | undefined,
): TransportMemoInvoiceProps {
  return commonFields(trip, closure, sheet, customer);
}

export function buildTaxInvoice(
  trip: Trip,
  closure: TripClosureData,
  sheet: TripSheetData | undefined,
  customer: Customer | undefined,
): TaxInvoiceProps {
  const subtotal    = n(closure.billingAmount) || n(closure.hireAmount);
  const sgst        = parseFloat((subtotal * 0.09).toFixed(2));
  const cgst        = parseFloat((subtotal * 0.09).toFixed(2));
  const grandTotal  = subtotal + sgst + cgst;

  return {
    ...commonFields(trip, closure, sheet, customer),
    amountInWords: amountToWords(String(grandTotal)),
    grandTotal:    fmt(grandTotal),
    hsnRows: [
      { description: "996791 — Goods Transport Services", value: fmt(subtotal) },
      { description: "SGST @ 9%",                         value: fmt(sgst) },
      { description: "CGST @ 9%",                         value: fmt(cgst) },
    ],
    hsnTotal: fmt(grandTotal),
  };
}
