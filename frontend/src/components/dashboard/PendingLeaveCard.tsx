"use client";

import Link from "next/link";
import { RiArrowRightLine as ArrowRight, RiCalendarCloseLine as CalendarOff, RiCheckLine as Check } from "@remixicon/react";
import type { LeaveRequest } from "@/types/leave-request";
import { formatDate } from "@/lib/format-date";

/** Inclusive number of days between two YYYY-MM-DD dates (1 when they are the same). */
function daysBetween(from: string, to: string): number | null {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86400000) + 1;
}

export function PendingLeaveCard({ requests, pendingCount }: { requests: LeaveRequest[]; pendingCount: number }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator-border bg-warning-surface/70 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-warning-surface-strong text-warning-text">
            <CalendarOff className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-body-semibold text-text-primary">Pending Leave Requests</h2>
            <p className="text-xs text-text-secondary">
              {pendingCount === 0 ? "Nothing waiting for you" : `${pendingCount} waiting for approval`}
            </p>
          </div>
        </div>
        <Link
          href="/attendance/leave-approvals"
          className="group flex h-8 items-center gap-1.5 rounded-full border border-warning-border bg-background-primary-default px-3.5 text-caption-1-semibold text-warning-text shadow-sm transition duration-300 hover:border-warning-border-strong hover:bg-warning-surface-strong hover:shadow-md"
        >
          Review
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300" />
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-success-surface-strong text-success-text ring-8 ring-success-border">
            <Check className="h-7 w-7" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-body-semibold text-text-primary">All caught up</p>
            <p className="text-xs text-text-secondary">No leave requests need approval right now.</p>
          </div>
        </div>
      ) : (
        <ul className="custom-scrollbar flex max-h-72 flex-col gap-1.5 overflow-y-auto p-4">
          {requests.map((req) => {
            const days = daysBetween(req.fromDate, req.toDate);
            return (
              <li
                key={req.id}
                className="flex items-center gap-3 rounded-xl border border-separator-border bg-background-primary-default px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-warning-border"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-surface-strong text-caption-1-semibold uppercase text-warning-text">
                  {req.applicantName?.trim().charAt(0) || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-caption-1-semibold text-text-primary">{req.applicantName}</p>
                    <span className="shrink-0 rounded-full bg-fill-2 px-2 py-0.5 text-caption-2-semibold text-text-secondary">
                      {req.category}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-text-secondary">
                    {formatDate(req.fromDate)} → {formatDate(req.toDate)}
                    {days ? ` · ${days} ${days === 1 ? "day" : "days"}` : ""}
                    {req.reason ? ` · ${req.reason}` : ""}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warning-surface px-2 py-0.5 text-caption-2-semibold text-warning-text">
                  <span className="h-1 w-1 rounded-full bg-current" />
                  Pending
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
