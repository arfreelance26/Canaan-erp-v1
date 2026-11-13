"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { AttendanceReport } from "@/lib/attendance-report-pdf";
import { PeriodFields, PERIOD_PRESETS } from "@/components/reports/PeriodFields";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";

/**
 * Driver or Staff Attendance Report from Reports Center: the same report as
 * the Attendance Report page's "View" button (/exports/attendance-report) —
 * Summary, Register and a sheet per person, with its own PDF — for a period.
 */

const dmy = (iso: string) => iso.split("-").reverse().join("-");

export function AttendanceReportDialog({ category, onClose }: { category: "driver" | "staff"; onClose: () => void }) {
  const [period, setPeriod] = useState(() => ({ ...PERIOD_PRESETS[0].fn(), preset: PERIOD_PRESETS[0].label as string }));
  const { start, end } = period;
  const [search, setSearch] = useState("");
  const term = search.trim();
  const who = category === "driver" ? "Driver" : "Staff";
  const ready = !!start && !!end && start <= end;

  return (
    <Dialog open onClose={onClose} title={`${who} Attendance Report`} className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} />
        <OnlyTheseField value={search} onChange={setSearch} placeholder={category === "driver" ? "Driver name or ID" : "Staff name or ID"} />
        <p className="text-caption-1-regular text-text-tertiary">
          {category === "driver"
            ? "Every driver's days present, absent and on leave, the day-by-day register, and a sheet per driver with their remarks."
            : "Every staff member's days present, absent and on leave, the day-by-day register with holidays, and a sheet per person."}
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-separator-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full border border-separator-border px-4 text-body-medium text-text-primary transition-colors hover:bg-fill-2"
          >
            Cancel
          </button>
          {ready ? (
            <ReportViewButton
              path="/exports/attendance-report"
              filename={`${who}_Attendance.xlsx`}
              title={`${who} Attendance Report — ${dmy(start)} to ${dmy(end)}${term ? ` — "${term}"` : ""}`}
              params={{ category, from_date: start, to_date: end, ...(term ? { search: term } : {}) }}
              pdf={(report, file) => import("@/lib/attendance-report-pdf").then((m) => m.downloadAttendanceReportPdf({ report: report as AttendanceReport, filename: file }))}
            />
          ) : (
            <span className="text-caption-1-regular text-text-tertiary">Pick both dates to view the report</span>
          )}
        </div>
      </div>
    </Dialog>
  );
}
