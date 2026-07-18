"use client";

import { useRef, useEffect, useState } from "react";
import { BillOfSupplyInvoice } from "@/components/invoices/BillOfSupplyInvoice";
import { TransportMemoInvoice } from "@/components/invoices/TransportMemoInvoice";
import { TaxInvoice } from "@/components/invoices/TaxInvoice";
import { buildBillOfSupply, buildTransportMemo, buildTaxInvoice } from "@/lib/invoice-builder";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";
import type { Customer } from "@/types/customer";
import type { InvoiceType } from "./GenerateInvoiceDialog";

type Props = {
  open: boolean;
  invoiceType: InvoiceType;
  trip: Trip | null;
  closure: TripClosureData | null;
  sheet: TripSheetData | undefined;
  customer: Customer | undefined;
  autoDownload?: boolean;
  onClose: () => void;
  savedInvoice?: Record<string, any>;
};

/** Extract stylesheets that don't use oklch/lab (i.e. CSS modules, not Tailwind). */
function safeCSS(): string {
  return Array.from(document.styleSheets)
    .filter((ss) => {
      try {
        const text = Array.from(ss.cssRules).map((r) => r.cssText).join("");
        return !text.includes("oklch") && !text.includes("lab(");
      } catch {
        return false; // cross-origin — skip
      }
    })
    .flatMap((ss) => {
      try { return Array.from(ss.cssRules).map((r) => r.cssText); }
      catch { return []; }
    })
    .join("\n");
}

export function InvoicePreviewDialog({
  open, invoiceType, trip, closure, sheet, customer, autoDownload, onClose, savedInvoice
}: Props) {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (open && autoDownload) {
      const t = setTimeout(() => { void handleDownload(); }, 400);
      return () => clearTimeout(t);
    }
   
  }, [open, autoDownload]);

  if (!open || !trip || !closure) return null;

  const filename = `CGI-${trip.bookingReferenceNo}-${invoiceType.replace(/\s+/g, "-")}.pdf`;

  async function handleDownload() {
    const el = invoiceRef.current;
    if (!el || downloading) return;
    setDownloading(true);

    let iframe: HTMLIFrameElement | null = null;
    let blobURL = "";

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      // Build an isolated HTML document using only CSS module styles (no Tailwind oklch/lab)
      const css = safeCSS();
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<base href="${window.location.origin}/" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*,*::before,*::after{box-sizing:border-box}body{margin:0}${css}</style>
</head><body>${el.outerHTML}</body></html>`;

      blobURL = URL.createObjectURL(new Blob([html], { type: "text/html" }));

      iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:850px;height:2400px;border:none;";
      document.body.appendChild(iframe);

      // Wait for iframe + fonts to load
      await new Promise<void>((resolve, reject) => {
        iframe!.onload = () => resolve();
        iframe!.onerror = () => reject(new Error("iframe load failed"));
        iframe!.src = blobURL;
      });
      await new Promise((r) => setTimeout(r, 1200));

      const iframeDoc = iframe.contentDocument!;
      // Target only the .a4 element so html2canvas captures the invoice content
      // and not the blank space that fills the rest of the 2400px-tall iframe body.
      const targetEl = (iframeDoc.getElementById("invoice-a4-root") as HTMLElement) ?? iframeDoc.body;
      
      // Strip margin and shadow so html2canvas strictly captures the 794px width without extra space
      targetEl.style.margin = "0";
      targetEl.style.boxShadow = "none";

      const canvas = await html2canvas(targetEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH  = (canvas.height * pageW) / canvas.width;

      if (imgH <= pageH) {
        // Fits perfectly on one page without scaling down
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pageW, imgH);
      } else {
        // Too tall! Scale both width and height proportionally to fit exactly onto one A4 page
        const scaleFactor = pageH / imgH;
        const newW = pageW * scaleFactor;
        const newH = imgH * scaleFactor;
        // Center it horizontally
        const xOffset = (pageW - newW) / 2;
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", xOffset, 0, newW, newH);
      }

      pdf.save(filename);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      if (iframe) document.body.removeChild(iframe);
      if (blobURL) URL.revokeObjectURL(blobURL);
      setDownloading(false);
      if (autoDownload) onClose();
    }
  }

  const invoiceNode =
    invoiceType === "Bill of Supply" ? (
      <BillOfSupplyInvoice {...buildBillOfSupply(trip, closure, sheet, customer, savedInvoice)} />
    ) : invoiceType === "Transport Memo" ? (
      <TransportMemoInvoice {...buildTransportMemo(trip, closure, sheet, customer, savedInvoice)} />
    ) : (
      <TaxInvoice {...buildTaxInvoice(trip, closure, sheet, customer, savedInvoice)} />
    );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm">

      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700">
            {invoiceType}
          </span>
          <span className="text-sm text-gray-500">
            Trip <span className="font-semibold text-gray-800">{trip.tripId}</span>
            &nbsp;·&nbsp;
            Booking <span className="font-semibold text-gray-800">{trip.bookingReferenceNo}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {downloading ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={downloading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>

      {/* Invoice preview */}
      <div className="flex-1 overflow-y-auto">
        <div ref={invoiceRef}>
          {invoiceNode}
        </div>
      </div>

    </div>
  );
}
