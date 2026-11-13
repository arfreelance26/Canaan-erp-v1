"use client";

import { useEffect, useMemo, useState } from "react";
import { RiBarChartBoxLine as BarChart3, RiMessage3Line as MessageSquare, RiArrowDownSLine as ChevronDown, RiArrowUpSLine as ChevronUp } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { attendanceApi } from "@/lib/api";
import { showError } from "@/lib/feedback";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PillSearch } from "@/components/ui/PillSearch";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { AttendanceReport } from "@/lib/attendance-report-pdf";
import { cn } from "@/lib/utils";
import type { AttendanceSummaryRow, DriverAttendanceRemark } from "@/types/attendance";
import { formatDate } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
type Category = "driver" | "staff";
type ViewMode = "summary" | "datewise";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastOfMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0); // day 0 of next month = last day of this month
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

// Inclusive list of "YYYY-MM-DD" dates between from and to.
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  if (!from || !to) return out;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  if (start > end) return out;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

// Register cell display: single-letter code + color per attendance status.
const STATUS_DISPLAY: Record<string, { abbr: string; cls: string; title: string }> = {
  "Present":     { abbr: "P", cls: "bg-success-surface-strong text-success-text",   title: "Present" },
  "Absent":      { abbr: "A", cls: "bg-danger-surface-strong text-danger-text",       title: "Absent" },
  "On Leave":    { abbr: "L", cls: "bg-warning-surface-strong text-warning-text", title: "On Leave" },
  "Leave":       { abbr: "L", cls: "bg-warning-surface-strong text-warning-text", title: "Leave" },
  "On Trip":     { abbr: "T", cls: "bg-accent-surface-strong text-accent-text",           title: "On Trip" },
  "On Halt":     { abbr: "H", cls: "bg-orange-surface-strong text-orange-text", title: "On Halt" },
  "On Workshop": { abbr: "W", cls: "bg-purple-surface-strong text-purple-text", title: "On Workshop" },
  "Holiday":     { abbr: "H", cls: "bg-accent-surface-strong text-accent-text",         title: "Holiday" },
  "Not Marked":  { abbr: ".", cls: "bg-fill-1 text-text-tertiary",      title: "Not Marked" },
};

