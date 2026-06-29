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
      hsnSection={
        <table className={s.hsnTable}>
          <thead>
            <tr>
              <th style={{ width: "75%" }}>HSN/SAC</th>
              <th className={s.right}>Taxable Value</th>
            </tr>
          </thead>
          <tbody>
            {hsnRows.map((row, i) => (
              <tr key={i}>
                <td>{row.hsn}</td>
                <td className={s.right}>{row.taxableValue}</td>
              </tr>
            ))}
            <tr className={s.hsnTotal}>
              <td className={s.right} style={{ fontSize: "10px", letterSpacing: "0.3px" }}>TOTAL</td>
              <td className={s.right}>{hsnTotal}</td>
            </tr>
          </tbody>
        </table>
      }
      {...props}
    />
  );
}
