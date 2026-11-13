"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { TRIP_CATEGORIES, TRIP_CATEGORY_LABEL } from "@/components/trips/TripCategoryTag";
import type { TripCategory } from "@/types/trip";
import { PeriodFields, ALL_TIME } from "@/components/reports/PeriodFields";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";

/**
 * Trip Summary Report from Reports Center — the designed report (backend
 * profit_reports.py, kind "tripsummary"):
 * the Trip Summary page's trips and totals — hire after commission, the
 * trip sheet's expense, P&L and km per trip — for a period, as Excel or PDF.
 */

const dmy = (iso: string) => iso.split("-").reverse().join("-");

export function TripSummaryReportDialog({ onClose }: { onClose: () => void }) {
  // All trips by default, like the page.
  const [period, setPeriod] = useState({ start: "", end: "", preset: ALL_TIME });
  const { start, end } = period;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<TripCategory | "">("");
  const term = search.trim();
  const backwards = !!start && !!end && start > end;
  const span = start || end ? `${start ? dmy(start) : "Beginning"} to ${end ? dmy(end) : "Latest"}` : "All Trips";

  return (
    <Dialog open onClose={onClose} title="Trip Summary Report" className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} allTime />
        <label className="flex flex-col gap-1.5">
          <span className="text-caption-2-semibold text-text-tertiary">Trip Category</span>
          <GlassSelect
            aria-label="Trip Category"
            value={category}
            onChange={(v) => setCategory(v as TripCategory | "")}
            options={[{ value: "", label: "All categories" }, ...TRIP_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]}
          />
        </label>
        <OnlyTheseField value={search} onChange={setSearch} placeholder={"Trip ID, truck, origin or destination"} hint="Type the full Trip ID for just one trip." />
        <p className="text-caption-1-regular text-text-tertiary">
          Every trip with a trip sheet in the period, newest first: hire (after commission), the trip sheet&apos;s expense, P&amp;L and km,
          with the totals on a Summary sheet. Trips are dated by their scheduled date.
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
              filename="Trip_Summary.xlsx"
              title={`Trip Summary Report — ${span}${category ? ` — ${TRIP_CATEGORY_LABEL[category]}` : ""}${term ? ` — "${term}"` : ""}`}
              params={{
                kind: "tripsummary",
                ...(start ? { from_date: start } : {}),
                ...(end ? { to_date: end } : {}),
                ...(category ? { trip_category: category } : {}),
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
