"use client";

import { type ReactNode } from "react";
import s from "./invoice.module.css";

const TERMS = [
  "Kindly make your payment by Cheque or DD or RTGS in favour of CANAAN GLOBAL INTERNATIONAL",
  "Outstation Cheques should include 1% banking charges.",
  "Administration fee of Rs. 5000 per cheque will be charged in case the cheque is dishonored.",
  "Interest @ 18% per annum will be charged on amount unpaid after one week.",
  "Dispute relating to this bill must be submitted to the contact person in writing within 3 days of receipt of this bill.",
  "All disputes are subject to Tuticorin Judicial Jurisdiction only. E. & O.E",
];

export interface ServiceItem {
  description: string;
  sacCode: string;
  qty: number;
  rate: string;
  gstRate?: string;
  total: string;
}

export interface InvoiceShellProps {
  // Variant flags
  title: string;
  showGtaNote?: boolean;
  metaTableBorderless?: boolean;
  contactSignBordered?: boolean;
  /** Transport Memo mode — hides Invoice No., Bill To, and SAC Code column from the PDF */
  isTransportMemo?: boolean;
  gstApplicable?: "Yes" | "No";
  igstApplicable?: "Yes" | "No";
  // Meta table
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
  // Service items
  serviceItems: ServiceItem[];
  subtotal: string;
  amountInWords: string;
  grandTotal: string;
  // HSN / tax table slot — each invoice type injects its own table here
  hsnSection?: ReactNode;
  // Bank details
  bankName: string;
  branchName: string;
  accountNumber: string;
  ifscCode: string;
  // Contact
  contactPerson: string;
  email: string;
  contact: string;
  narration: string;
}

function halfRate(rate: string): string {
  const r = parseFloat(rate);
  if (!r) return "—";
  const half = r / 2;
  return (Number.isInteger(half) ? String(half) : half.toFixed(1)) + "%";
}

