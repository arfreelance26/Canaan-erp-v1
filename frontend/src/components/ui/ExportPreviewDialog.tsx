"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
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
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div>
            <p className="font-semibold text-gray-900">{title}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Preview · {body.length} row{body.length === 1 ? "" : "s"}
              {body.length > PREVIEW_ROW_LIMIT && ` (showing first ${PREVIEW_ROW_LIMIT} — the downloads contain everything)`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
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
        <div className="min-h-0 flex-1 overflow-auto">
          {!header || body.length === 0 ? (
            <p className="px-5 py-16 text-center text-sm text-gray-400">No data to export for the current selection.</p>
          ) : (
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="border-b border-gray-200">
                  {header.map((h, i) => (
                    <th key={i} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((row, r) => (
                  <tr key={r} className="hover:bg-gray-50">
                    {header.map((_, c) => (
                      <td key={c} className="px-4 py-2 text-gray-700">{row[c] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3">
          <button
            type="button"
            onClick={() => saveBlob(blob, filename)}
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Download Excel
          </button>
          <button
            type="button"
            onClick={handlePdf}
            disabled={pdfBusy || !header || body.length === 0}
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {pdfBusy ? "Generating..." : "Download PDF"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
