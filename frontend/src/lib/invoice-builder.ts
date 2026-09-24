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

// Grand Total rounded half-DOWN to the nearest rupee (fraction > 0.5 rounds up,
// fraction <= 0.5 rounds down). e.g. 46,020.60 → 46,021 ; 46,020.50 → 46,020.
function roundGrandTotal(x: number): number {
  const cents = Math.round(x * 100) / 100;
  return Math.ceil(cents - 0.5);
}

function fmtInt(v: number): string {
  return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
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
        gstAmount: gst,
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
  const grandRounded = roundGrandTotal(grand);
  return {
    ...commonFields(trip, closure, sheet, customer, invoice),
    subtotal: fmt(grand),
    grandTotal: fmtInt(grandRounded),
    amountInWords: amountToWords(String(grandRounded)),
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
    grandTotal: fmtInt(roundGrandTotal(subtotal)),
    amountInWords: amountToWords(String(roundGrandTotal(subtotal))),
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

// ── Combined invoice (multiple trips, one customer, one invoice number) ────

export interface CombinedInvoiceTripSection {
  tripId: string;
  bookingNo: string;
  tripSheetNo: string;
  refNo: string;
  modeOfShipment: string;
  containerType: string;
  cfs?: string;
  lineForwarder?: string;
  vesselName?: string;
  from: string;
  to: string;
  containerNo: string;
  consignee: string;
  narration: string;
  serviceItems: ServiceItem[];
  tripSubtotal: string;
}

export interface CombinedInvoiceProps {
  invoiceNo: string;
  date: string;
  billToName: string;
  billToAddress?: string;
  gstNumber: string;
  isTransportMemo: boolean;
  sections: CombinedInvoiceTripSection[];
  grandTotal: string;
  amountInWords: string;
  hsnRows: Array<{ description: string; value: string }>;
  hsnTotal: string;
  bankName: string;
  branchName: string;
  accountNumber: string;
  ifscCode: string;
  contactPerson: string;
  email: string;
  contact: string;
  gstApplicable?: "Yes" | "No";
  igstApplicable?: "Yes" | "No";
}

// Each trip in a combined group is a full, independent TripInvoice row that
// happens to share invoice_no with its siblings (see backend generate_combined_invoice) —
// so per-trip fields (route, container, service lines) come straight from that
// trip's own row, while document-level fields (bill to, GST, bank, contact) are
// read once off the first trip's row, since the create flow wrote the same
// values onto every row in the group.
export function buildCombinedInvoice(
  trips: Trip[],
  closures: Map<string, TripClosureData>,
  sheets: Map<string, TripSheetData>,
  customer: Customer | undefined,
  rawInvoices: Map<string, Record<string, any>>,
): CombinedInvoiceProps {
  const first = trips[0] ? rawInvoices.get(trips[0].id) : undefined;
  const invoiceType = (first?.invoice_type ?? "Tax Invoice") as string;
  const isTransportMemo = invoiceType === "Transport Memo";
  const gstApplicable  = (first?.gst_applicable  ?? "No") as "Yes" | "No";
  const igstApplicable = (first?.igst_applicable ?? "No") as "Yes" | "No";

  let combinedSubtotal = 0;
  let combinedGst = 0;

  const sections: CombinedInvoiceTripSection[] = trips.map((trip) => {
    const closure = closures.get(trip.id) ?? ({} as TripClosureData);
    const sheet = sheets.get(trip.id);
    const invoice = rawInvoices.get(trip.id);
    const common = commonFields(trip, closure, sheet, customer, invoice);
    const { subtotal, gstTotal } = invoice?.services?.length
      ? computeServiceTotals(invoice.services)
      : { subtotal: n(closure.billingAmount) || n(closure.hireAmount), gstTotal: 0 };
    combinedSubtotal += subtotal;
    combinedGst += gstTotal;
    return {
      tripId: trip.tripId,
      bookingNo: common.bookingNo,
      tripSheetNo: common.tripSheetNo,
      refNo: common.refNo,
      modeOfShipment: common.modeOfShipment,
      containerType: common.containerType,
      cfs: common.cfs,
      lineForwarder: common.lineForwarder,
      vesselName: common.vesselName,
      from: common.from,
      to: common.to,
      containerNo: common.containerNo,
      consignee: common.consignee,
      narration: common.narration,
      serviceItems: common.serviceItems,
      tripSubtotal: fmt(subtotal + gstTotal),
    };
  });

  const sgst = gstApplicable === "Yes" ? parseFloat((combinedGst / 2).toFixed(2)) : 0;
  const cgst = gstApplicable === "Yes" ? parseFloat((combinedGst / 2).toFixed(2)) : 0;
  const igst = igstApplicable === "Yes" ? combinedGst : 0;
  const taxedTotal = combinedSubtotal + (gstApplicable === "Yes" ? sgst + cgst : igstApplicable === "Yes" ? igst : isTransportMemo ? 0 : combinedGst);
  const grandRounded = roundGrandTotal(isTransportMemo ? combinedSubtotal : taxedTotal);

  return {
    invoiceNo: (first?.invoice_no as string) ?? "",
    date: fmtDate((first?.invoice_date as string) || new Date().toISOString().slice(0, 10)),
    billToName: (first?.bill_to as string) || customer?.name || "",
    billToAddress: customer?.address,
    gstNumber: (first?.gst_number as string) || customer?.gstin || "",
    isTransportMemo,
    sections,
    grandTotal: fmtInt(grandRounded),
    amountInWords: amountToWords(String(grandRounded)),
    hsnRows: [
      { description: "996791 — Goods Transport Services", value: fmt(combinedSubtotal) },
      ...(sgst > 0 ? [{ description: "SGST @ 9%", value: fmt(sgst) }, { description: "CGST @ 9%", value: fmt(cgst) }] : []),
      ...(igst > 0 ? [{ description: "IGST @ 18%", value: fmt(igst) }] : []),
    ],
    hsnTotal: fmt(taxedTotal),
    bankName:      (first?.bank_name as string)      || "HDFC - 9181 - Shipping",
    branchName:    (first?.branch_name as string)     || "TUTICORIN",
    accountNumber: (first?.account_number as string)  || "50200037439181",
    ifscCode:      (first?.ifsc_code as string)        || "HDFC0001104",
    contactPerson: (first?.contact_person as string)   || "S SUNDER",
    email:         (first?.email as string)             || "tutfin@canaanglobal.com",
    contact:       (first?.contact as string)            || "9047015423",
    gstApplicable,
    igstApplicable,
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
  const grandRounded = roundGrandTotal(grand);

  return {
    ...commonFields(trip, closure, sheet, customer, invoice),
    subtotal: fmt(grand),
    amountInWords: amountToWords(String(grandRounded)),
    grandTotal:    fmtInt(grandRounded),
    hsnRows: [
      { description: "996791 — Goods Transport Services", value: fmt(subtotal) },
      ...(sgst > 0 ? [{ description: "SGST @ 9%", value: fmt(sgst) }, { description: "CGST @ 9%", value: fmt(cgst) }] : []),
      ...(igst > 0 ? [{ description: "IGST @ 18%", value: fmt(igst) }] : []),
    ],
    hsnTotal: fmt(grand),
  };
}
