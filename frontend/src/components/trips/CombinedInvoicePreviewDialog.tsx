"use client";

import { useRef, useEffect, useState } from "react";
import { CombinedInvoice } from "@/components/invoices/CombinedInvoice";
import { buildCombinedInvoice } from "@/lib/invoice-builder";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";
import type { Customer } from "@/types/customer";

type Props = {
  open: boolean;
  trips: Trip[];
  closures: Map<string, TripClosureData>;
  sheets: Map<string, TripSheetData>;
  customer: Customer | undefined;
  rawInvoices: Map<string, Record<string, unknown>>;
  autoDownload?: boolean;
  onClose: () => void;
};

/** Extract stylesheets that don't use oklch/lab (i.e. CSS modules, not Tailwind). */
function safeCSS(): string {
  return Array.from(document.styleSheets)
    .filter((ss) => {
      try {
        const text = Array.from(ss.cssRules).map((r) => r.cssText).join("");
        return !text.includes("oklch") && !text.includes("lab(");
      } catch {
        return false;
      }
    })
    .flatMap((ss) => {
      try { return Array.from(ss.cssRules).map((r) => r.cssText); }
      catch { return []; }
    })
    .join("\n");
}

export function CombinedInvoicePreviewDialog({
  open, trips, closures, sheets, customer, rawInvoices, autoDownload, onClose,
}: Props) {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (open && autoDownload) {
      const t = setTimeout(() => { void handleDownload(); }, 400);
      return () => clearTimeout(t);
    }
  }, [open, autoDownload]);

  const ready = open && trips.length > 0 && trips.every((t) => closures.has(t.id));
  if (!ready) return null;

  const props = buildCombinedInvoice(trips, closures, sheets, customer, rawInvoices);
  const filename = `CGI-${props.invoiceNo.replace(/\//g, "-")}-Combined.pdf`;

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

      const css = safeCSS();
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<base href="${window.location.origin}/" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>*,*::before,*::after{box-sizing:border-box}body{margin:0}${css}</style>
</head><body>${el.outerHTML}</body></html>`;

      blobURL = URL.createObjectURL(new Blob([html], { type: "text/html" }));

      iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:850px;height:4800px;border:none;";
      document.body.appendChild(iframe);

      await new Promise<void>((resolve, reject) => {
        iframe!.onload = () => resolve();
        iframe!.onerror = () => reject(new Error("iframe load failed"));
        iframe!.src = blobURL;
      });
      await new Promise((r) => setTimeout(r, 1200));

      const iframeDoc = iframe.contentDocument!;
      const targetEl = (iframeDoc.getElementById("invoice-a4-root") as HTMLElement) ?? iframeDoc.body;

      targetEl.style.margin = "0";
      targetEl.style.boxShadow = "none";

      const canvas = await html2canvas(targetEl, {
        scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;

      // A combined invoice is genuinely a multi-page document — unlike a single
      // trip's invoice, it's never squeezed onto one page; it's sliced across
      // as many A4 pages as the rendered content needs.
      let renderedH = 0;
      let first = true;
      while (renderedH < imgH) {
        if (!first) pdf.addPage();
        first = false;
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, -renderedH, pageW, imgH);
        renderedH += pageH;
      }

      pdf.save(filename);
    } catch (err) {
      void err;
    } finally {
      if (iframe) document.body.removeChild(iframe);
      if (blobURL) URL.revokeObjectURL(blobURL);
      setDownloading(false);
      if (autoDownload) onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700">
            Combined Invoice
          </span>
          <span className="text-sm text-gray-500">
            {trips.length} trips &nbsp;·&nbsp; Invoice <span className="font-semibold text-gray-800">{props.invoiceNo}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={handleDownload} disabled={downloading}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
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
          <button type="button" onClick={onClose} disabled={downloading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div ref={invoiceRef}>
          <CombinedInvoice {...props} />
        </div>
      </div>
    </div>
  );
}