function RemarksList({ remarks }: { remarks: DriverAttendanceRemark[] }) {
  const [expanded, setExpanded] = useState(false);
  if (remarks.length === 0) return <span className="text-xs text-text-tertiary">—</span>;

  const preview = remarks.slice(0, 2);
  const rest = remarks.slice(2);

  return (
    <div className="flex flex-col gap-1 max-w-[280px]">
      {preview.map((r) => (
        <div key={r.id} className="flex items-start gap-1.5">
          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-text-tertiary" />
          <span className="text-xs text-text-primary whitespace-normal break-words">
            <span className="font-medium text-text-secondary">{formatDate(r.date)}:</span> {r.remark}
          </span>
        </div>
      ))}

      {rest.length > 0 && expanded && rest.map((r) => (
        <div key={r.id} className="flex items-start gap-1.5">
          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-text-tertiary" />
          <span className="text-xs text-text-primary whitespace-normal break-words">
            <span className="font-medium text-text-secondary">{formatDate(r.date)}:</span> {r.remark}
          </span>
        </div>
      ))}

      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-accent-text hover:underline w-fit"
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
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(lastOfMonth());
  const [rows, setRows] = useState<AttendanceSummaryRow[]>([]);
  const [remarks, setRemarks] = useState<DriverAttendanceRemark[]>([]);
  // Per-day status lookup for the date-wise register: personCode -> date -> status
  const [statusMap, setStatusMap] = useState<Record<string, Record<string, string>>>({});
  // Government/company holidays in range (staff only): date -> holiday name
  const [holidayMap, setHolidayMap] = useState<Record<string, string>>({});
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    attendanceApi.getLatestDate(category).then(setLatestDate).catch(() => {});
  }, [category]);

  const isCommercialManager = user?.softwareDesignation === "Commercial Manager" || user?.softwareDesignation === "Assistant Commercial Manager";

  useEffect(() => {
    if (ready && user?.softwareDesignation !== "Admin" && !isCommercialManager) {
      router.replace("/");
    }
    // Commercial Manager can only view drivers — force category if somehow set to staff
    if (isCommercialManager && category === "staff") {
      setCategory("driver");
    }
  }, [ready, user, router, isCommercialManager, category]);

  useEffect(() => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    const summaryPromise = attendanceApi.getSummary(category, fromDate, toDate).then(setRows);
    const remarksPromise = category === "driver"
      ? attendanceApi.listDriverRemarks(undefined, undefined, fromDate, toDate).then(setRemarks)
      : Promise.resolve();

    // Date-wise register: fetch every daily record in the range and build a
    // personCode -> date -> status lookup.
    const registerPromise = viewMode === "datewise"
      ? (category === "driver"
          ? attendanceApi.listDrivers(undefined, undefined, fromDate, toDate).then((recs) => {
              const map: Record<string, Record<string, string>> = {};
              recs.forEach((r) => { (map[r.driverId] ??= {})[r.date] = r.status; });
              setStatusMap(map);
            })
          : attendanceApi.listStaff(undefined, undefined, fromDate, toDate).then((recs) => {
              const map: Record<string, Record<string, string>> = {};
              recs.forEach((r) => { (map[r.staffId] ??= {})[r.date] = r.status; });
              setStatusMap(map);
            }))
      : Promise.resolve();

    // Holidays are staff-attendance only (Sundays are derived from the date).
    const holidaysPromise = (viewMode === "datewise" && category === "staff")
      ? attendanceApi.listHolidays(fromDate, toDate).then((hs) => {
          const map: Record<string, string> = {};
          hs.forEach((h) => { map[h.date] = h.name; });
          setHolidayMap(map);
        })
      : Promise.resolve(setHolidayMap({}));

    Promise.all([summaryPromise, remarksPromise, registerPromise, holidaysPromise])
      .catch((err: unknown) => showError(err instanceof Error ? err.message : "Failed to load attendance report."))
      .finally(() => setLoading(false));
  }, [category, fromDate, toDate, viewMode]);

  // Hooks must run unconditionally on every render — this early return sits
  // AFTER every useMemo/useState/useEffect in the component, never before.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const dates = useMemo(() => dateRange(fromDate, toDate), [fromDate, toDate]);

  if (!ready || (user?.softwareDesignation !== "Admin" && !isCommercialManager)) return null;

  const isDriver = category === "driver";

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
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Attendance Report</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              {isDriver
                ? "On Trip, On Halt, Leave, and On Workshop counts for drivers over any date range"
                : "Present, Absent, and On Leave day counts for staff over any date range"}
            </p>
          </div>
        </div>
        {latestDate && (
          <div className="flex flex-col items-end sm:text-right">
            <span className="text-caption-1-semibold text-text-secondary">
              Latest {isDriver ? "Driver" : "Staff"} Attendance Marked
            </span>
            <span className="mt-0.5 inline-flex items-center rounded-full bg-accent-surface px-2.5 py-1 text-body-medium text-accent-text border border-accent-border">
              {formatDate(latestDate)}
            </span>
          </div>
        )}
      </div>

      {/* Toolbar: category / search / view mode on the left, range + View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["driver", "staff"] as Category[])
            .filter((c) => !(isCommercialManager && c === "staff"))
            .map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setCategory(c); setSearch(""); }}
                className={cn(
                  "h-10 rounded-full px-4 text-body-medium transition duration-300",
                  category === c ? "bg-accent-solid text-on-solid shadow-sm" : "border border-separator-border bg-background-primary-default text-text-secondary shadow-sm hover:bg-fill-2"
                )}
              >
                {c === "driver" ? "Drivers" : "Staff"}
              </button>
            ))}
        </div>

        <PillSearch
          value={search}
          onChange={setSearch}
          placeholder={isDriver ? "Search by name or driver ID…" : "Search by name or staff ID…"}
        />

        {/* View toggle: aggregated Summary vs day-by-day Register */}
        <div className="inline-flex h-10 items-center rounded-full border border-separator-border bg-background-primary-default p-1 shadow-sm">
          {([["summary", "Summary"], ["datewise", "Date-wise"]] as [ViewMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                "h-8 rounded-full px-3.5 text-body-medium transition-colors",
                viewMode === mode ? "bg-accent-solid text-on-solid shadow-sm" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
          {/* The person-wise report: Summary, Register, a sheet per person (+ its PDF). */}
          <ReportViewButton
            path="/exports/attendance-report"
            filename={`${isDriver ? "Driver" : "Staff"}_Attendance.xlsx`}
            title={`${isDriver ? "Driver" : "Staff"} Attendance Report — ${fromDate.split("-").reverse().join("-")} to ${toDate.split("-").reverse().join("-")}${search.trim() ? ` — "${search.trim()}"` : ""}`}
            params={{ category, from_date: fromDate, to_date: toDate, ...(search.trim() ? { search: search.trim() } : {}) }}
            pdf={(report, file) => import("@/lib/attendance-report-pdf").then((m) => m.downloadAttendanceReportPdf({ report: report as AttendanceReport, filename: file }))}
          />
        </div>
      </div>

      {loading ? (
        <PageSkeleton hasButton={false} hasSearch={false} statCards={4} columns={7} />
      ) : viewMode === "datewise" ? (
        <>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-separator-border bg-background-primary-default px-4 py-3 text-xs">
            <span className="font-semibold text-text-secondary">Legend</span>
            {(isDriver
              ? ["On Trip", "On Halt", "Leave", "On Workshop", "Not Marked"]
              : ["Present", "Absent", "On Leave", "Holiday", "Not Marked"]
            ).map((s) => {
              const d = STATUS_DISPLAY[s] ?? STATUS_DISPLAY["Not Marked"];
              return (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded text-caption-2-semibold", d.cls)}>{d.abbr}</span>
                  <span className="text-text-secondary">{s}</span>
                </span>
              );
            })}
          </div>

          <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default">
            <table className="border-collapse text-sm">
              <thead className="sticky top-0 z-20">
                <tr className="bg-fill-1">
                  <th className="sticky left-0 z-30 min-w-[180px] border-b border-r border-separator-border bg-fill-1 px-4 py-3 text-left text-caption-1-semibold text-text-secondary">
                    {isDriver ? "Driver" : "Staff"}
                  </th>
                  {dates.map((d) => {
                    const [yy, mm, dd] = d.split("-").map(Number);
                    const dt = new Date(yy, mm - 1, dd);
                    const isSunday = dt.getDay() === 0;
                    const holidayName = !isDriver ? holidayMap[d] : undefined;
                    const isHoliday = Boolean(holidayName) && !isSunday;
                    return (
                      <th
                        key={d}
                        title={isSunday ? `${formatDate(d)} — Sunday` : holidayName ? `${formatDate(d)} — ${holidayName}` : undefined}
                        className={cn(
                          "min-w-[34px] border-b border-separator-border px-1 py-2 text-center text-caption-2-semibold",
                          isSunday ? "bg-danger-surface" : isHoliday ? "bg-accent-surface" : ""
                        )}
                      >
                        <div className={isSunday ? "text-danger-text" : isHoliday ? "text-accent-text" : "text-text-primary"}>{dd}</div>
                        <div className={isSunday ? "text-danger-text" : isHoliday ? "text-accent-text" : "text-text-tertiary"}>{dt.toLocaleDateString("en-IN", { weekday: "narrow" })}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <PagedTbody className="divide-y divide-separator-border" items={filteredRows} head={<>{filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={dates.length + 1} className="p-0"><EmptyState size="compact" illustration="not-found" title={search ? "No results match your search" : `No ${isDriver ? "drivers" : "staff"} found`} /></td>
                  </tr>
                ) : null}</>}>
                {(r) => (
                    <tr key={r.id} className="hover:bg-fill-2">
                      <td className="sticky left-0 z-10 border-r border-separator-border bg-background-primary-default px-4 py-2">
                        <div className="whitespace-nowrap font-medium text-text-primary">{r.name}</div>
                        <div className="text-xs text-text-tertiary">{r.code}</div>
                      </td>
                      {dates.map((d) => {
                        // Drivers key the status map by driver code; staff records
                        // key by the numeric staff id (which the summary exposes as r.id).
                        const recorded = statusMap[isDriver ? r.code : r.id]?.[d];
                        // Staff: Sunday / government holiday shows as "Holiday" unless a
                        // real attendance record was marked that day (record wins).
                        const [yy, mm, dd] = d.split("-").map(Number);
                        const isSunday = new Date(yy, mm - 1, dd).getDay() === 0;
                        const holidayName = !isDriver ? holidayMap[d] : undefined;
                        const isHoliday = !isDriver && (isSunday || Boolean(holidayName));
                        const st = recorded ?? (isHoliday ? "Holiday" : "Not Marked");
                        const disp = STATUS_DISPLAY[st] ?? STATUS_DISPLAY["Not Marked"];
                        const cellTitle = st === "Holiday"
                          ? `${formatDate(d)} — ${isSunday ? "Sunday" : holidayName}`
                          : `${formatDate(d)} — ${disp.title}`;
                        return (
                          <td key={d} className="px-1 py-2 text-center" title={cellTitle}>
                            <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded text-caption-2-semibold", disp.cls)}>
                              {disp.abbr}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  )}
              </PagedTbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {isDriver ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div className="rounded-xl border border-accent-border bg-accent-surface p-4">
                <p className="text-caption-1-medium text-accent-text">On Trip</p>
                <p className="mt-1 text-title-1-semibold text-accent-text">{driverTotals.onTrip}</p>
              </div>
              <div className="rounded-xl border border-orange-border bg-orange-surface p-4">
                <p className="text-caption-1-medium text-orange-text">On Halt</p>
                <p className="mt-1 text-title-1-semibold text-orange-text">{driverTotals.onHalt}</p>
              </div>
              <div className="rounded-xl border border-warning-border bg-warning-surface p-4">
                <p className="text-caption-1-medium text-warning-text">Leave</p>
                <p className="mt-1 text-title-1-semibold text-warning-text">{driverTotals.leave}</p>
              </div>
              <div className="rounded-xl border border-purple-border bg-purple-surface p-4">
                <p className="text-caption-1-medium text-purple-text">On Workshop</p>
                <p className="mt-1 text-title-1-semibold text-purple-text">{driverTotals.onWorkshop}</p>
              </div>
              <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
                <p className="text-caption-1-medium text-text-secondary">Not Marked</p>
                <p className="mt-1 text-title-1-semibold text-text-secondary">{driverTotals.notMarked}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
                <p className="text-caption-1-medium text-text-secondary">Total Present</p>
                <p className="mt-1 text-title-1-semibold text-success-text">{staffTotals.present}</p>
              </div>
              <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
                <p className="text-caption-1-medium text-text-secondary">Total Absent</p>
                <p className="mt-1 text-title-1-semibold text-danger-text">{staffTotals.absent}</p>
              </div>
              <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
                <p className="text-caption-1-medium text-text-secondary">Total On Leave</p>
                <p className="mt-1 text-title-1-semibold text-warning-text">{staffTotals.onLeave}</p>
              </div>
              <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
                <p className="text-caption-1-medium text-text-secondary">Total Not Marked</p>
                <p className="mt-1 text-title-1-semibold text-text-secondary">{staffTotals.notMarked}</p>
              </div>
            </div>
          )}

          <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-separator-border bg-fill-1">
                  {(isDriver ? driverColumns : staffColumns).map((col) => (
                    <th key={col} className="px-4 py-3 text-caption-1-semibold text-text-secondary whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <PagedTbody className="divide-y divide-separator-border" items={filteredRows} head={filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={isDriver ? 9 : 7} className="p-0"><EmptyState size="compact" illustration="not-found" title={search ? "No results match your search" : `No ${isDriver ? "drivers" : "staff"} found`} /></td>
                  </tr>
                ) : null}>
                {(r) => isDriver ? (() => {
                    const active = r.onTrip + r.onHalt + r.onWorkshop;
                    const pct = r.totalDays > 0 ? Math.round((active / r.totalDays) * 100) : 0;
                    const driverRemarks = remarksByDriver[r.code] ?? [];
                    return (
                      <tr key={r.id} className="hover:bg-fill-2">
                        <td className="px-4 py-3 font-medium text-text-primary whitespace-nowrap">{r.code}</td>
                        <td className="px-4 py-3 text-text-primary whitespace-nowrap">{r.name}</td>
                        <td className="px-4 py-3 font-semibold text-accent-text">{r.onTrip}</td>
                        <td className="px-4 py-3 font-semibold text-orange-text">{r.onHalt}</td>
                        <td className="px-4 py-3 font-semibold text-warning-text">{r.leave}</td>
                        <td className="px-4 py-3 font-semibold text-purple-text">{r.onWorkshop}</td>
                        <td className="px-4 py-3 text-text-secondary">{r.notMarked}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn(
                            "rounded-full px-2.5 py-1 text-caption-1-semibold",
                            pct >= 90 ? "bg-success-surface-strong text-success-text" : pct >= 70 ? "bg-warning-surface-strong text-warning-text" : "bg-danger-surface-strong text-danger-text"
                          )}>
                            {pct}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <RemarksList remarks={driverRemarks} />
                        </td>
                      </tr>
                    );
                })() : (() => {
                    const pct = r.totalDays > 0 ? Math.round((r.present / r.totalDays) * 100) : 0;
                    return (
                      <tr key={r.id} className="hover:bg-fill-2">
                        <td className="px-4 py-3 font-medium text-text-primary whitespace-nowrap">{r.code}</td>
                        <td className="px-4 py-3 text-text-primary whitespace-nowrap">{r.name}</td>
                        <td className="px-4 py-3 font-semibold text-success-text">{r.present}</td>
                        <td className="px-4 py-3 font-semibold text-danger-text">{r.absent}</td>
                        <td className="px-4 py-3 font-semibold text-warning-text">{r.onLeave}</td>
                        <td className="px-4 py-3 text-text-secondary">{r.notMarked}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn(
                            "rounded-full px-2.5 py-1 text-caption-1-semibold",
                            pct >= 90 ? "bg-success-surface-strong text-success-text" : pct >= 70 ? "bg-warning-surface-strong text-warning-text" : "bg-danger-surface-strong text-danger-text"
                          )}>
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                })()}
              </PagedTbody>
            </table>
          </div>
        </>
      )}

    </div>
  );
}
