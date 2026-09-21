"use client";

import { useState } from "react";
import { Eye, FileSpreadsheet, Loader2 } from "lucide-react";
import { downloadExcel, fetchExcel } from "@/lib/api";
import { showError } from "@/lib/swal";
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
};

const VIEW_CLASS =
  "flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50";
const DIRECT_CLASS =
  "flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-emerald-200 bg-white px-4 text-sm font-medium text-emerald-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-emerald-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50";

export function DownloadExcelButton({ path, filename, label = "Download Excel", className, params, direct = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ blob: Blob; filename: string; sheets: PreviewSheet[] } | null>(null);

  const qs = params && Object.keys(params).length > 0 ? "?" + new URLSearchParams(params).toString() : "";

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
      showError(err instanceof Error ? err.message : "Failed to load the export.");
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
        {loading ? "Preparing…" : direct ? label : "View"}
      </button>
      {preview && (
        <ExportPreviewDialog
          title={preview.filename.replace(/\.xlsx$/i, "").replace(/_/g, " ")}
          filename={preview.filename}
          blob={preview.blob}
          sheets={preview.sheets}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