export function InvoiceShell({
  title,
  showGtaNote,
  metaTableBorderless,
  contactSignBordered,
  isTransportMemo,
  gstApplicable,
  igstApplicable,
  invoiceNo,
  date,
  billToName,
  billToAddress,
  bookingNo,
  tripSheetNo,
  refNo,
  modeOfShipment,
  containerType,
  gstNumber,
  cfs,
  lineForwarder,
  vesselName,
  from,
  to,
  containerNo,
  consignee,
  serviceItems,
  subtotal,
  amountInWords,
  grandTotal,
  hsnSection,
  bankName,
  branchName,
  accountNumber,
  ifscCode,
  contactPerson,
  email,
  contact,
  narration,
}: InvoiceShellProps) {
  return (
    <div className={s.page}>
      <div className={s.a4} id="invoice-a4-root">

        {/* ── HEADER ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className={s.hdrName}>CANAAN GLOBAL INTERNATIONAL</div>
            <div className={s.hdrTagline}>COMMIT &nbsp;·&nbsp; ENDURE &nbsp;·&nbsp; ACHIEVE &nbsp;·&nbsp; SATISFY</div>
            <div className={s.hdrAddress}>
              3/802 - 124, Opposite Emmanuel Beliver Church, Zion Nagar, Theri Road, Puthukottai, Tuticorin - 628103.<br />
              Tel: 0461 2900886 &nbsp;&nbsp; Email: canaanglobal@canaanglobal.com
            </div>
            <div className={s.hdrGstin}>GSTIN: 33AAJFC9781F1Z8 &nbsp;&nbsp;&nbsp; PAN No: AAJFC9781F</div>
          </div>
          <div style={{ flexShrink: 0, marginLeft: "16px" }}>
            <img
              src="/companylogo.png"
              alt="Canaan Global Logo"
              style={{ height: "62px", width: "auto", objectFit: "contain" }}
            />
          </div>
        </div>

        {/* ── TITLE BAR ── */}
        <div className={s.titleBar}>{title}</div>

        {/* ── META TABLE ── */}
        <table
          className={s.metaTable}
          style={metaTableBorderless ? { borderBottom: "none" } : undefined}
        >
          <tbody>
            {isTransportMemo ? (
              <tr>
                <td colSpan={4}>
                  <span className={s.lbl}>Date</span>
                  <span className={s.val}>{date}</span>
                </td>
              </tr>
            ) : (
              <tr>
                <td style={{ width: "22%" }}>
                  <span className={s.lbl}>Invoice No.</span>
                  <span className={s.val}>{invoiceNo}</span>
                </td>
                <td style={{ width: "18%" }}>
                  <span className={s.lbl}>Date</span>
                  <span className={s.val}>{date}</span>
                </td>
                <td colSpan={2}>
                  <span className={s.lbl}>Bill To</span>
                  <span className={s.val}>{billToName}</span>
                  {billToAddress && (
                    <span className={s.valLight} style={{ fontSize: "10px" }}>{billToAddress}</span>
                  )}
                </td>
              </tr>
            )}
            <tr>
              <td colSpan={2}>
                <span className={s.lbl}>Booking &amp; Trip Sheet No.</span>
                <span className={s.val} style={{ fontSize: "10px", lineHeight: "1.5" }}>
                  {bookingNo}
                  {tripSheetNo && (
                    <>,<br />{tripSheetNo}</>
                  )}
                </span>
              </td>
              <td style={{ width: "20%" }}>
                <span className={s.lbl}>Ref. No.</span>
                <span className={s.val}>{refNo}</span>
              </td>
              <td style={{ width: "20%" }}>
                <span className={s.lbl}>Mode of Shipment</span>
                <span className={s.val}>{modeOfShipment}</span>
              </td>
            </tr>
            <tr>
              <td>
                <span className={s.lbl}>Container Type</span>
                <span className={s.val}>{containerType}</span>
              </td>
              <td>
                <span className={s.lbl}>GST Number</span>
                <span className={s.val}>{gstNumber}</span>
              </td>
              <td>
                <span className={s.lbl}>CFS</span>
                <span className={s.val}>{cfs || "—"}</span>
              </td>
              <td>
                <span className={s.lbl}>Line / Forwarder</span>
                <span className={s.val}>{lineForwarder || "NA"}</span>
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <span className={s.lbl}>Vessel Name &amp; Voyage</span>
                <span className={s.val}>{vesselName || "NA"}</span>
              </td>
              <td>
                <span className={s.lbl}>From</span>
                <span className={s.val}>{from}</span>
              </td>
              <td>
                <span className={s.lbl}>To</span>
                <span className={s.val}>{to}</span>
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <span className={s.lbl}>Container No. / Cargo</span>
                <span className={s.val}>{containerNo}</span>
              </td>
              <td colSpan={2}>
                <span className={s.lbl}>Consignee</span>
                <span className={s.val}>{consignee}</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── SERVICE LINE ITEMS ── */}
        {(() => {
          const isCgstSgst = !isTransportMemo && gstApplicable === "Yes";
          const isIgst     = !isTransportMemo && igstApplicable === "Yes";
          const descW      = isCgstSgst ? "34%" : isTransportMemo ? "55%" : "44%";
          // Total-row: blank colSpan covers every col except the last two (TOTAL label + amount)
          const blankSpan  = isTransportMemo ? 3 : isCgstSgst ? 5 : 4;
          return (
            <table className={s.itemsTable}>
              <thead>
                <tr>
                  <th style={{ width: descW }}>Description of Service</th>
                  {!isTransportMemo && <th style={{ width: "10%" }} className={s.center}>SAC Code</th>}
                  <th style={{ width: "6%" }}  className={s.center}>QTY</th>
                  <th style={{ width: "12%" }} className={s.right}>Rate (INR)</th>
                  {isCgstSgst ? (
                    <>
                      <th style={{ width: "8%" }} className={s.center}>CGST %</th>
                      <th style={{ width: "8%" }} className={s.center}>SGST %</th>
                    </>
                  ) : (
                    <th style={{ width: "10%" }} className={s.center}>
                      {isIgst ? "IGST %" : "GST %"}
                    </th>
                  )}
                  <th style={{ width: "16%" }} className={s.right}>Total (INR)</th>
                </tr>
              </thead>
              <tbody>
                {serviceItems.map((item, i) => (
                  <tr key={i}>
                    <td>{item.description}</td>
                    {!isTransportMemo && <td className={s.center}>{item.sacCode}</td>}
                    <td className={s.center}>{item.qty}</td>
                    <td className={s.right}>{item.rate}</td>
                    {isCgstSgst ? (
                      <>
                        <td className={s.center}>{item.gstRate ? halfRate(item.gstRate) : "—"}</td>
                        <td className={s.center}>{item.gstRate ? halfRate(item.gstRate) : "—"}</td>
                      </>
                    ) : (
                      <td className={s.center}>{item.gstRate ? `${item.gstRate}%` : "—"}</td>
                    )}
                    <td className={`${s.right} ${s.bold}`}>{item.total}</td>
                  </tr>
                ))}
                <tr className={s.totalRow}>
                  <td colSpan={blankSpan} style={{ border: "none", background: "transparent" }}></td>
                  <td className={`${s.right} ${s.bold}`} style={{ fontSize: "10px", letterSpacing: "0.3px" }}>TOTAL</td>
                  <td className={`${s.right} ${s.bold}`}>{subtotal}</td>
                </tr>
              </tbody>
            </table>
          );
        })()}

        {/* ── AMOUNT IN WORDS + GRAND TOTAL ── */}
        <div className={s.amountBar}>
          <div className={s.amountWords}>
            <span className={s.lbl}>Amount in Words:</span>
            <div className={s.val} style={{ marginTop: "2px" }}>{amountInWords}</div>
          </div>
          <div className={s.grandTotalBox}>
            <div className={s.gtLabel}>Grand Total</div>
            <div className={s.gtAmount}>&#8377; {grandTotal}</div>
          </div>
        </div>

        {/* ── HSN / TAX TABLE SLOT ── */}
        {hsnSection}

        {/* ── GST EXEMPTION NOTE ── */}
        {showGtaNote && (
          <p className={s.noteText}>
            Note: Services by way of transport of goods by a Goods Transport Agency (GTA) to another GTA is exempt under GST vide Notification No. 12/2017–Central Tax (Rate) dated 28.06.2017.
          </p>
        )}

        {/* ── BANK DETAILS + TERMS ── */}
        <div className={s.bankTerms}>
          <div className={s.bankBox}>
            <div className={s.bankRow}>
              <span className={s.bankLbl}>Bank Name:</span>
              <span className={s.bankVal}>{bankName}</span>
            </div>
            <div className={s.bankRow}>
              <span className={s.bankLbl}>Branch Name:</span>
              <span className={s.bankVal}>{branchName}</span>
            </div>
            <div className={s.bankRow}>
              <span className={s.bankLbl}>Account Number:</span>
              <span className={s.bankVal}>{accountNumber}</span>
            </div>
            <div className={s.bankRow}>
              <span className={s.bankLbl}>IFSC Code:</span>
              <span className={s.bankVal}>{ifscCode}</span>
            </div>
          </div>
          <div className={s.termsBox}>
            {TERMS.map((term, i) => (
              <div key={i} className={s.tItem} data-n={String(i + 1)}>{term}</div>
            ))}
          </div>
        </div>

        {/* ── CONTACT + SIGNATORY ── */}
        <div
          className={s.contactSign}
          style={contactSignBordered ? { marginTop: "10px", borderTop: "1px solid #c8c8c8" } : undefined}
        >
          <div className={s.contactBox}>
            <div className={s.bankRow}>
              <span className={s.bankLbl}>Contact Person:</span>
              <span className={s.bankVal}>{contactPerson}</span>
            </div>
            <div className={s.bankRow}>
              <span className={s.bankLbl}>Email:</span>
              <span className={s.bankVal}>{email}</span>
            </div>
            <div className={s.bankRow}>
              <span className={s.bankLbl}>Contact:</span>
              <span className={s.bankVal}>{contact}</span>
            </div>
            <div style={{ marginTop: "6px" }}>
              <span className={s.bankLbl}>Narration:</span>
              <div style={{ fontSize: "10px", fontWeight: 600, color: "#1a1a1a", marginTop: "2px", lineHeight: "1.4" }}>
                {narration}
              </div>
            </div>
          </div>
          <div className={s.signBox}>
            <div className={s.signFor}>for CANAAN GLOBAL INTERNATIONAL</div>
            <div style={{ textAlign: "right" }}>
              <div className={s.signLine}></div>
              <div className={s.signCaption}>Authorised Signatory</div>
              <div className={s.signNote}>This is a system generated invoice and does not require a signature.</div>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <p className={s.footerNote}>
          Please be advised that our dues are to be cleared within 45 days from billing to avoid disallowance u/s 43B(h) of the Income Tax Act, 1961 without prejudice to other consequences attached as per the MSMED Act 2006, CGST Act, 2017 and other laws prevailing in India.
        </p>

      </div>
    </div>
  );
}
