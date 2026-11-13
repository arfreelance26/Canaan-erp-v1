"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { PeriodFields, ALL_TIME } from "@/components/reports/PeriodFields";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";

/**
 * Driver Based Record, Vehicle Based Record, AdBlue History and Truck Run Record from Reports
 * Center — each the same designed report as its page's View (backend
 * record_reports.py), for a period and, optionally, just the matching ones.
 */

export type RecordKind = "driver_record" | "vehicle_record" | "adblue" | "runrecord";

const REPORTS: Record<RecordKind, { title: string; filename: string; about: string; date: string; search: string }> = {
  driver_record: { title: "Driver Based Record Report", filename: "Driver_Based_Record.xlsx",
    about: "A sheet per driver: every trip Accounts has verified, with its Salary Record line (regular pay, advance, expenses, net payable) and its audit status.",
    date: "Trips are picked by their trip date.", search: "Driver name or ID" },
  vehicle_record: { title: "Vehicle Based Record Report", filename: "Vehicle_Based_Record.xlsx",
    about: "A sheet per truck, removed trucks included: every trip Accounts has verified, with its driver, km, hire and audit status.",
    date: "Trips are picked by their trip date.", search: "Registration or truck ID" },
  runrecord: { title: "Truck Run Record Report", filename: "Truck_Run_Record.xlsx",
    about: "Each truck's km in the period, month by month and trip by trip, with its lifetime run (monthly average, normal km a month, km a day) and the completed trips still without a trip sheet.",
    date: "Trips are picked by their assigned date. The lifetime figures don't change with the period.", search: "Registration or truck ID" },
  adblue: { title: "AdBlue History Report", filename: "AdBlue_History.xlsx",
    about: "Every AdBlue fill: litres, price and cost, km since the last fill and km per litre, by truck and by filling location.",
    date: "Fills are picked by their date. Each truck's km per litre is its lifetime figure.", search: "Registration or truck ID" },
};

const dmy = (iso: string) => iso.split("-").reverse().join("-");

export function RecordReportDialog({ kind, onClose }: { kind: RecordKind; onClose: () => void }) {
  const r = REPORTS[kind];
  const [period, setPeriod] = useState({ start: "", end: "", preset: ALL_TIME });
  const [search, setSearch] = useState("");
  const { start, end } = period;
  const backwards = !!start && !!end && start > end;
  const term = search.trim();
  const span = start || end ? `${start ? dmy(start) : "start"} to ${end ? dmy(end) : "today"}` : "all time";

  return (
    <Dialog open onClose={onClose} title={r.title} className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} allTime />
        <p className="-mt-3 text-caption-1-regular text-text-tertiary">{r.date}</p>
        <OnlyTheseField value={search} onChange={setSearch} placeholder={r.search} />
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
              title={`${r.title} — ${span}${term ? ` — "${term}"` : ""}`}
              params={{ kind, ...(start ? { from_date: start } : {}), ...(end ? { to_date: end } : {}), ...(term ? { search: term } : {}) }}
              pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
