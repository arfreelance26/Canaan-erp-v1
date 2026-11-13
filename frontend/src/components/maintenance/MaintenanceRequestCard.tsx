"use client";

import type { ReactNode } from "react";
import { RepairLinesTable } from "@/components/maintenance/RepairLines";
import { RiCheckboxCircleLine as CheckCircle, RiCloseCircleLine as XCircle, RiTimeLine as Clock, RiToolsLine as Wrench, RiUserLine as User, RiAttachment2 as Paperclip, RiStackLine as Layers, RiRouteLine as Route, RiFileList3Line as ClipboardList, RiForbidLine as Ban, RiRefreshLine as Refresh } from "@remixicon/react";
import type { MaintenanceRequest, MaintenanceRequestStatus } from "@/types/maintenance-request";
import { formatDate, formatDateTime } from "@/lib/format-date";

/** One maintenance request as a card — Maintenance Approvals (Admin /
 *  Accounts decide it) and Maintenance Requests (the submitter's own, where a
 *  rejected one is fixed and sent back). The page adds its buttons as `footer`. */

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StatusBadge({ status }: { status: MaintenanceRequestStatus }) {
  if (status === "Approved")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-surface-strong px-2.5 py-0.5 text-caption-2-semibold text-success-text">
        <CheckCircle className="h-3 w-3" /> Approved
      </span>
    );
  if (status === "Rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-surface-strong px-2.5 py-0.5 text-caption-2-semibold text-danger-text">
        <XCircle className="h-3 w-3" /> Rejected
      </span>
    );
  if (status === "Cancelled")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-fill-2 px-2.5 py-0.5 text-caption-2-semibold text-text-secondary">
        <Ban className="h-3 w-3" /> Withdrawn
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-2.5 py-0.5 text-caption-2-semibold text-warning-text">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

function Detail({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
      <span className="text-[9px] font-semibold text-text-tertiary">{label}</span>
      <span className="whitespace-pre-line text-caption-1-semibold text-text-primary">{value}</span>
    </div>
  );
}

