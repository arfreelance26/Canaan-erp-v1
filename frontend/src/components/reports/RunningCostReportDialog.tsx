"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Segmented } from "@/components/ui/Segmented";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";

/**
 * The Running Cost Report from Reports Center: the designed report (backend
 * profit_reports.py, kind "runningcost") — the same report as the Running
 * Cost Calculator's View: every truck's cost per km in a mode, each part
 * with how it was worked out (the calculator's "How is this calculated?").
 */

type Mode = "Manual" | "Basic" | "Advanced";
const MODES: { value: Mode; label: string }[] = [
  { value: "Manual", label: "Manual" },
  { value: "Basic", label: "Basic" },
  { value: "Advanced", label: "Advanced" },
];
const RCC_KEY = "canaan_rcc_state"; // the calculator's saved state; its mode is the default here

export function RunningCostReportDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("Advanced");
  const [search, setSearch] = useState("");
  const term = search.trim();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RCC_KEY) ?? "{}")?.mode;
      if (saved === "Manual" || saved === "Basic" || saved === "Advanced") setMode(saved);
    } catch { /* storage blocked or unreadable: Advanced */ }
  }, []);

  return (
    <Dialog open onClose={onClose} title="Running Cost Report" className="sm:max-w-xl">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-caption-1-semibold text-text-secondary">Cost/KM mode</p>
          <Segmented label="Cost/KM mode" value={mode} onChange={setMode} options={MODES} />
          <p className="text-caption-1-regular text-text-tertiary">
            {mode === "Advanced" && "From each truck's own records: fuel logs, fitted tyres, maintenance, EMI and documents."}
            {mode === "Basic" && "From the settings: km per day for each tyre layout, the tyre costs and the base fuel price."}
            {mode === "Manual" && "From the figures typed into the Running Cost Calculator's Manual tab."}
          </p>
        </div>

        <OnlyTheseField
          value={search}
          onChange={setSearch}
          placeholder="Registration or truck ID"
          hint="Type a full registration for just one truck, or part of one (e.g. TN69) for every truck that matches."
        />

        <p className="text-caption-1-regular text-text-tertiary">
          The fleet average by part, the costliest and cheapest trucks, trucks with a part missing, and a sheet per truck
          showing how each part was worked out: the formula, the figures behind it and where they come from.
          The whole fleet takes about 15 seconds to prepare.
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-separator-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full border border-separator-border px-4 text-body-medium text-text-primary transition-colors hover:bg-fill-2"
          >
            Cancel
          </button>
          <ReportViewButton
            path="/exports/resource-report"
            filename="Running_Cost.xlsx"
            title={`Running Cost Report — ${mode} mode${term ? ` — "${term}"` : ""}`}
            params={{ kind: "runningcost", resource_type: mode, ...(term ? { search: term } : {}) }}
            pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
          />
        </div>
      </div>
    </Dialog>
  );
}
