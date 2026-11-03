"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { RiEyeLine as Eye, RiFileExcel2Line as FileSpreadsheet, RiFileTextLine as FileText, RiLoader4Line as Loader2, RiCloseLine as X } from "@remixicon/react";
import { saveBlob } from "@/lib/api";
import { showError } from "@/lib/feedback";

import { EmptyState } from "@/components/ui/EmptyState";
export type PreviewSheet = { name: string; rows: string[][] };

type Props = {
  title: string;
  filename: string;
  blob: Blob;
  sheets: PreviewSheet[];
  onClose: () => void;
};

const PREVIEW_ROW_LIMIT = 200;
const PDF_ROW_LIMIT = 3000;

// Read-only preview of an export (same data the Excel file contains) with the
// choice to download it as Excel (the original file) or PDF (rendered here).
export function ExportPreviewDialog({ title, filename, blob, sheets, onClose }: Props) {
  const [active, setActive] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const sheet = sheets[active] ?? { name: "", rows: [] };
  const [header, ...body] = sheet.rows;
  const shown = useMemo(() => body.slice(0, PREVIEW_ROW_LIMIT), [body]);

  async function handlePdf() {
    if (!header || pdfBusy) return;
    setPdfBusy(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const cols = header.length;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: cols > 14 ? "a3" : "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const rowH = 6;
      const colW = (pageW - margin * 2) / cols;
      const fontSize = Math.max(4.5, Math.min(8, 9 - cols * 0.25));
      const fit = (text: string) => {
        const lines = pdf.splitTextToSize(text, colW - 2) as string[];
        return lines.length > 1 || (lines[0] ?? "") !== text ? `${(lines[0] ?? "").slice(0, -1)}…` : text;
      };

      const drawHeader = (y: number) => {
        pdf.setFillColor(27, 43, 94);
        pdf.rect(margin, y, pageW - margin * 2, rowH + 1, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(fontSize);
        pdf.setTextColor(255, 255, 255);
        header.forEach((h, i) => pdf.text(fit(h.toUpperCase()), margin + i * colW + 1, y + 4.5));
        return y + rowH + 1;
      };

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(27, 43, 94);
      pdf.text(title, margin, 12);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      const rowsForPdf = body.slice(0, PDF_ROW_LIMIT);
      pdf.text(
        `${sheet.name} · ${body.length} row${body.length === 1 ? "" : "s"}${body.length > PDF_ROW_LIMIT ? ` (first ${PDF_ROW_LIMIT} shown)` : ""}`,
        margin,
        17,
      );

      let y = drawHeader(21);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fontSize);
      rowsForPdf.forEach((row, r) => {
        if (y + rowH > pageH - margin) {
          pdf.addPage();
          y = drawHeader(margin);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(fontSize);
        }
        if (r % 2 === 1) {
          pdf.setFillColor(245, 247, 250);
          pdf.rect(margin, y, pageW - margin * 2, rowH, "F");
        }
        pdf.setTextColor(30, 30, 30);
        row.forEach((cell, i) => pdf.text(fit(cell ?? ""), margin + i * colW + 1, y + 4.2));
        y += rowH;
      });

      pdf.save(`${filename.replace(/\.xlsx$/i, "")}.pdf`);
    } catch {
      showError("Failed to generate PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-scrim/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[90vh] w-full max-w-6xl animate-modal-in flex-col overflow-hidden rounded-2xl bg-background-primary-default shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-separator-border px-6 py-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
              <Eye className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-title-3-semibold tracking-tight text-text-primary">{title}</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                {body.length.toLocaleString("en-IN")} row{body.length === 1 ? "" : "s"}
                {header ? ` · ${header.length} column${header.length === 1 ? "" : "s"}` : ""}
                {body.length > PREVIEW_ROW_LIMIT && ` · showing the first ${PREVIEW_ROW_LIMIT}`}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1 text-text-tertiary transition-colors hover:text-text-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sheet tabs */}
        {sheets.length > 1 && (
          <div className="flex shrink-0 flex-wrap gap-2 border-b px-5 py-2.5">
            {sheets.map((s, i) => (
              <button
                key={s.name + i}
                type="button"
                onClick={() => setActive(i)}
                className={`rounded-full px-3 py-1 text-caption-1-semibold transition-colors ${
                  i === active ? "bg-accent-solid text-on-solid" : "border border-separator-border bg-background-primary-default text-text-secondary hover:bg-fill-2"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="flex min-h-0 flex-1 flex-col bg-fill-1 p-4">
          {!header || body.length === 0 ? (
            <EmptyState size="compact" illustration="no-data" title="Nothing to export" description="No data matches the current selection" className="rounded-2xl border border-separator-border bg-background-primary-default" />
          ) : (
            <div className="custom-scrollbar min-h-0 flex-1 overflow-auto rounded-xl border border-separator-border bg-background-primary-default">
              <table className="w-full whitespace-nowrap text-left text-sm">
                <thead className="sticky top-0 z-10 bg-fill-1">
                  <tr className="border-b border-separator-border">
                    {header.map((h, i) => (
                      <th key={i} className="px-4 py-3 text-caption-2-semibold text-text-secondary">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-separator-border">
                  {shown.map((row, r) => (
                    <tr key={r} className="odd:bg-background-primary-default even:bg-fill-1 hover:bg-accent-surface-strong/40">
                      {header.map((_, c) => {
                        const v = row[c] ?? "";
                        return (
                          <td key={c} className={`px-4 py-2.5 ${v === "" ? "text-text-tertiary" : "text-text-primary"}`}>
                            {v === "" ? (row.some(Boolean) ? "—" : "") : v}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-separator-border px-6 py-3.5">
          <p className="text-xs text-text-tertiary">Downloads include every row{sheets.length > 1 ? " and sheet" : ""}.</p>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => saveBlob(blob, filename)}
            className="flex items-center gap-2 rounded-full border border-success-border bg-success-surface px-4 py-2 text-body-semibold text-success-text transition duration-200 hover:bg-success-surface-strong hover:shadow-sm"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Download Excel
          </button>
          <button
            type="button"
            onClick={handlePdf}
            disabled={pdfBusy || !header || body.length === 0}
            className="flex items-center gap-2 rounded-full border border-danger-border bg-danger-surface px-4 py-2 text-body-semibold text-danger-text transition duration-200 hover:bg-danger-surface-strong hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {pdfBusy ? "Generating..." : "Download PDF"}
          </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
