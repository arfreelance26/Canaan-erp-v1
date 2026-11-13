"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { MaintenanceReport } from "@/lib/maintenance-report-pdf";
import type { FuelReport } from "@/lib/fuel-report-pdf";
import { PeriodFields, ALL_TIME } from "@/components/reports/PeriodFields";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";

/**
 * The truck-wise reports from Reports Center — Truck Maintenance and Truck
 * Fuel History. Each is the same report as its page's "View" (with its
 * designed PDF), for a period, and for every truck or just the matching ones
 * ("Only these": registration or truck ID, like the pages' search box).
 */

export type TruckReportKind = "maintenance" | "fuel";

const REPORTS: Record<TruckReportKind, {
  title: string;
  path: string;
  filename: string;
  about: string;
  pdf: (report: unknown, file: string) => Promise<void>;
}> = {
  maintenance: {
    title: "Truck Maintenance Report",
    path: "/exports/maintenance-report",
    filename: "Truck_Maintenance.xlsx",
    about: "Truck by truck: every job in the period with its parts and cost, the last service, jobs still waiting for a cost or approval, and open service reminders. Jobs are dated by when the work started.",
    pdf: (report, file) => import("@/lib/maintenance-report-pdf").then((m) => m.downloadMaintenanceReportPdf({ report: report as MaintenanceReport, filename: file })),
  },
  fuel: {
    title: "Fuel Report",
    path: "/exports/fuel-report",
    filename: "Fuel_Report.xlsx",
    about: "Fills, litres, diesel cost and the average price paid; mileage now against each truck's normal; every fill with odd ones marked to check; and totals by fuel station. Fills are dated by the fill date.",
    pdf: (report, file) => import("@/lib/fuel-report-pdf").then((m) => m.downloadFuelReportPdf({ report: report as FuelReport, filename: file })),
  },
};

const dmy = (iso: string) => iso.split("-").reverse().join("-");

export function TruckReportDialog({ kind, onClose }: { kind: TruckReportKind; onClose: () => void }) {
  const r = REPORTS[kind];
  // All time by default, like the pages.
  const [period, setPeriod] = useState({ start: "", end: "", preset: ALL_TIME });
  const [search, setSearch] = useState("");
  const term = search.trim();
  const { start, end } = period;
  const backwards = !!start && !!end && start > end;

  const span = start || end ? `${start ? dmy(start) : "start"} to ${end ? dmy(end) : "today"}` : "all time";

  return (
    <Dialog open onClose={onClose} title={r.title} className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} allTime />

        <OnlyTheseField
          value={search}
          onChange={setSearch}
          placeholder="Registration or truck ID"
          hint="Type a full registration for just one truck, or part of one (e.g. TN69) for every truck that matches."
        />

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
              path={r.path}
              filename={r.filename}
              title={`${r.title} — ${span}${term ? ` — "${term}"` : ""}`}
              params={{
                ...(start ? { from_date: start } : {}),
                ...(end ? { to_date: end } : {}),
                ...(term ? { search: term } : {}),
              }}
              pdf={r.pdf}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
