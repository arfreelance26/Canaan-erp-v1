"use client";

import { InvoiceShell, type ServiceItem } from "./InvoiceShell";
import s from "./invoice.module.css";

export type { ServiceItem };

export interface TaxInvoiceProps {
  invoiceNo: string;
  date: string;
  billToName: string;
  billToAddress?: string;
  bookingNo: string;
  tripSheetNo: string;
  refNo: string;
  modeOfShipment: string;
  containerType: string;
  gstNumber: string;
  cfs?: string;
  lineForwarder?: string;
  vesselName?: string;
  from: string;
  to: string;
  containerNo: string;
  consignee: string;
  serviceItems: ServiceItem[];
  subtotal: string;
  amountInWords: string;
  grandTotal: string;
  hsnRows: Array<{ description: string; value: string }>;
  hsnTotal: string;
  bankName: string;
  branchName: string;
  accountNumber: string;
  ifscCode: string;
  contactPerson: string;
  email: string;
  contact: string;
  narration: string;
  gstApplicable?: "Yes" | "No";
  igstApplicable?: "Yes" | "No";
}

export function TaxInvoice({ hsnRows, hsnTotal, ...props }: TaxInvoiceProps) {
  return (
    <InvoiceShell
      title="TAX INVOICE"
      {...props}
    />
  );
}
