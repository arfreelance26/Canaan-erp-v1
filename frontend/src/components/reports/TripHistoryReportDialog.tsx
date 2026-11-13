"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { TripReport } from "@/lib/trip-report-pdf";
import { TRIP_CATEGORIES } from "@/components/trips/TripCategoryTag";
import { PeriodFields, ALL_TIME } from "@/components/reports/PeriodFields";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";

/**
 * Trip History Report from Reports Center: the same category-wise report as
 * the Trip History page's "View" (/exports/trip-report, backend
 * trip_report.py) — for a period, a stage and a trip category.
 */

const STAGES = ["All", "Assigned", "Current", "Completed", "Invoiced", "Waived Invoice", "Cancelled"] as const;
type Stage = (typeof STAGES)[number];

const dmy = (iso: string) => iso.split("-").reverse().join("-");

export function TripHistoryReportDialog({ onClose }: { onClose: () => void }) {
  // All time and every trip by default, like the page.
  const [period, setPeriod] = useState({ start: "", end: "", preset: ALL_TIME });
  const [stage, setStage] = useState<Stage>("All");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const term = search.trim();
  const { start, end } = period;
  const backwards = !!start && !!end && start > end;
  const span = start || end ? `${start ? dmy(start) : "start"} to ${end ? dmy(end) : "today"}` : "all time";
  const categoryLabel = TRIP_CATEGORIES.find((c) => c.value === category)?.label;

  return (
    <Dialog open onClose={onClose} title="Trip History Report" className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} allTime />
        <OnlyTheseField value={search} onChange={setSearch} placeholder={"Trip ID, booking ref, container, truck, driver or place"} hint="Type the full Trip ID for just one trip." />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-caption-2-semibold text-text-tertiary">Stage</span>
            <GlassSelect
              aria-label="Stage"
              value={stage}
              onChange={(v) => setStage(v as Stage)}
              options={STAGES.map((s) => ({ value: s, label: s === "All" ? "All trips" : s }))}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-caption-2-semibold text-text-tertiary">Trip Category</span>
            <GlassSelect
              aria-label="Trip Category"
              value={category}
              onChange={setCategory}
              options={[{ value: "", label: "All categories" }, ...TRIP_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]}
            />
          </label>
        </div>

        <p className="text-caption-1-regular text-text-tertiary">
          A sheet per trip category with every trip and its total, trips by stage, top customers and routes, and a By Customer sheet
          showing what&apos;s invoiced and still to invoice. Trips are picked by their scheduled date; cancelled ones are listed but never added into the money.
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
              path="/exports/trip-report"
              filename="Trip_History.xlsx"
              title={`Trip History Report — ${span}${stage !== "All" ? ` — ${stage}` : ""}${categoryLabel ? ` — ${categoryLabel}` : ""}${term ? ` — "${term}"` : ""}`}
              params={{
                card: stage,
                ...(term ? { search: term } : {}),
                ...(category ? { trip_category: category } : {}),
                ...(start ? { from_date: start } : {}),
                ...(end ? { to_date: end } : {}),
              }}
              pdf={(report, file) => import("@/lib/trip-report-pdf").then((m) => m.downloadTripReportPdf({ report: report as TripReport, filename: file }))}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
