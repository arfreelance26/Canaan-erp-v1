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
      gstRate: "",
      total: fmt(billingAmt),
    }];
  }
  const hireAmt = n(closure.hireAmount);
  return [{
    description: "Internal Transport Charges",
    sacCode: "996791",
    qty: 1,
    rate: fmt(hireAmt),
    gstRate: "",
    total: fmt(hireAmt),
  }];
}

// Returns the pre-GST subtotal and the total GST across all service lines.
function computeServiceTotals(services: any[]): { subtotal: number; gstTotal: number } {
  return services.reduce(
    (acc, s) => {
      const base = n(s.quantity) * n(s.rate);
      const gst = parseFloat((base * ((parseFloat(s.gstRate) || 0) / 100)).toFixed(2));
      return { subtotal: acc.subtotal + base, gstTotal: acc.gstTotal + gst };
    },
    { subtotal: 0, gstTotal: 0 },
  );
}

function resolveInvoiceNo(trip: Trip, invoice?: Record<string, any>): string {
  const invNo = invoice?.invoiceNo ?? invoice?.invoice_no;
  if (invNo) return invNo;
  return trip.bookingReferenceNo ?? "";
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
  const isExport = trip.cargoClassification === "EXPORT";
  return {
    invoiceNo:        resolveInvoiceNo(trip, invoice),
    date:             fmtDate(invoice?.invoiceDate || invoice?.invoice_date || new Date().toISOString().slice(0, 10)),
    billToName:       invoice?.billTo || invoice?.bill_to || resolveBillToName(trip, closure, customer),
    billToAddress:    customer?.address,
    bookingNo:        closure.bookingNo || trip.bookingReferenceNo,
    tripSheetNo:      sheet?.tripSheetNo ?? trip.tripId ?? "",
    refNo:            closure.releaseOrderNo || trip.releaseOrderReference,
    modeOfShipment:   invoice?.modeOfShipment || invoice?.mode_of_shipment || trip.cargoClassification || "SEA",
    containerType:    invoice?.containerType || invoice?.container_type || closure.containerType || trip.containerSpecification,
    gstNumber:        invoice?.gstNumber || invoice?.gst_number || customer?.gstin || "",
    cfs:              invoice?.cfs || undefined,
    lineForwarder:    invoice?.shippingLine || invoice?.shipping_line || (isExport ? "" : (closure.line || trip.shippingLine)),
    vesselName:       invoice?.vesselName || invoice?.vessel_name || (isExport ? "" : trip.vesselName),
    from:             invoice?.from || invoice?.origin || closure.fromLocation || trip.origin,
    to:               invoice?.to || invoice?.destination || closure.toLocation || trip.destination,
    containerNo:      invoice?.containerNo || invoice?.container_no || resolveContainerNo(trip, closure),
    consignee:        invoice?.consignee || trip.shipperConsignee,
    // Service table: rate is pre-GST; total is GST-inclusive (base + per-line GST).
    serviceItems:     invoice?.services?.length ? invoice.services.map((s: any) => {
      const base = n(s.quantity) * n(s.rate);
      const gst  = parseFloat((base * ((parseFloat(s.gstRate) || 0) / 100)).toFixed(2));
      return {
        description: s.descriptionOfService,
        sacCode: s.sacCode,
        qty: n(s.quantity),
        rate: fmt(n(s.rate)),
        gstRate: s.gstRate || "",
        total: fmt(base + gst),
      };
    }) : buildServiceItems(closure),
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
    bankName:      invoice?.bankName || invoice?.bank_name || "HDFC - 9181 - Shipping",
    branchName:    invoice?.branchName || invoice?.branch_name || "TUTICORIN",
    accountNumber: invoice?.accountNumber || invoice?.account_number || "50200037439181",
    ifscCode:      invoice?.ifscCode || invoice?.ifsc_code || "HDFC0001104",
    contactPerson: invoice?.contactPerson || "S SUNDER",
    email:         invoice?.email || "tutfin@canaanglobal.com",
    contact:       invoice?.contact || "9047015423",
    gstApplicable:  (invoice?.gstApplicable  || invoice?.gst_applicable  || "No") as "Yes" | "No",
    igstApplicable: (invoice?.igstApplicable || invoice?.igst_applicable || "No") as "Yes" | "No",
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
  const { subtotal, gstTotal } = invoice?.services?.length
    ? computeServiceTotals(invoice.services)
    : { subtotal: n(closure.billingAmount) || n(closure.hireAmount), gstTotal: 0 };
  const grand = subtotal + gstTotal;
  return {
    ...commonFields(trip, closure, sheet, customer, invoice),
    subtotal: fmt(grand),
    grandTotal: fmt(grand),
    amountInWords: amountToWords(String(grand)),
    hsnRows:  [{ hsn: "996791 — Goods Transport Services", taxableValue: fmt(subtotal) }],
    hsnTotal: fmt(subtotal),
  };
}

export function buildTransportMemo(
  trip: Trip,
  closure: TripClosureData,
  sheet: TripSheetData | undefined,
  customer: Customer | undefined,
  invoice?: Record<string, any>
): TransportMemoInvoiceProps {
  // Transport Memo is strictly no-GST — ignore any GST rates on service lines.
  const services: any[] | undefined = invoice?.services?.length ? invoice.services : undefined;
  const subtotal = services
    ? services.reduce((sum: number, s: any) => sum + n(s.quantity) * n(s.rate), 0)
    : n(closure.billingAmount) || n(closure.hireAmount);

  const common = commonFields(trip, closure, sheet, customer, invoice);
  // Strip GST rate and recalculate totals (base only, no tax) for every service line.
  const serviceItems = services
    ? services.map((s: any) => {
        const base = n(s.quantity) * n(s.rate);
        return {
          description: s.descriptionOfService,
          sacCode: s.sacCode,
          qty: n(s.quantity),
          rate: fmt(n(s.rate)),
          gstRate: "",
          total: fmt(base),
        };
      })
    : common.serviceItems.map((s: ServiceItem) => ({ ...s, gstRate: "" }));

  return {
    ...common,
    serviceItems,
    billToName: invoice?.billTo || "Canaan Global International, Puthukottai, Tuticorin, Tamil Nadu, India.",
    billToAddress: undefined,
    subtotal: fmt(subtotal),
    grandTotal: fmt(subtotal),
    amountInWords: amountToWords(String(subtotal)),
    // Transport Memo does not show bank details, terms, contact, signatory or footer
    bankName: "",
    branchName: "",
    accountNumber: "",
    ifscCode: "",
    contactPerson: "",
    email: "",
    contact: "",
    narration: "",
  };
}

export function buildTaxInvoice(
  trip: Trip,
  closure: TripClosureData,
  sheet: TripSheetData | undefined,
  customer: Customer | undefined,
  invoice?: Record<string, any>
): TaxInvoiceProps {
  const { subtotal, gstTotal } = invoice?.services?.length
    ? computeServiceTotals(invoice.services)
    : { subtotal: n(closure.billingAmount) || n(closure.hireAmount), gstTotal: 0 };

  const gstApp  = invoice?.gstApplicable || invoice?.gst_applicable;
  const igstApp = invoice?.igstApplicable || invoice?.igst_applicable;
  // Split per-service GST into CGST+SGST (9%+9%) or IGST (18%) based on invoice toggle.
  const sgst = gstApp === "Yes" ? parseFloat((gstTotal / 2).toFixed(2)) : 0;
  const cgst = gstApp === "Yes" ? parseFloat((gstTotal / 2).toFixed(2)) : 0;
  const igst = igstApp === "Yes" ? gstTotal : 0;
  const grand = subtotal + (gstApp === "Yes" ? sgst + cgst : igstApp === "Yes" ? igst : gstTotal);

  return {
    ...commonFields(trip, closure, sheet, customer, invoice),
    subtotal: fmt(grand),
    amountInWords: amountToWords(String(grand)),
    grandTotal:    fmt(grand),
    hsnRows: [
      { description: "996791 — Goods Transport Services", value: fmt(subtotal) },
      ...(sgst > 0 ? [{ description: "SGST @ 9%", value: fmt(sgst) }, { description: "CGST @ 9%", value: fmt(cgst) }] : []),
      ...(igst > 0 ? [{ description: "IGST @ 18%", value: fmt(igst) }] : []),
    ],
    hsnTotal: fmt(grand),
  };
}
