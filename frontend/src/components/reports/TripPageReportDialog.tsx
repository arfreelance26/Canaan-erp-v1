"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { tripReportApi, type TripReportCounts } from "@/lib/api";
import { TRIP_CATEGORIES, TRIP_CATEGORY_LABEL } from "@/components/trips/TripCategoryTag";
import type { TripCategory } from "@/types/trip";
import { PeriodFields, ALL_TIME } from "@/components/reports/PeriodFields";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";

/**
 * The Trip and Driver Management reports from Reports Center — each the same
 * designed report as its page's View (backend trip_pages_report.py), with the
 * page's filters: a period, the page's stage pills and the Trip Category, both
 * with live counts ("Outstation (632)") the way the pages count them — pills
 * within the chosen category, categories within the chosen pill — and "Only these".
 */

export type TripPageKind =
  | "trips_assign" | "trips_available" | "trips_current" | "trips_completed" | "trips_sheets"
  | "trips_reconciliation" | "trips_verification" | "trips_deleted" | "driver_assign";

const REPORTS: Record<TripPageKind, { title: string; filename: string; stages: string[]; about: string; date: string; search: string }> = {
  trips_assign: { title: "Assign Trips Report", filename: "Assign_Trips.xlsx", stages: [],
    about: "Every assigned trip waiting to start: truck, driver, route and how many days it has waited.",
    date: "Trips are picked by their trip date.", search: "Trip ID, truck, driver, container or place" },
  trips_available: { title: "Available Trips Report", filename: "Available_Trips.xlsx", stages: ["Booked", "Current", "Completed", "Closed"],
    about: "A sheet per stage (Booked, Current, Completed, Closed), with a stage × category table and the trucks and drivers with the most trips.",
    date: "Trips are picked by their trip date.", search: "Trip ID, truck, driver, container or place" },
  trips_current: { title: "Current Trips Report", filename: "Current_Trips.xlsx", stages: [],
    about: "Every trip on the move, a sheet per live status (Started, Loaded, On-Transit…), with how many days each has been out.",
    date: "Trips are picked by their trip date.", search: "Trip ID, truck, driver, container or place" },
  trips_completed: { title: "Completed Trips Report", filename: "Completed_Trips.xlsx", stages: [],
    about: "Trips done on the road whose booking sheet isn't closed yet, and how long each has waited.",
    date: "Trips are picked by their trip date.", search: "Trip ID, truck, driver, container or place" },
  trips_sheets: { title: "Trip Sheet Collection Report", filename: "Trip_Sheet_Collection.xlsx", stages: ["Pending", "Delivered", "Overdue"],
    about: "A sheet per status: sheets still with the driver, delivered (and when), and overdue — received over a day ago, not entered yet.",
    date: "Delivered sheets are picked by the day they were delivered; pending ones by the trip date.", search: "Trip ID, truck, driver or container" },
  trips_reconciliation: { title: "Trip Reconciliation Report", filename: "Trip_Reconciliation.xlsx",
    stages: ["Pending Receive", "Pending Sheet Entry", "Sheet Entered", "Rejected", "Request Raised", "Request Approved", "Request Rejected"],
    about: "A sheet per status, with each trip's hire, expenses and km, and the edit requests raised on it.",
    date: "Trips are picked by the trip sheet's date once entered, else the day it was received.", search: "Trip ID, truck, driver, container or customer" },
  trips_verification: { title: "Verification & Invoicing Report", filename: "Verification_and_Invoicing.xlsx",
    stages: ["Pending", "Verified", "Invoiced", "Rejected", "Waived Invoice"],
    about: "A sheet per status, with each trip's invoice number and date, and the verified trips still waiting to be invoiced.",
    date: "Invoiced trips are picked by their invoice date; the rest by the trip date.", search: "Trip ID, truck, driver, container or customer" },
  trips_deleted: { title: "Deleted Trips Report", filename: "Deleted_Trips.xlsx", stages: [],
    about: "Every trip still deleted: who asked, why, who approved it and when.",
    date: "Trips are picked by the day the deletion was approved.", search: "Trip ID, who asked, or the reason" },
  driver_assign: { title: "Driver Assignments Report", filename: "Driver_Assignments.xlsx", stages: [],
    about: "Every driver's truck now and since when, the trucks with no driver, and every assignment change.",
    date: "The period picks which assignment changes to list; the drivers' trucks are as of today.", search: "Driver name, ID or truck" },
};

