"use client";

import { useEffect, useState } from "react";
import { RiEyeLine as Eye, RiFileExcel2Line as FileSpreadsheet, RiLoader4Line as Loader2 } from "@remixicon/react";
import { downloadExcel, fetchExcel } from "@/lib/api";
import { problemFromMessage, reportProblem } from "@/lib/connection-problem";
import { showError } from "@/lib/feedback";
import { ExportPreviewDialog, type PreviewSheet } from "@/components/ui/ExportPreviewDialog";

type Props = {
  /** The export endpoint path, e.g. "/exports/drivers". */
  path: string;
  /** Filename to use if the server doesn't send one. */
  filename: string;
  /** Label for the direct-download button (`direct` mode only). */
  label?: string;
  className?: string;
  /** Optional query parameters appended to path before fetching. */
  params?: Record<string, string>;
  /**
   * By default the button reads "View" and opens a preview of the export with
   * Download Excel / Download PDF inside. Set `direct` to download the Excel
   * file straight away (used where a preview is already on screen).
   */
  direct?: boolean;
  /** Heading for the preview (and the PDF). Defaults to a tidied-up filename. */
  title?: string;
};

const SLOW_AFTER_MS = 15_000;

const VIEW_CLASS =
  "flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50";
const DIRECT_CLASS =
  "flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-success-border bg-background-primary-default px-4 text-body-medium text-success-text shadow-sm transition duration-300 hover:bg-success-surface-strong hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50";

/** "maintenance_records_TN69AP3350.xlsx" → "Maintenance Records TN69AP3350" —
 * lowercase words get a capital, codes/registrations/dates are left alone. */
function titleFromFilename(name: string): string {
  return name
    .replace(/\.xlsx$/i, "")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => (w === "to" ? w : /^[a-z]+$/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function DownloadExcelButton({ path, filename, label = "Download Excel", className, params, direct = false, title }: Props) {
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; filename: string; sheets: PreviewSheet[] } | null>(null);

  const qs = params && Object.keys(params).length > 0 ? "?" + new URLSearchParams(params).toString() : "";

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => { clearTimeout(timer); setSlow(false); };
  }, [loading]);

  async function handleClick() {
    setLoading(true);
    try {
      if (direct) {
        await downloadExcel(path + qs, filename);
        return;
      }
      const { blob, filename: served } = await fetchExcel(path + qs, filename);
      // SheetJS is only needed for previews, so load it on demand.
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await blob.arrayBuffer(), { type: "array", cellDates: true });
      const sheets: PreviewSheet[] = wb.SheetNames.map((name) => ({
        name,
        rows: (XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" }) as unknown[][]).map((r) =>
          r.map((c) => String(c ?? "")),
        ),
      }));
      setPreview({ blob, filename: served, sheets });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load the export.";
      const problem = problemFromMessage(message);
      if (problem) reportProblem({ ...problem, onRetry: handleClick });
      else showError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={className ?? (direct ? DIRECT_CLASS : VIEW_CLASS)}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : direct ? (
          <FileSpreadsheet className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
        {loading ? (slow ? "Still preparing, this is a large record" : "Preparing…") : direct ? label : "View"}
      </button>
      {preview && (
        <ExportPreviewDialog
          title={title ?? titleFromFilename(preview.filename)}
          filename={preview.filename}
          blob={preview.blob}
          sheets={preview.sheets}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