export function MaintenanceRequestCard({
  req, onProofs, footer, highlight = false,
}: {
  req: MaintenanceRequest;
  onProofs: (r: MaintenanceRequest) => void;
  /** The page's buttons for this card (Approve / Reject, or Edit & Submit for Re-Verification). */
  footer?: ReactNode;
  /** Opened from a notification: briefly ringed so it's easy to spot. */
  highlight?: boolean;
}) {
  const fromTrip = req.source === "Trip Sheet";
  const reverify = req.resubmitCount > 0;
  return (
    <div
      id={`maintenance-request-${req.id}`}
      className={`overflow-hidden rounded-2xl border bg-background-primary-default shadow-sm transition-shadow ${
        highlight ? "border-accent-border-strong ring-2 ring-accent-border" : "border-separator-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-separator-border bg-fill-1 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-surface-strong text-accent-text">
            <Wrench className="h-4 w-4" />
          </div>
          <div>
            <p className="text-body-semibold text-text-primary">
              {req.registrationNumber || req.truckIdStr}
              <span className="ml-2 align-middle text-caption-2-medium text-text-tertiary">{req.truckIdStr}</span>
              <span
                className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 align-middle text-caption-2-semibold ${
                  fromTrip ? "bg-purple-surface text-purple-text" : "bg-accent-solid/10 text-accent-text-strong"
                }`}
              >
                {fromTrip ? <Route className="h-3 w-3" /> : <ClipboardList className="h-3 w-3" />}
                {fromTrip ? `Trip Sheet${req.tripIdStr ? ` · ${req.tripIdStr}` : ""}` : "Maintenance form"}
              </span>
              {reverify && (
                <span
                  className="ml-2 inline-flex items-center gap-1 rounded-full bg-teal-surface px-2 py-0.5 align-middle text-caption-2-semibold text-teal-text"
                  title={`Rejected and sent back ${req.resubmitCount} time${req.resubmitCount === 1 ? "" : "s"}`}
                >
                  <Refresh className="h-3 w-3" /> Re-verification{req.resubmitCount > 1 ? ` ×${req.resubmitCount}` : ""}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-text-tertiary">
              Submitted {req.createdAt ? formatDateTime(req.createdAt) : "—"}
              {req.resubmittedAt && <> · sent back {formatDateTime(req.resubmittedAt)}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-title-3-semibold tabular-nums text-text-primary">{rupees(req.cost)}</span>
          <StatusBadge status={req.status} />
        </div>
      </div>

      {/* Why it was turned down: the current rejection, or (sent back) the last one. */}
      {req.status === "Rejected" && req.rejectReason ? (
        <div className="border-b border-danger-border bg-danger-surface px-5 py-3">
          <p className="text-caption-2-semibold text-danger-text">
            Rejected{req.decidedByName ? <> by {req.decidedByName}</> : null}{req.decidedAt ? <> · {formatDateTime(req.decidedAt)}</> : null}
          </p>
          <p className="mt-0.5 text-sm text-danger-text-strong">&ldquo;{req.rejectReason}&rdquo;</p>
        </div>
      ) : reverify && req.previousRejectReason && req.status === "Pending" ? (
        <div className="border-b border-teal-border bg-teal-surface px-5 py-3">
          <p className="text-caption-2-semibold text-teal-text">Previously rejected — fixed and sent back</p>
          <p className="mt-0.5 text-sm text-teal-text-strong">&ldquo;{req.previousRejectReason}&rdquo;</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <div className="mb-1 flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary">
              <User className="h-3 w-3" /> Submitted By
            </div>
            <p className="text-body-semibold text-text-primary">
              {req.submittedByName}
              {req.submittedByRole && <span className="ml-1.5 text-caption-1-regular text-text-tertiary">{req.submittedByRole}</span>}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <div className="mb-1 flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary">
              <Paperclip className="h-3 w-3" /> Proof of Payment
            </div>
            {req.proofCount > 0 ? (
              <button
                type="button"
                onClick={() => onProofs(req)}
                className="flex w-fit items-center gap-1 rounded-full border border-accent-border bg-accent-surface px-2.5 py-0.5 text-caption-1-semibold text-accent-text transition-colors hover:bg-accent-surface-strong"
              >
                <Paperclip className="h-3 w-3" /> View {req.proofCount} file{req.proofCount === 1 ? "" : "s"}
              </button>
            ) : (
              <p className="text-xs text-text-tertiary">
                {req.status === "Pending" || req.status === "Cancelled"
                  ? "None attached"
                  : req.status === "Approved"
                    ? "Moved to the record"
                    : "Removed when rejected"}
              </p>
            )}
          </div>

          {req.status !== "Pending" && req.status !== "Rejected" && (
            <div className="flex flex-col gap-1">
              <div className="mb-1 flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary">
                <CheckCircle className="h-3 w-3" /> Decision
              </div>
              <p className="text-sm text-text-primary">
                {req.status === "Cancelled" ? "Withdrawn" : req.status}
                {req.decidedByName && <> by <span className="font-semibold">{req.decidedByName}</span></>}
                {req.decidedAt && <span className="text-text-tertiary"> · {formatDateTime(req.decidedAt)}</span>}
              </p>
              {req.rejectReason && <p className="mt-1 text-xs text-text-secondary">&ldquo;{req.rejectReason}&rdquo;</p>}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-separator-border bg-fill-1 px-4 py-3">
          <div className="mb-3 flex items-center gap-1.5 text-caption-2-semibold text-text-tertiary">
            <Layers className="h-3 w-3" /> Record Details
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Detail label="Maintenance Type" value={req.maintenanceType} />
            <Detail label="Repair Type" value={req.repairType} />
            <Detail label="Start Date" value={req.date ? formatDate(req.date) : ""} />
            <Detail label="End Date" value={req.maintenanceEndDate ? formatDate(req.maintenanceEndDate) : ""} />
            <Detail label="Odometer" value={`${req.odometer.toLocaleString("en-IN")} km`} />
            <Detail label="Total Cost" value={rupees(req.cost)} />
            <Detail label="Remind At" value={req.remindAtOdometer ? `${req.remindAtOdometer.toLocaleString("en-IN")} km` : ""} />
            <Detail label="Compliant" value={req.compliant} wide />
            <Detail label="Remarks" value={req.description} wide />
          </div>
          {/* Each repair with its own cost, place, who did it and invoice. */}
          <div className="mt-4">
            <p className="mb-2 text-caption-2-semibold text-text-tertiary">Repairs ({req.repairLines.length})</p>
            <RepairLinesTable lines={req.repairLines} />
          </div>
        </div>
      </div>

      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-separator-border bg-fill-1 px-5 py-3">
          {footer}
        </div>
      )}
    </div>
  );
}
