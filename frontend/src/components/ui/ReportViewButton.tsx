"use client";

import { useEffect, useState } from "react";
import { RiEyeLine as Eye, RiLoader4Line as Loader2 } from "@remixicon/react";
import { fetchExcel, fetchReportPreview } from "@/lib/api";
import { problemFromMessage, reportProblem } from "@/lib/connection-problem";
import { showError } from "@/lib/feedback";
import { ExportPreviewDialog, type PreviewSheet } from "@/components/ui/ExportPreviewDialog";

/**
 * "View" for a designed report (like Profitability's): the server builds the
 * Excel (`path`) and, at `path + "/preview"`, its sheets with the formulas
 * worked out plus the figures behind them. The preview's Download PDF draws
 * the report's own PDF from those figures (`pdf`), not the sheet on screen.
 * Looks and behaves like DownloadExcelButton, so page tours find it the same way.
 */
type Props<T> = {
  /** e.g. "/exports/maintenance-report" — its preview is `${path}/preview`. */
  path: string;
  params?: Record<string, string>;
  /** Used if the server doesn't send a filename. */
  filename: string;
  /** Heading for the preview. */
  title: string;
  /** Draws and saves the PDF from the report figures. */
  pdf: (report: T, filename: string) => Promise<void>;
  className?: string;
};

const SLOW_AFTER_MS = 15_000;
const VIEW_CLASS =
  "flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50";

export function ReportViewButton<T>({ path, params, filename, title, pdf, className }: Props<T>) {
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [open, setOpen] = useState<{ blob: Blob; filename: string; sheets: PreviewSheet[]; report: T } | null>(null);
  const qs = params && Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : "";

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => { clearTimeout(timer); setSlow(false); };
  }, [loading]);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const [file, preview] = await Promise.all([
        fetchExcel(`${path}${qs}`, filename),
        fetchReportPreview<T>(`${path}/preview${qs}`),
      ]);
      setOpen({ blob: file.blob, filename: file.filename || preview.filename, sheets: preview.sheets, report: preview.report });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not prepare the report.";
      const problem = problemFromMessage(message);
      if (problem) reportProblem({ ...problem, onRetry: handleClick });
      else showError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" data-tour="page-export" onClick={handleClick} disabled={loading} className={className ?? VIEW_CLASS}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
        {loading ? (slow ? "Still preparing, this is a large report" : "Preparing…") : "View"}
      </button>
      {open && (
        <ExportPreviewDialog
          title={title}
          filename={open.filename}
          blob={open.blob}
          sheets={open.sheets}
          onClose={() => setOpen(null)}
          onPdf={() => pdf(open.report, open.filename)}
        />
      )}
    </>
  );
}
