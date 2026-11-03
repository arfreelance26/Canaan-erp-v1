"use client";

import { RiCheckLine as Check, RiCloseLine as X } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format-date";
import type { LeaveRequest } from "@/types/leave-request";

type LeaveApprovalTableProps = {
  requests: LeaveRequest[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
};

const columns = ["Applicant", "Category", "From", "To", "Reason", "Applied On", "Status", "Actions"];

const statusStyles: Record<string, string> = {
  Pending: "bg-warning-surface text-warning-text",
  Approved: "bg-success-surface text-success-text",
  Rejected: "bg-danger-surface text-danger-text",
};
const statusDots: Record<string, string> = {
  Pending: "bg-warning-solid",
  Approved: "bg-success-solid",
  Rejected: "bg-danger-solid",
};


export function LeaveApprovalTable({ requests, onApprove, onReject }: LeaveApprovalTableProps) {
  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-separator-border bg-background-primary-default p-6 text-center text-sm text-text-secondary">
        No leave requests.
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[900px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-separator-border bg-fill-1">
            {columns.filter(c => c !== "Actions" || (onApprove && onReject)).map((column) => (
              <th
                key={column}
                className="px-4 py-3 text-caption-1-semibold text-text-secondary"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-separator-border">
          {requests.map((request) => (
            <tr key={request.id} className="hover:bg-fill-2">
              <td className="px-4 py-3">
                <div className="font-medium text-text-primary">{request.applicantName}</div>
                <div className="text-xs text-text-secondary">{request.applicantCode}</div>
              </td>
              <td className="px-4 py-3 text-text-secondary">{request.category}</td>
              <td className="px-4 py-3 text-text-secondary">{formatDate(request.fromDate)}</td>
              <td className="px-4 py-3 text-text-secondary">{formatDate(request.toDate)}</td>
              <td className="px-4 py-3 text-text-secondary">{request.reason}</td>
              <td className="px-4 py-3 text-text-secondary">{formatDateTime(request.appliedAt)}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption-1-medium",
                    statusStyles[request.status] ?? "bg-fill-2 text-text-secondary"
                  )}
                >
                  <i className={cn("h-1.5 w-1.5 rounded-full", statusDots[request.status] ?? "bg-fill-4")} />
                  {request.status}
                </span>
                {request.status !== "Pending" && request.decidedAt && (
                  <p className="mt-1 text-[11px] text-text-tertiary">
                    {request.status === "Approved" ? "Approved" : "Rejected"}
                    {request.decidedByName ? ` by ${request.decidedByName}` : ""} · {formatDate(request.decidedAt)}
                  </p>
                )}
              </td>
              {(onApprove && onReject) && (
                <td className="px-4 py-3">
                  {request.status === "Pending" ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onApprove(request.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-success-border bg-success-surface px-3 py-1.5 text-caption-1-medium text-success-text hover:bg-success-surface-strong"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject(request.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-danger-border bg-danger-surface px-3 py-1.5 text-caption-1-medium text-danger-text hover:bg-danger-surface-strong"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
