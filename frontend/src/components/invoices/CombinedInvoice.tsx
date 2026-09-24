"use client";

import type { CombinedInvoiceProps } from "@/lib/invoice-builder";
import s from "./invoice.module.css";

const TERMS = [
  "Kindly make your payment by Cheque or DD or RTGS in favour of CANAAN GLOBAL INTERNATIONAL",
  "Outstation Cheques should include 1% banking charges.",
  "Administration fee of Rs. 5000 per cheque will be charged in case the cheque is dishonored.",
  "Interest @ 18% per annum will be charged on amount unpaid after one week.",
  "Dispute relating to this bill must be submitted to the contact person in writing within 3 days of receipt of this bill.",
  "All disputes are subject to Tuticorin Judicial Jurisdiction only. E. & O.E",
];

function halfRate(rate: string): string {
  const r = parseFloat(rate);
  if (!r) return "—";
  const half = r / 2;
  return (Number.isInteger(half) ? String(half) : half.toFixed(1)) + "%";
}

function fmtAmt(v: number): string {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CombinedInvoice({
  invoiceNo, date, billToName, billToAddress, gstNumber, isTransportMemo,
  sections, grandTotal, amountInWords, hsnRows, bankName, branchName,
  accountNumber, ifscCode, contactPerson, email, contact,
  gstApplicable, igstApplicable,
}: CombinedInvoiceProps) {
  const isCgstSgst = !isTransportMemo && gstApplicable === "Yes";
  const isIgst     = !isTransportMemo && igstApplicable === "Yes";
  const descW      = isCgstSgst ? "32%" : isTransportMemo ? "52%" : "42%";
  const blankSpan  = isTransportMemo ? 3 : isCgstSgst ? 5 : 4;

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
        <div className={s.titleBar}>
          {isTransportMemo ? "TRANSPORT MEMO" : gstApplicable === "Yes" || igstApplicable === "Yes" ? "TAX INVOICE" : "BILL OF SUPPLY"}
          {" — COMBINED "}({sections.length} TRIPS)
        </div>

        {/* ── DOCUMENT-LEVEL META ── */}
        <table className={s.metaTable}>
          <tbody>
            {isTransportMemo ? (
              <tr>
                <td colSpan={2}>
                  <span className={s.lbl}>Date</span>
                  <span className={s.val}>{date}</span>
                </td>
                <td colSpan={2}>
                  <span className={s.lbl}>Trips Covered</span>
                  <span className={s.val}>{sections.length}</span>
                </td>
              </tr>
            ) : (
              <>
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
                <tr>
                  <td>
                    <span className={s.lbl}>GST Number</span>
                    <span className={s.val}>{gstNumber || "—"}</span>
                  </td>
                  <td colSpan={3}>
                    <span className={s.lbl}>Trips Covered</span>
                    <span className={s.val}>{sections.length} trips — {sections.map((sec) => sec.tripId).join(", ")}</span>
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        {/* ── PER-TRIP SECTIONS ── */}
        {sections.map((sec, idx) => (
          <div key={idx}>
            <div className={s.tripSectionHeader}>
              Trip {idx + 1} of {sections.length} &nbsp;·&nbsp; {sec.tripId}
              {sec.bookingNo && <>&nbsp;·&nbsp; Booking {sec.bookingNo}</>}
              {sec.tripSheetNo && <>&nbsp;·&nbsp; Sheet {sec.tripSheetNo}</>}
            </div>

            <table className={s.metaTable} style={{ borderTop: "none" }}>
              <tbody>
                <tr>
                  <td colSpan={2}>
                    <span className={s.lbl}>Ref. No.</span>
                    <span className={s.val}>{sec.refNo || "—"}</span>
                  </td>
                  <td>
                    <span className={s.lbl}>Mode of Shipment</span>
                    <span className={s.val}>{sec.modeOfShipment || "—"}</span>
                  </td>
                  <td>
                    <span className={s.lbl}>Container Type</span>
                    <span className={s.val}>{sec.containerType || "—"}</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className={s.lbl}>CFS</span>
                    <span className={s.val}>{sec.cfs || "—"}</span>
                  </td>
                  <td>
                    <span className={s.lbl}>Line / Forwarder</span>
                    <span className={s.val}>{sec.lineForwarder || "NA"}</span>
                  </td>
                  <td>
                    <span className={s.lbl}>From</span>
                    <span className={s.val}>{sec.from}</span>
                  </td>
                  <td>
                    <span className={s.lbl}>To</span>
                    <span className={s.val}>{sec.to}</span>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2}>
                    <span className={s.lbl}>Container No. / Cargo</span>
                    <span className={s.val}>{sec.containerNo}</span>
                  </td>
                  <td colSpan={2}>
                    <span className={s.lbl}>Consignee</span>
                    <span className={s.val}>{sec.consignee}</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <table className={s.itemsTable} style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: descW }}>Description of Service</th>
                  {!isTransportMemo && <th style={{ width: "9%" }} className={s.center}>SAC Code</th>}
                  <th style={{ width: "6%" }}  className={s.center}>QTY</th>
                  <th style={{ width: "11%" }} className={s.right}>Rate (INR)</th>
                  {isCgstSgst ? (
                    <>
                      <th style={{ width: "8%" }} className={s.center}>CGST %</th>
                      <th style={{ width: "8%" }} className={s.center}>SGST %</th>
                    </>
                  ) : (
                    <th style={{ width: "9%" }} className={s.center}>{isIgst ? "IGST %" : "GST %"}</th>
                  )}
                  <th style={{ width: "15%" }} className={s.right}>Total (INR)</th>
                </tr>
              </thead>
              <tbody>
                {sec.serviceItems.map((item, i) => (
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
                <tr className={s.tripSubtotalRow}>
                  <td colSpan={blankSpan} style={{ border: "none", background: "transparent" }}></td>
                  <td className={s.right}>Sub Total</td>
                  <td className={s.right}>&#8377; {sec.tripSubtotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}

        {/* ── AMOUNT IN WORDS + GRAND TOTAL ── */}
        <div className={s.amountBar} style={{ marginTop: "10px" }}>
          <div className={s.amountWords}>
            <span className={s.lbl}>Amount in Words:</span>
            <div className={s.val} style={{ marginTop: "2px" }}>{amountInWords}</div>
          </div>
          <div className={s.grandTotalBox}>
            <div className={s.gtLabel}>Grand Total ({sections.length} Trips)</div>
            <div className={s.gtAmount}>&#8377; {grandTotal}</div>
          </div>
        </div>

        {/* ── HSN / TAX TABLE (Bill of Supply / Tax Invoice only) ── */}
        {!isTransportMemo && (
          <table className={s.hsnTable}>
            <thead>
              <tr>
                <th style={{ width: "70%" }}>Description</th>
                <th className={s.right}>Value (INR)</th>
              </tr>
            </thead>
            <tbody>
              {hsnRows.map((row, i) => (
                <tr key={i}>
                  <td>{row.description}</td>
                  <td className={s.right}>&#8377; {row.value}</td>
                </tr>
              ))}
              <tr className={s.hsnTotal}>
                <td>Total</td>
                <td className={s.right}>&#8377; {grandTotal}</td>
              </tr>
            </tbody>
          </table>
        )}

        {!isTransportMemo && gstApplicable !== "Yes" && igstApplicable !== "Yes" && (
          <p className={s.noteText}>
            Note: Services by way of transport of goods by a Goods Transport Agency (GTA) to another GTA is exempt under GST vide Notification No. 12/2017–Central Tax (Rate) dated 28.06.2017.
          </p>
        )}

        {/* ── BANK DETAILS + TERMS (not on Transport Memo) ── */}
        {!isTransportMemo && (
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
        )}

        {/* ── CONTACT + SIGNATORY (not on Transport Memo) ── */}
        {!isTransportMemo && (
          <div className={s.contactSign} style={{ marginTop: "10px", borderTop: "1px solid #c8c8c8" }}>
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
        )}

        {/* ── FOOTER (not on Transport Memo) ── */}
        {!isTransportMemo && (
          <p className={s.footerNote}>
            Please be advised that our dues are to be cleared within 45 days from billing to avoid disallowance u/s 43B(h) of the Income Tax Act, 1961 without prejudice to other consequences attached as per the MSMED Act 2006, CGST Act, 2017 and other laws prevailing in India.
          </p>
        )}

      </div>
    </div>
  );
}
