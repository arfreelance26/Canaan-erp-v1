"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ApprovalsReport } from "@/lib/approvals-report-pdf";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { PeriodFields, ALL_TIME } from "@/components/reports/PeriodFields";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";

/**
 * The Approvals reports from Reports Center — Payment Requests, Edit
 * Approvals, Deletion Approvals and Maintenance Approvals — each the same
 * report as its page's "View", for a period (by the day the request was made)
 * and, for the three approval pages, a status.
 */

export type ApprovalKind = "payments" | "edit" | "deletion" | "maintenance";

const REPORTS: Record<ApprovalKind, {
  title: string;
  filename: string;
  about: string;
  search: string;
  statuses?: { value: string; label: string }[];
}> = {
  payments: {
    title: "Payment Requests Report",
    filename: "Payment_Requests.xlsx",
    search: "Who asked, or what it was for",
    about: "A sheet per requester: every payment request in the period with its amount and whether it was paid.",
  },
  edit: {
    title: "Edit Approvals Report",
    filename: "Edit_Approvals.xlsx",
    search: "Who asked, or the record",
    about: "A sheet per record type (trip, customer, truck, fuel log…): every edit request, who asked, the decision and how long it took.",
    statuses: [
      { value: "All", label: "All" },
      { value: "Pending", label: "Pending" },
      { value: "Approved", label: "Approved (edit window open)" },
      { value: "Completed", label: "Completed (edit window over)" },
      { value: "Rejected", label: "Rejected" },
    ],
  },
  deletion: {
    title: "Deletion Approvals Report",
    filename: "Deletion_Approvals.xlsx",
    search: "Who asked, or the record",
    about: "A sheet per record type: every deletion request, who asked, the decision and how long it took.",
    statuses: [
      { value: "all", label: "All" },
      { value: "Pending", label: "Pending" },
      { value: "Approved", label: "Approved" },
      { value: "Rejected", label: "Rejected" },
    ],
  },
  maintenance: {
    title: "Maintenance Approvals Report",
    filename: "Maintenance_Approvals.xlsx",
    search: "Truck, work, vendor, invoice or who asked",
    about: "A sheet per status: every maintenance request sent for approval, the truck, the work and its cost.",
    statuses: [
      { value: "all", label: "All" },
      { value: "Pending", label: "Pending" },
      { value: "Approved", label: "Approved" },
      { value: "Rejected", label: "Rejected" },
    ],
  },
};

const dmy = (iso: string) => iso.split("-").reverse().join("-");

export function ApprovalReportDialog({ kind, onClose }: { kind: ApprovalKind; onClose: () => void }) {
  const r = REPORTS[kind];
  const [period, setPeriod] = useState({ start: "", end: "", preset: ALL_TIME });
  const [status, setStatus] = useState(r.statuses?.[0].value ?? "");
  const { start, end } = period;
  const [search, setSearch] = useState("");
  const term = search.trim();
  const backwards = !!start && !!end && start > end;
  const span = start || end ? `${start ? dmy(start) : "start"} to ${end ? dmy(end) : "today"}` : "all time";
  const statusLabel = r.statuses?.find((s) => s.value === status)?.label;
  const dates = { ...(start ? { from_date: start } : {}), ...(end ? { to_date: end } : {}), ...(term ? { search: term } : {}) };

  return (
    <Dialog open onClose={onClose} title={r.title} className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} allTime />
        <OnlyTheseField value={search} onChange={setSearch} placeholder={r.search} />

        {r.statuses && (
          <label className="flex flex-col gap-1.5">
            <span className="text-caption-2-semibold text-text-tertiary">Status</span>
            <GlassSelect aria-label="Status" value={status} onChange={setStatus} options={r.statuses} />
          </label>
        )}

        <p className="text-caption-1-regular text-text-tertiary">
          {r.about} Requests are picked by the day they were made.
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
          ) : kind === "payments" ? (
            <ReportViewButton
              path="/exports/resource-report"
              filename={r.filename}
              title={`${r.title} — ${span}${term ? ` — "${term}"` : ""}`}
              params={{ kind: "payments", ...dates }}
              pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
            />
          ) : (
            <ReportViewButton
              path="/exports/approvals-report"
              filename={r.filename}
              title={`${r.title} — ${span}${statusLabel && statusLabel !== "All" ? ` — ${statusLabel}` : ""}${term ? ` — "${term}"` : ""}`}
              params={{ kind, tab: status, ...dates }}
              pdf={(report, file) => import("@/lib/approvals-report-pdf").then((m) => m.downloadApprovalsReportPdf({ report: report as ApprovalsReport, filename: file }))}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
