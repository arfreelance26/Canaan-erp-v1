"use client";

import { InvoiceShell, type ServiceItem } from "./InvoiceShell";

export type { ServiceItem };

export interface TransportMemoInvoiceProps {
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
  bankName: string;
  branchName: string;
  accountNumber: string;
  ifscCode: string;
  contactPerson: string;
  email: string;
  contact: string;
  narration: string;
}

export function TransportMemoInvoice(props: TransportMemoInvoiceProps) {
  return <InvoiceShell title="TRANSPORT MEMO" showGtaNote {...props} />;
}
