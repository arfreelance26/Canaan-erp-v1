"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import { saveBlob } from "@/lib/api";
import { showError } from "@/lib/swal";

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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[90vh] w-full max-w-6xl animate-dialog-enter flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
              <Eye className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold tracking-tight text-gray-900">{title}</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {body.length.toLocaleString("en-IN")} row{body.length === 1 ? "" : "s"}
                {header ? ` · ${header.length} column${header.length === 1 ? "" : "s"}` : ""}
                {body.length > PREVIEW_ROW_LIMIT && ` · showing the first ${PREVIEW_ROW_LIMIT}`}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:text-gray-600">
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
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  i === active ? "bg-blue-600 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="flex min-h-0 flex-1 flex-col bg-gray-50/60 p-4">
          {!header || body.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                <FileSpreadsheet className="h-5 w-5 text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600">Nothing to export</p>
              <p className="mt-1 text-xs text-gray-400">No data matches the current selection.</p>
            </div>
          ) : (
            <div className="custom-scrollbar min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full whitespace-nowrap text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="border-b border-gray-200">
                    {header.map((h, i) => (
                      <th key={i} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shown.map((row, r) => (
                    <tr key={r} className="odd:bg-white even:bg-gray-50/50 hover:bg-blue-50/40">
                      {header.map((_, c) => {
                        const v = row[c] ?? "";
                        return (
                          <td key={c} className={`px-4 py-2.5 ${v === "" ? "text-gray-300" : "text-gray-700"}`}>
                            {v === "" ? "—" : v}
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
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-6 py-3.5">
          <p className="text-xs text-gray-400">Downloads include every row{sheets.length > 1 ? " and sheet" : ""}.</p>
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => saveBlob(blob, filename)}
            className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-sm"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Download Excel
          </button>
          <button
            type="button"
            onClick={handlePdf}
            disabled={pdfBusy || !header || body.length === 0}
            className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-100 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
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
