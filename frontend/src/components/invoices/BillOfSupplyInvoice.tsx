"use client";

import { InvoiceShell, type ServiceItem } from "./InvoiceShell";
import s from "./invoice.module.css";

export type { ServiceItem };

export interface BillOfSupplyInvoiceProps {
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
  hsnRows: Array<{ hsn: string; taxableValue: string }>;
  hsnTotal: string;
  bankName: string;
  branchName: string;
  accountNumber: string;
  ifscCode: string;
  contactPerson: string;
  email: string;
  contact: string;
  narration: string;
}

export function BillOfSupplyInvoice({ hsnRows, hsnTotal, ...props }: BillOfSupplyInvoiceProps) {
  return (
    <InvoiceShell
      title="BILL OF SUPPLY"
      showGtaNote
      metaTableBorderless
      contactSignBordered
      {...props}
    />
  );
}
