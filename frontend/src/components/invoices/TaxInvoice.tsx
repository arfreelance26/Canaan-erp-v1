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
}

export function TaxInvoice({ hsnRows, hsnTotal, ...props }: TaxInvoiceProps) {
  return (
    <InvoiceShell
      title="TAX INVOICE"
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
                <td>{row.description}</td>
                <td className={s.right}>{row.value}</td>
              </tr>
            ))}
            <tr className={s.hsnTotal}>
              <td className={s.bold}>TOTAL</td>
              <td className={`${s.right} ${s.bold}`}>{hsnTotal}</td>
            </tr>
          </tbody>
        </table>
      }
      {...props}
    />
  );
}
