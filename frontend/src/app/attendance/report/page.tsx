"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, MessageSquare, ChevronDown, ChevronUp, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { attendanceApi } from "@/lib/api";
import { showError } from "@/lib/swal";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { cn } from "@/lib/utils";
import type { AttendanceSummaryRow, DriverAttendanceRemark } from "@/types/attendance";
import { todayIst, formatDate } from "@/lib/format-date";

type Category = "driver" | "staff";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function RemarksList({ remarks }: { remarks: DriverAttendanceRemark[] }) {
  const [expanded, setExpanded] = useState(false);
  if (remarks.length === 0) return <span className="text-xs text-gray-400">—</span>;

  const preview = remarks.slice(0, 2);
  const rest = remarks.slice(2);

  return (
    <div className="flex flex-col gap-1 max-w-[280px]">
      {preview.map((r) => (
        <div key={r.id} className="flex items-start gap-1.5">
          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
          <span className="text-xs text-gray-700 whitespace-normal break-words">
            <span className="font-medium text-gray-500">{formatDate(r.date)}:</span> {r.remark}
          </span>
        </div>
      ))}

      {rest.length > 0 && expanded && rest.map((r) => (
        <div key={r.id} className="flex items-start gap-1.5">
          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
          <span className="text-xs text-gray-700 whitespace-normal break-words">
            <span className="font-medium text-gray-500">{formatDate(r.date)}:</span> {r.remark}
          </span>
        </div>
      ))}

      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline w-fit"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> Show less</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> +{rest.length} more</>
          )}
        </button>
      )}
    </div>
  );
}

