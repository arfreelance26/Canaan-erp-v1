"use client";

import { useEffect, useState } from "react";
import { RiEyeLine as Eye, RiLoader4Line as Loader2 } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { Segmented } from "@/components/ui/Segmented";
import { PeriodFields, PERIOD_PRESETS } from "@/components/reports/PeriodFields";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";
import { ExportPreviewDialog, type PreviewSheet } from "@/components/ui/ExportPreviewDialog";
import { fetchExcel, plSummaryApi, type PlComputed } from "@/lib/api";
import { downloadPlReportPdf } from "@/lib/pl-report-pdf";
import { problemFromMessage, reportProblem } from "@/lib/connection-problem";
import { showError } from "@/lib/feedback";
import { PROFITABILITY_PARTS, PROFITABILITY_TITLE, type ProfitabilityPart } from "@/components/reports/ProfitabilityViewMenu";

/**
 * The Profitability Report from Reports Center: pick the report (Trip
 * Profitability, Truck Profitability or both), a period and a Cost/KM mode,
 * then the same report as the Profitability page's View — the server-built
 * Excel (backend/pl_export.py) with its preview, and the PDF from the same numbers.
 */

type Mode = "Manual" | "Basic" | "Advanced";
const MODE_KEY = "canaan.pl.mode"; // shared with the Profitability page, so both start on the same mode
const MODES: { value: Mode; label: string }[] = [
  { value: "Manual", label: "Manual" },
  { value: "Basic", label: "Basic" },
  { value: "Advanced", label: "Advanced" },
];

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

type Ready = { blob: Blob; filename: string; sheets: PreviewSheet[]; computed: PlComputed; start: string; end: string; mode: Mode; search: string; part: ProfitabilityPart };

export function ProfitabilityReportDialog({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState(() => ({ ...PERIOD_PRESETS[0].fn(), preset: PERIOD_PRESETS[0].label as string }));
  const { start, end } = period;
  const [search, setSearch] = useState("");
  const term = search.trim();
  const [mode, setModeState] = useState<Mode>("Advanced");
  const [part, setPart] = useState<ProfitabilityPart>("trips");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<Ready | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === "Manual" || saved === "Basic" || saved === "Advanced") setModeState(saved);
    } catch { /* storage blocked: Advanced */ }
  }, []);
  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* not remembered, still switched */ }
  };

  const validRange = !!start && !!end && start <= end;

  async function view() {
    if (!validRange || busy) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams({ start_date: start, end_date: end, mode, part, ...(term ? { search: term } : {}) }).toString();
      const [computed, file, preview] = await Promise.all([
        plSummaryApi.getComputed(start, end, mode, term),
        fetchExcel(`/pl-summary/export?${qs}`, `Profitability_${fmtDate(start)}_to_${fmtDate(end)}.xlsx`),
        plSummaryApi.getExportPreview(qs),
      ]);
      setReady({ blob: file.blob, filename: file.filename, sheets: preview.sheets, computed, start, end, mode, search: term, part });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not prepare the report.";
      const problem = problemFromMessage(message);
      if (problem) reportProblem({ ...problem, onRetry: view });
      else showError(message);
    } finally {
      setBusy(false);
    }
  }

  if (ready) {
    return (
      <ExportPreviewDialog
        title={`${PROFITABILITY_TITLE[ready.part]} — ${fmtDate(ready.start)} to ${fmtDate(ready.end)}${ready.search ? ` — "${ready.search}"` : ""}`}
        filename={ready.filename}
        blob={ready.blob}
        sheets={ready.sheets}
        onClose={() => setReady(null)}
        onPdf={() => downloadPlReportPdf({
          computed: ready.computed, startDate: ready.start, endDate: ready.end, mode: ready.mode, search: ready.search, filename: ready.filename, part: ready.part,
        })}
      />
    );
  }

  return (
    <Dialog open onClose={onClose} title="Profitability Report" className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-caption-1-semibold text-text-secondary">Report</p>
          <Segmented label="Report" value={part} onChange={setPart}
            options={PROFITABILITY_PARTS.map((o) => ({ value: o.value, label: o.value === "both" ? "Both" : o.label }))} />
          <p className="text-caption-1-regular text-text-tertiary">{PROFITABILITY_PARTS.find((o) => o.value === part)?.hint}</p>
        </div>

        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} />
        <OnlyTheseField value={search} onChange={setSearch} placeholder={"Trip ID, truck or customer"} hint="Narrows the totals too, like the Profitability page's search. Type the full Trip ID for just one trip." />

        <div className="flex flex-col gap-2">
          <p className="text-caption-1-semibold text-text-secondary">Cost/KM mode</p>
          <Segmented label="Cost/KM mode" value={mode} onChange={setMode} options={MODES} />
          <p className="text-caption-1-regular text-text-tertiary">
            How diesel, tyres and maintenance are costed, the same as on the Profitability page.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-separator-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-separator-border px-4 py-2 text-body-medium text-text-primary transition-colors hover:bg-fill-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={view}
            disabled={!validRange || busy}
            className="flex items-center gap-2 rounded-full bg-accent-solid px-5 py-2 text-body-medium text-on-solid shadow-sm transition-colors hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            {busy ? "Preparing…" : "View report"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
