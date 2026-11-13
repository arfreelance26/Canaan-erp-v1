"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { OnlyTheseField } from "@/components/reports/OnlyTheseField";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { PeriodFields, PERIOD_PRESETS, ALL_TIME } from "@/components/reports/PeriodFields";

/**
 * The Finance Hub reports from Reports Center — Driver Compensation, Staff
 * Compensation, EMI Tracking, Customer Detention, Compliance & Renewals —
 * each the same designed report as its page's "View" (backend
 * finance_report.py via /exports/resource-report), for a period and,
 * optionally, just the matching people / trucks.
 */

export type FinanceKind = "drivercomp" | "staffcomp" | "emi" | "detention" | "compliance";

const REPORTS: Record<FinanceKind, {
  title: string;
  filename: string;
  about: string;
  search: string;
  /** The period starts on This Month (pay) or All Time (balances). */
  thisMonth: boolean;
  periodHint?: string;
}> = {
  drivercomp: {
    title: "Driver Compensation Report",
    filename: "Driver_Compensation.xlsx",
    about: "A sheet per driver with their Salary Record for the period: trip salary, halt pay, cleaner and workshop batta, workshop advance and the final net payable, plus the advances and salary recorded.",
    search: "Driver name or ID",
    thisMonth: true,
  },
  staffcomp: {
    title: "Staff Compensation Report",
    filename: "Staff_Compensation.xlsx",
    about: "A sheet per staff member with every salary and advance entry in the period, and the totals month by month.",
    search: "Staff name or ID",
    thisMonth: true,
  },
  emi: {
    title: "EMI Tracking Report",
    filename: "EMI_Tracking.xlsx",
    about: "A sheet per loan: where it stands and every installment logged. Plus overdue loans, loans ending in the next 3 months, totals by bank, and recurring payments.",
    search: "EMI name, truck or bank",
    thisMonth: false,
    periodHint: "With a period, the loans whose dates overlap it.",
  },
  detention: {
    title: "Customer Detention Report",
    filename: "Customer_Detention.xlsx",
    about: "A sheet per status (missed on invoice, not billed, billed, paid, waived) with every trip's halt amount and invoice, and what each customer still owes.",
    search: "Trip ID, customer or invoice no.",
    thisMonth: false,
    periodHint: "Trips are picked by their completed date.",
  },
  compliance: {
    title: "Compliance & Renewals Report",
    filename: "Compliance_and_Renewals.xlsx",
    about: "A sheet per document (RC, FC, Road Tax, permits, Pollution, Insurance) with each truck's expiry, status and cost; every truck side by side; and the renewals due.",
    search: "Registration or truck ID",
    thisMonth: false,
    periodHint: "The statuses are as of today. The period picks which renewals to list; with no period, the next 60 days.",
  },
};

const DETENTION_STATUSES = ["Missed on invoice", "Not billed", "Billed", "Paid", "Invoice waived"];

const dmy = (iso: string) => iso.split("-").reverse().join("-");

export function FinanceReportDialog({ kind, onClose }: { kind: FinanceKind; onClose: () => void }) {
  const r = REPORTS[kind];
  const [period, setPeriod] = useState(() =>
    r.thisMonth ? { ...PERIOD_PRESETS[0].fn(), preset: PERIOD_PRESETS[0].label as string } : { start: "", end: "", preset: ALL_TIME });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { start, end } = period;
  const backwards = !!start && !!end && start > end;
  const term = search.trim();
  const span = start || end ? `${start ? dmy(start) : "start"} to ${end ? dmy(end) : "today"}` : kind === "compliance" ? "next 60 days" : "all time";

  return (
    <Dialog open onClose={onClose} title={r.title} className="sm:max-w-2xl">
      <div className="flex flex-col gap-5">
        <PeriodFields start={start} end={end} preset={period.preset} onChange={setPeriod} allTime />
        {r.periodHint && <p className="-mt-3 text-caption-1-regular text-text-tertiary">{r.periodHint}</p>}

        <div className={kind === "detention" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "flex flex-col"}>
          {kind === "detention" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-caption-2-semibold text-text-tertiary">Status</span>
              <GlassSelect
                aria-label="Status"
                value={status}
                onChange={setStatus}
                options={[{ value: "", label: "All statuses" }, ...DETENTION_STATUSES.map((s) => ({ value: s, label: s }))]}
              />
            </label>
          )}
          <OnlyTheseField value={search} onChange={setSearch} placeholder={r.search} />
        </div>

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
              title={`${r.title} — ${span}${status ? ` — ${status}` : ""}${term ? ` — "${term}"` : ""}`}
              params={{
                kind,
                ...(start ? { from_date: start } : {}),
                ...(end ? { to_date: end } : {}),
                ...(kind === "detention" && status ? { resource_type: status } : {}),
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
