"use client";

import Link from "next/link";
import { ArrowRight, CalendarOff, Check } from "lucide-react";
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
    <div className="dk-inset flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-amber-50/70 via-white to-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <CalendarOff className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Pending Leave Requests</h2>
            <p className="text-xs text-gray-500">
              {pendingCount === 0 ? "Nothing waiting for you" : `${pendingCount} waiting for approval`}
            </p>
          </div>
        </div>
        <Link
          href="/attendance/leave-approvals"
          className="group flex h-8 items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3.5 text-xs font-semibold text-amber-700 shadow-sm transition-all duration-300 hover:scale-105 hover:border-amber-300 hover:bg-amber-50 hover:shadow-md"
        >
          Review
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
            <Check className="h-7 w-7" strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">All caught up</p>
            <p className="text-xs text-gray-500">No leave requests need approval right now.</p>
          </div>
        </div>
      ) : (
        <ul className="custom-scrollbar flex max-h-72 flex-col gap-1.5 overflow-y-auto p-4">
          {requests.map((req) => {
            const days = daysBetween(req.fromDate, req.toDate);
            return (
              <li
                key={req.id}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-amber-200"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold uppercase text-amber-700">
                  {req.applicantName?.trim().charAt(0) || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-semibold text-gray-900">{req.applicantName}</p>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                      {req.category}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-gray-500">
                    {formatDate(req.fromDate)} → {formatDate(req.toDate)}
                    {days ? ` · ${days} ${days === 1 ? "day" : "days"}` : ""}
                    {req.reason ? ` · ${req.reason}` : ""}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
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