export default function AttendanceReportPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [category, setCategory] = useState<Category>("driver");
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(todayIst());
  const [rows, setRows] = useState<AttendanceSummaryRow[]>([]);
  const [remarks, setRemarks] = useState<DriverAttendanceRemark[]>([]);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    attendanceApi.getLatestDate(category).then(setLatestDate).catch(() => {});
  }, [category]);

  useEffect(() => {
    if (ready && user?.softwareDesignation !== "Admin") {
      router.replace("/");
    }
  }, [ready, user, router]);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    const summaryPromise = attendanceApi.getSummary(category, fromDate, toDate).then(setRows);
    const remarksPromise = category === "driver"
      ? attendanceApi.listDriverRemarks(undefined, undefined, fromDate, toDate).then(setRemarks)
      : Promise.resolve();
    Promise.all([summaryPromise, remarksPromise])
      .catch((err: unknown) => showError(err instanceof Error ? err.message : "Failed to load attendance report."))
      .finally(() => setLoading(false));
  }, [category, fromDate, toDate]);

  if (!ready || user?.softwareDesignation !== "Admin") return null;

  const isDriver = category === "driver";

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const remarksByDriver = remarks.reduce<Record<string, DriverAttendanceRemark[]>>((acc, r) => {
    (acc[r.driverId] ??= []).push(r);
    return acc;
  }, {});

  const driverTotals = rows.reduce(
    (acc, r) => ({
      onTrip: acc.onTrip + r.onTrip,
      onHalt: acc.onHalt + r.onHalt,
      leave: acc.leave + r.leave,
      onWorkshop: acc.onWorkshop + r.onWorkshop,
      notMarked: acc.notMarked + r.notMarked,
    }),
    { onTrip: 0, onHalt: 0, leave: 0, onWorkshop: 0, notMarked: 0 }
  );

  const staffTotals = rows.reduce(
    (acc, r) => ({
      present: acc.present + r.present,
      absent: acc.absent + r.absent,
      onLeave: acc.onLeave + r.onLeave,
      notMarked: acc.notMarked + r.notMarked,
    }),
    { present: 0, absent: 0, onLeave: 0, notMarked: 0 }
  );

  const driverColumns = ["Driver ID", "Name", "On Trip", "On Halt", "Leave", "On Workshop", "Not Marked", "Active Rate", "Remarks"];
  const staffColumns  = ["Staff ID",  "Name", "Present", "Absent",  "On Leave", "Not Marked", "% Present"];

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Attendance Report</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {isDriver
              ? "On Trip, On Halt, Leave, and On Workshop counts for drivers over any date range"
              : "Present, Absent, and On Leave day counts for staff over any date range"}
          </p>
        </div>
        {latestDate && (
          <div className="flex flex-col items-end sm:text-right">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Latest {isDriver ? "Driver" : "Staff"} Attendance Marked
            </span>
            <span className="mt-0.5 inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700 border border-blue-100">
              {formatDate(latestDate)}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["driver", "staff"] as Category[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setCategory(c); setSearch(""); }}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                category === c ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {c === "driver" ? "Drivers" : "Staff"}
            </button>
          ))}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isDriver ? "Search by name or driver ID…" : "Search by name or staff ID…"}
              className="h-9 w-64 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
            <DatePickerInput
              value={fromDate}
              onChange={setFromDate}
              className="w-full sm:w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
            <DatePickerInput
              value={toDate}
              onChange={setToDate}
              className="w-full sm:w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <PageSkeleton hasButton={false} hasSearch={false} statCards={4} columns={7} />
      ) : (
        <>
          {isDriver ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs font-medium tracking-wider text-blue-500 uppercase">On Trip</p>
                <p className="mt-1 text-2xl font-bold text-blue-700">{driverTotals.onTrip}</p>
              </div>
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-xs font-medium tracking-wider text-orange-500 uppercase">On Halt</p>
                <p className="mt-1 text-2xl font-bold text-orange-700">{driverTotals.onHalt}</p>
              </div>
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                <p className="text-xs font-medium tracking-wider text-yellow-500 uppercase">Leave</p>
                <p className="mt-1 text-2xl font-bold text-yellow-700">{driverTotals.leave}</p>
              </div>
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
                <p className="text-xs font-medium tracking-wider text-purple-500 uppercase">On Workshop</p>
                <p className="mt-1 text-2xl font-bold text-purple-700">{driverTotals.onWorkshop}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Not Marked</p>
                <p className="mt-1 text-2xl font-bold text-gray-500">{driverTotals.notMarked}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Present</p>
                <p className="mt-1 text-2xl font-bold text-green-600">{staffTotals.present}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Absent</p>
                <p className="mt-1 text-2xl font-bold text-red-600">{staffTotals.absent}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total On Leave</p>
                <p className="mt-1 text-2xl font-bold text-yellow-600">{staffTotals.onLeave}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Not Marked</p>
                <p className="mt-1 text-2xl font-bold text-gray-500">{staffTotals.notMarked}</p>
              </div>
            </div>
          )}

          <div className="overflow-auto max-h-[75vh] rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-200 bg-gray-50">
                  {(isDriver ? driverColumns : staffColumns).map((col) => (
                    <th key={col} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={isDriver ? 9 : 7} className="px-4 py-10 text-center text-sm text-gray-400">
                      {search ? "No results match your search." : `No ${isDriver ? "drivers" : "staff"} found.`}
                    </td>
                  </tr>
                ) : isDriver ? (
                  filteredRows.map((r) => {
                    const active = r.onTrip + r.onHalt + r.onWorkshop;
                    const pct = r.totalDays > 0 ? Math.round((active / r.totalDays) * 100) : 0;
                    const driverRemarks = remarksByDriver[r.code] ?? [];
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.code}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.name}</td>
                        <td className="px-4 py-3 font-semibold text-blue-700">{r.onTrip}</td>
                        <td className="px-4 py-3 font-semibold text-orange-600">{r.onHalt}</td>
                        <td className="px-4 py-3 font-semibold text-yellow-700">{r.leave}</td>
                        <td className="px-4 py-3 font-semibold text-purple-700">{r.onWorkshop}</td>
                        <td className="px-4 py-3 text-gray-500">{r.notMarked}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold",
                            pct >= 90 ? "bg-green-100 text-green-700" : pct >= 70 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600"
                          )}>
                            {pct}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <RemarksList remarks={driverRemarks} />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  filteredRows.map((r) => {
                    const pct = r.totalDays > 0 ? Math.round((r.present / r.totalDays) * 100) : 0;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.code}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.name}</td>
                        <td className="px-4 py-3 font-semibold text-green-700">{r.present}</td>
                        <td className="px-4 py-3 font-semibold text-red-600">{r.absent}</td>
                        <td className="px-4 py-3 font-semibold text-yellow-700">{r.onLeave}</td>
                        <td className="px-4 py-3 text-gray-500">{r.notMarked}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-semibold",
                            pct >= 90 ? "bg-green-100 text-green-700" : pct >= 70 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-600"
                          )}>
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
