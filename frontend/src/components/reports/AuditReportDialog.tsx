"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ApprovalsReport } from "@/lib/approvals-report-pdf";
import { PeriodFields, ALL_TIME } from "@/components/reports/PeriodFields";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";

/**
 * The Audit Outcomes reports from Reports Center — Pending Audit, Audit
 * Verified Trips and Audit Flagged Trips — each the same report as its page's
 * "View" (/exports/approvals-report, backend audit_report.py), for a period.
 */

export type AuditKind = "pending" | "verified" | "flagged";

export const AUDIT_REPORTS: Record<AuditKind, { title: string; filename: string; about: string; search: string }> = {
  pending: {
    title: "Pending Audit Report",
    filename: "Pending_Audit.xlsx",
    search: "Trip ID, driver or truck",
    about: "Trips the Auditor still has to check, a sheet per driver, with how long each has waited. Trips are picked by the trip's date.",
  },
  verified: {
    title: "Audit Verified Trips Report",
    filename: "Audit_Verified_Trips.xlsx",
    search: "Trip ID, driver, or who verified it",
    about: "Trips the Auditor verified, a sheet per driver, and whether they were disputed first. Trips are picked by the day they were verified.",
  },
  flagged: {
    title: "Audit Flagged Trips Report",
    filename: "Audit_Flagged_Trips.xlsx",
    search: "Trip ID, driver or the flag reason",
    about: "Trips the Auditor flagged, a sheet per status: under review with the team, or returned and awaiting the Auditor. Trips are picked by the trip's date.",
  },
};

const dmy = (iso: string) => iso.split("-").reverse().join("-");

export function AuditReportDialog({ kind, onClose }: { kind: AuditKind; onClose: () => void }) {
  const r = AUDIT_REPORTS[kind];
  // All time by default, like the pages.
  const [period, setPeriod] = useState({ start: "", end: "", preset: ALL_TIME });
  const { start, end } = period;
  const [search, setSearch] = useState("");
  const term = search.trim();
  const backwards = !!start && !!end && start > end;
  const span = start || end ? `${start ? dmy(start) : "start"} to ${end ? dmy(end) : "today"}` : "all time";

  return (
    <Dialog open onClose={onClose} title={r.title} className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} allTime />
        <OnlyTheseField value={search} onChange={setSearch} placeholder={r.search} hint="Type the full Trip ID for just one trip." />
        <p className="text-caption-1-regular text-text-tertiary">
          {r.about} Each trip shows its hire, expenses and Trip Summary from the trip sheet.
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
              path="/exports/approvals-report"
              filename={r.filename}
              title={`${r.title} — ${span}${term ? ` — "${term}"` : ""}`}
              params={{ kind, ...(start ? { from_date: start } : {}), ...(end ? { to_date: end } : {}), ...(term ? { search: term } : {}) }}
              pdf={(report, file) => import("@/lib/approvals-report-pdf").then((m) => m.downloadApprovalsReportPdf({ report: report as ApprovalsReport, filename: file }))}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
