"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { downloadExcel } from "@/lib/api";
import { showError } from "@/lib/swal";

type Props = {
  /** The export endpoint path, e.g. "/exports/drivers". */
  path: string;
  /** Filename to use if the server doesn't send one. */
  filename: string;
  label?: string;
  className?: string;
};

export function DownloadExcelButton({ path, filename, label = "Download Excel", className }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await downloadExcel(path, filename);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to download Excel file.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={
        className ??
        "flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
      }
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
      {loading ? "Preparing…" : label}
    </button>
  );
}