const dmy = (iso: string) => iso.split("-").reverse().join("-");

export function TripPageReportDialog({ kind, onClose }: { kind: TripPageKind; onClose: () => void }) {
  const r = REPORTS[kind];
  const [period, setPeriod] = useState({ start: "", end: "", preset: ALL_TIME });
  const [stage, setStage] = useState("");
  const [category, setCategory] = useState<TripCategory | "">("");
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<TripReportCounts | null>(null);
  const { start, end } = period;
  const backwards = !!start && !!end && start > end;
  const term = search.trim();
  const hasCategory = kind !== "driver_assign";
  const hasCounts = kind !== "driver_assign" && kind !== "trips_deleted";

  const params = useMemo(() => ({
    kind,
    ...(start ? { from_date: start } : {}),
    ...(end ? { to_date: end } : {}),
    ...(stage ? { stage } : {}),
    ...(category ? { trip_category: category } : {}),
    ...(term ? { search: term } : {}),
  }), [kind, start, end, stage, category, term]);

  // Live counts for the two dropdowns (debounced, latest answer wins).
  useEffect(() => {
    if (!hasCounts || backwards) return;
    let cancelled = false;
    const id = setTimeout(() => {
      tripReportApi.counts(params).then((c) => { if (!cancelled) setCounts(c); }).catch(() => { if (!cancelled) setCounts(null); });
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [params, hasCounts, backwards]);

  const n = (v: number | undefined) => (counts ? ` (${v ?? 0})` : "");
  const span = start || end ? `${start ? dmy(start) : "start"} to ${end ? dmy(end) : "today"}` : "all time";

  return (
    <Dialog open onClose={onClose} title={r.title} className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} allTime />
        <p className="-mt-3 text-caption-1-regular text-text-tertiary">{r.date}</p>

        {(r.stages.length > 0 || hasCategory) && (
          <div className={r.stages.length > 0 && hasCategory ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "flex flex-col"}>
            {r.stages.length > 0 && (
              <label className="flex flex-col gap-1.5">
                <span className="text-caption-2-semibold text-text-tertiary">Stage</span>
                <GlassSelect
                  aria-label="Stage"
                  value={stage}
                  onChange={setStage}
                  options={[{ value: "", label: `All${n(counts?.stageTotal)}` }, ...r.stages.map((s) => ({ value: s, label: `${s}${n(counts?.stages[s])}` }))]}
                />
              </label>
            )}
            {hasCategory && (
              <label className="flex flex-col gap-1.5">
                <span className="text-caption-2-semibold text-text-tertiary">Trip Category</span>
                <GlassSelect
                  aria-label="Trip Category"
                  value={category}
                  onChange={(v) => setCategory(v as TripCategory | "")}
                  options={[{ value: "", label: `All categories${hasCounts ? n(counts?.categoryTotal) : ""}` },
                    ...TRIP_CATEGORIES.map((c) => ({ value: c.value, label: `${c.label}${hasCounts ? n(counts?.categories[c.value]) : ""}` }))]}
                />
              </label>
            )}
          </div>
        )}

        <OnlyTheseField value={search} onChange={setSearch} placeholder={r.search}
          hint={kind === "driver_assign" ? undefined : "Type the full Trip ID for just one trip."} />

        <p className="text-caption-1-regular text-text-tertiary">{r.about}</p>

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
              filename={r.filename}
              title={`${r.title} — ${span}${stage ? ` — ${stage}` : ""}${category ? ` — ${TRIP_CATEGORY_LABEL[category]}` : ""}${term ? ` — "${term}"` : ""}`}
              params={params}
              pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
