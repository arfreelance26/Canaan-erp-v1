"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { attendanceApi } from "@/lib/api";
import { showError } from "@/lib/swal";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { cn } from "@/lib/utils";
import type { AttendanceSummaryRow } from "@/types/attendance";
import { todayIst } from "@/lib/format-date";

type Category = "driver" | "staff";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function AttendanceReportPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [category, setCategory] = useState<Category>("driver");
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(todayIst());
  const [rows, setRows] = useState<AttendanceSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ready && user?.softwareDesignation !== "Admin") {
      router.replace("/");
    }
  }, [ready, user, router]);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    attendanceApi
      .getSummary(category, fromDate, toDate)
      .then(setRows)
      .catch((err: unknown) => showError(err instanceof Error ? err.message : "Failed to load attendance report."))
      .finally(() => setLoading(false));
  }, [category, fromDate, toDate]);

  if (!ready || user?.softwareDesignation !== "Admin") return null;

  const totals = rows.reduce(
    (acc, r) => ({
      present: acc.present + r.present,
      absent: acc.absent + r.absent,
      onLeave: acc.onLeave + r.onLeave,
      notMarked: acc.notMarked + r.notMarked,
    }),
    { present: 0, absent: 0, onLeave: 0, notMarked: 0 }
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Attendance Report</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Present, Absent, and On Leave day counts for drivers and staff over any date range
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          {(["driver", "staff"] as Category[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                category === c ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {c === "driver" ? "Drivers" : "Staff"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
            <DatePickerInput
              value={fromDate}
              onChange={setFromDate}
              className="w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
            <DatePickerInput
              value={toDate}
              onChange={setToDate}
              className="w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <PageSkeleton hasButton={false} hasSearch={false} statCards={4} columns={7} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Present</p>
              <p className="mt-1 text-2xl font-bold text-green-600">{totals.present}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Absent</p>
              <p className="mt-1 text-2xl font-bold text-red-600">{totals.absent}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total On Leave</p>
              <p className="mt-1 text-2xl font-bold text-yellow-600">{totals.onLeave}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Not Marked</p>
              <p className="mt-1 text-2xl font-bold text-gray-500">{totals.notMarked}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[800px] text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {[
                    category === "driver" ? "Driver ID" : "Staff ID",
                    "Name",
                    "Present",
                    "Absent",
                    "On Leave",
                    "Not Marked",
                    "% Present",
                  ].map((col) => (
                    <th key={col} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                      No {category === "driver" ? "drivers" : "staff"} found.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const pct = r.totalDays > 0 ? Math.round((r.present / r.totalDays) * 100) : 0;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{r.code}</td>
                        <td className="px-4 py-3 text-gray-700">{r.name}</td>
                        <td className="px-4 py-3 font-semibold text-green-700">{r.present}</td>
                        <td className="px-4 py-3 font-semibold text-red-600">{r.absent}</td>
                        <td className="px-4 py-3 font-semibold text-yellow-700">{r.onLeave}</td>
                        <td className="px-4 py-3 text-gray-500">{r.notMarked}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              pct >= 90
                                ? "bg-green-100 text-green-700"
                                : pct >= 70
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-600"
                            )}
                          >
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
