"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Segmented } from "@/components/ui/Segmented";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";
import type { CostMode } from "@/lib/api";
import { PeriodFields, ALL_TIME } from "@/components/reports/PeriodFields";

/**
 * The Customer Profitability Report from Reports Center: the designed report
 * (backend profit_reports.py, kind "custprofit") — the same report as the
 * Customer Profitability page's View — for a period, a Cost/KM mode and,
 * optionally, just the matching customers.
 */

const MODE_KEY = "cpa_cost_mode"; // shared with the analytics page
const MODES: { value: CostMode; label: string }[] = [
  { value: "Basic", label: "Basic" },
  { value: "Advanced", label: "Advanced" },
  { value: "Manual", label: "Manual" },
];

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export function CustomerProfitabilityReportDialog({ onClose }: { onClose: () => void }) {
  // All time by default, like the analytics page.
  const [period, setPeriod] = useState({ start: "", end: "", preset: ALL_TIME });
  const [mode, setModeState] = useState<CostMode>("Advanced");

  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === "Basic" || m === "Advanced" || m === "Manual") setModeState(m);
    } catch { /* storage blocked: Advanced */ }
  }, []);
  const setMode = (m: CostMode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* not remembered, still switched */ }
  };

  const { start, end } = period;
  const [search, setSearch] = useState("");
  const term = search.trim();
  const backwards = !!start && !!end && start > end;
  const span = start || end ? `${start ? fmtDate(start) : "Beginning"} to ${end ? fmtDate(end) : "Today"}` : "All Time";

  return (
    <Dialog open onClose={onClose} title="Customer Profitability Report" className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} allTime />

        <div className="flex flex-col gap-2">
          <p className="text-caption-1-semibold text-text-secondary">Cost/KM mode</p>
          <Segmented label="Cost/KM mode" value={mode} onChange={setMode} options={MODES} />
          <p className="text-caption-1-regular text-text-tertiary">
            Used for each customer&apos;s Gross Profit (diesel) and Final Profit (the full Cost/KM), the same as on the Customer Profitability page.
          </p>
        </div>

        <OnlyTheseField value={search} onChange={setSearch} placeholder="Customer name" hint="Type a customer's name for just their sheet." />

        <p className="text-caption-1-regular text-text-tertiary">
          A ranking of every customer by Final Profit, the most and least profitable, customers whose profit is overstated,
          and a sheet per customer with their routes and recent trips.
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-separator-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full border border-separator-border px-4 text-body-medium text-text-primary transition-colors hover:bg-fill-2"
          >
            Cancel
          </button>
          {backwards ? (
            <span className="text-caption-1-regular text-text-tertiary">Fix the dates to view the report</span>
          ) : (
            <ReportViewButton
              path="/exports/resource-report"
              filename="Customer_Profitability.xlsx"
              title={`Customer Profitability Report — ${span} — Cost/KM ${mode}${term ? ` — "${term}"` : ""}`}
              params={{
                kind: "custprofit",
                resource_type: mode,
                ...(start ? { from_date: start } : {}),
                ...(end ? { to_date: end } : {}),
                ...(term ? { search: term } : {}),
              }}
              pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
