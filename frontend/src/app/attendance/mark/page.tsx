"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, XCircle, CalendarOff, ChevronLeft, ChevronRight, LogOut, ShieldAlert, Clock, CalendarCheck, Timer,
} from "lucide-react";
import { attendanceApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import type { StaffAttendanceRecord, StaffSelfSummary } from "@/types/attendance";
import { todayIst } from "@/lib/format-date";
import { showError } from "@/lib/swal";

const APPRECIATION = [
  "Thank you for your hard work today. We truly appreciate you.",
  "Thank you for showing up and giving your best today. It means a lot.",
  "Your hard work never goes unnoticed. Thank you for everything you do.",
  "Thank you for another day of dedication and effort. We appreciate you.",
  "You gave it your all today. Thank you for your commitment and hard work.",
  "Thank you for being part of the team and giving your best every day.",
  "Your effort makes a difference. Thank you for everything you do.",
  "Another day, another contribution that matters. Thank you for your hard work.",
  "Thank you for your time, effort, and dedication today. It truly matters.",
  "We appreciate the work you put in today. Thank you for being there and giving your best.",
];

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

/** "09:30 AM" / "18:05" → minutes since midnight (null when it can't be read). */
function toMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function shiftLength(inTime: string | null, outTime: string | null): string | null {
  const a = toMinutes(inTime);
  const b = toMinutes(outTime);
  if (a === null || b === null || b < a) return null;
  const mins = b - a;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

type MarkableStatus = "Present" | "Absent" | "On Leave";

// Static class strings so Tailwind can see them.
const ACTIONS: {
  status: MarkableStatus; label: string; hint: string; icon: React.ElementType; chip: string; hover: string;
}[] = [
  { status: "Present", label: "Present", hint: "Start your shift", icon: CheckCircle2, chip: "bg-emerald-100 text-emerald-600", hover: "hover:border-emerald-300" },
  { status: "Absent", label: "Absent", hint: "Not working today", icon: XCircle, chip: "bg-red-100 text-red-600", hover: "hover:border-red-300" },
  { status: "On Leave", label: "On leave", hint: "Away on approved leave", icon: CalendarOff, chip: "bg-amber-100 text-amber-600", hover: "hover:border-amber-300" },
];

const STATUS_DOT: Record<string, string> = {
  Present: "bg-emerald-500",
  Absent: "bg-red-500",
  "On Leave": "bg-amber-400",
  Holiday: "bg-blue-500",
  "Not Marked": "bg-gray-300",
};

const STATUS_PILL: Record<string, string> = {
  Present: "bg-emerald-50 text-emerald-700",
  Absent: "bg-red-50 text-red-700",
  "On Leave": "bg-amber-50 text-amber-700",
  Holiday: "bg-blue-50 text-blue-700",
  "Not Marked": "bg-gray-100 text-gray-500",
};

export default function MarkAttendancePage() {
  const { user, ready } = useAuth();
  const staffNumericId = user?.id ?? null;
  const today = todayIst();

  const [currentYear] = useState(() => new Date().getFullYear());
  const [currentMonth] = useState(() => new Date().getMonth() + 1);
  const [viewYear, setViewYear] = useState(currentYear);
  const [viewMonth, setViewMonth] = useState(currentMonth);

  const [todayRecord, setTodayRecord] = useState<StaffAttendanceRecord | null | undefined>(undefined);
  const [monthRecords, setMonthRecords] = useState<StaffAttendanceRecord[]>([]);
  const [monthHolidays, setMonthHolidays] = useState<Map<string, string>>(new Map()); // date → holiday name
  const [todayHolidayName, setTodayHolidayName] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [summary, setSummary] = useState<StaffSelfSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const [appreciationMsg, setAppreciationMsg] = useState<string | null>(null);

  // Auto-dismiss appreciation dialog after 6 seconds
  useEffect(() => {
    if (!appreciationMsg) return;
    const t = setTimeout(() => setAppreciationMsg(null), 6000);
    return () => clearTimeout(t);
  }, [appreciationMsg]);

  // Today's record
  useEffect(() => {
    if (!ready) return;
    if (!staffNumericId) { setTodayRecord(null); return; }
    attendanceApi
      .listStaff(today, staffNumericId)
      .then((recs) => setTodayRecord(recs[0] ?? null))
      .catch(() => setTodayRecord(null));
  }, [today, staffNumericId, ready]);

  // Month records for history
  useEffect(() => {
    if (!ready) return;
    if (!staffNumericId) { setHistoryLoading(false); return; }
    const from = `${viewYear}-${String(viewMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(viewYear, viewMonth, 0).getDate();
    const to = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    setHistoryLoading(true);
    attendanceApi
      .listStaff(undefined, staffNumericId, from, to)
      .then(setMonthRecords)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
    attendanceApi
      .listHolidays(from, to)
      .then((hs) => setMonthHolidays(new Map(hs.map((h) => [h.date, h.name]))))
      .catch(() => {});
  }, [viewYear, viewMonth, staffNumericId, ready]);

  // Is today itself a government/company holiday? (Sundays handled separately, from the date.)
  useEffect(() => {
    if (!ready) return;
    attendanceApi
      .listHolidays(today, today)
      .then((hs) => setTodayHolidayName(hs[0]?.name ?? null))
      .catch(() => {});
  }, [today, ready]);

  // Monthly summary
  useEffect(() => {
    if (!ready) return;
    if (!staffNumericId) { setSummaryLoading(false); return; }
    setSummaryLoading(true);
    attendanceApi
      .getStaffSelfSummary(staffNumericId, viewYear, viewMonth)
      .then(setSummary)
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, [viewYear, viewMonth, staffNumericId, ready]);

  // Re-fetch today's record when admin overrides it
  useWebSocketEvent("attendance_updated", (payload) => {
    if (!staffNumericId) return;
    const evtStaffId = (payload as { staff_id?: number }).staff_id;
    if (evtStaffId !== undefined && evtStaffId !== staffNumericId) return;
    attendanceApi
      .listStaff(today, staffNumericId)
      .then((recs) => setTodayRecord(recs[0] ?? null))
      .catch(() => {});
  });

  const handleMark = useCallback(
    async (status: MarkableStatus) => {
      if (marking || !staffNumericId) return;
      setMarking(true);
      try {
        const updated = await attendanceApi.selfMarkStaff(staffNumericId, status);
        setTodayRecord(updated);
        const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;
        if (isCurrentMonth) {
          setMonthRecords((prev) => [...prev.filter((r) => r.date !== today), updated]);
          attendanceApi.getStaffSelfSummary(staffNumericId, viewYear, viewMonth).then(setSummary).catch(() => {});
        }
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : "Failed to mark attendance.");
      } finally {
        setMarking(false);
      }
    },
    [marking, staffNumericId, today, viewYear, viewMonth, currentYear, currentMonth]
  );

  const handleCloseShift = useCallback(async () => {
    if (closingShift || !staffNumericId) return;
    setClosingShift(true);
    try {
      const updated = await attendanceApi.closeShiftStaff(staffNumericId);
      setTodayRecord(updated);
      const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;
      if (isCurrentMonth) {
        setMonthRecords((prev) => [...prev.filter((r) => r.date !== today), updated]);
      }
      setAppreciationMsg(APPRECIATION[Math.floor(Math.random() * APPRECIATION.length)]);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to close shift.");
    } finally {
      setClosingShift(false);
    }
  }, [closingShift, staffNumericId, today, viewYear, viewMonth, currentYear, currentMonth]);

  // History: all elapsed days in the viewed month, newest first
  const historyDates = useMemo(() => {
    const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;
    const upToDay = isCurrentMonth
      ? parseInt(today.split("-")[2])
      : new Date(viewYear, viewMonth, 0).getDate();
    const dates: string[] = [];
    for (let d = upToDay; d >= 1; d--) {
      dates.push(`${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return dates;
  }, [viewYear, viewMonth, today, currentYear, currentMonth]);

  const recordByDate = useMemo(() => {
    const map = new Map<string, StaffAttendanceRecord>();
    for (const r of monthRecords) map.set(r.date, r);
    return map;
  }, [monthRecords]);

  const canGoNext =
    viewYear < currentYear || (viewYear === currentYear && viewMonth < currentMonth);

  function prevMonth() {
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (!canGoNext) return;
    if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); }
    else setViewMonth((m) => m + 1);
  }

  const monthLabel = new Date(viewYear, viewMonth - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const todayLabelFull = new Date(today + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const todayLabelShort = new Date(today + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });

  const todayStatus = todayRecord?.status ?? "Not Marked";
  const todayLoaded = todayRecord !== undefined;
  // Sunday (JS getDay(): Sunday=0) or a government/company holiday → non-working day.
  const todayIsSunday = new Date(today + "T00:00:00").getDay() === 0;
  const todayHoliday = todayIsSunday ? "Sunday" : todayHolidayName;
  // If it's a holiday and nobody overrode it, show the virtual "Holiday" status.
  const displayTodayStatus = todayHoliday && todayStatus === "Not Marked" ? "Holiday" : todayStatus;
  const markedTime = fmtTime(todayRecord?.markedAt);
  const checkInTime = todayRecord?.checkInTime ?? null;
  const checkOutTime = todayRecord?.checkOutTime ?? null;
  const shiftOpen = todayStatus === "Present" && !checkOutTime;
  const adminOverridden = todayRecord?.adminOverride === true;
  const length = shiftLength(checkInTime, checkOutTime);

  const pct = Math.round(summary?.percentage ?? 0);
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - pct / 100);
  const ringColor = pct >= 75 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  const standingLabel = pct >= 75 ? "Good standing" : pct >= 50 ? "Needs improvement" : "Below threshold";
  const standingDot = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-500";

  if (!ready) return null;

  if (staffNumericId === null) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Mark Attendance</h1>
          <p className="mt-1 text-sm text-gray-500">{todayLabelFull}</p>
        </div>
        <div className="dk-inset flex flex-col items-center gap-4 rounded-2xl border border-amber-200/80 bg-amber-50/60 px-8 py-16 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 ring-8 ring-amber-50">
            <CalendarOff className="h-6 w-6" />
          </span>
          <div>
            <p className="text-base font-medium text-gray-900">Staff record not linked</p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-gray-500">
              No Staff record with <span className="font-medium text-gray-700">Software Designation = Admin</span> was found in the database.
              Please make sure the admin staff profile exists under <span className="font-medium text-gray-700">Our Staff</span>, then log out and back in.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-stagger mx-auto flex max-w-7xl flex-col gap-6">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Mark Attendance</h1>
        <p className="mt-1 text-sm text-gray-500">{todayLabelFull}</p>
      </div>

      {/* Main grid: left (stats + history) | right (today card, sticky) */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_380px]">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-4">

          {/* Monthly attendance */}
          <div className={`dk-inset overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm transition-opacity ${summaryLoading ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-blue-50/70 via-white to-white px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <CalendarCheck className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Monthly attendance</h2>
                  <p className="text-xs text-gray-500">{monthLabel}</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600">
                <i className={`h-1.5 w-1.5 rounded-full ${standingDot}`} />
                {standingLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-6 p-5">
              {/* Ring */}
              <div className="relative flex h-[104px] w-[104px] shrink-0 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r={r} fill="none" className="stroke-gray-200" strokeWidth="7" />
                  <circle
                    cx="50" cy="50" r={r} fill="none"
                    stroke={ringColor} strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-semibold leading-none tabular-nums text-gray-900">{pct}%</span>
                  <span className="mt-1 text-[10px] text-gray-400">attendance</span>
                </div>
              </div>

              <div className="flex min-w-[260px] flex-1 flex-col gap-3">
                <p className="text-sm text-gray-500">
                  <span className="font-medium tabular-nums text-gray-900">{summary?.present ?? 0}</span> present out of{" "}
                  <span className="font-medium tabular-nums text-gray-900">{summary?.workingDays ?? 26}</span> working days
                </p>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200/70">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: ringColor }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-5">
                  {[
                    { label: "Present", count: summary?.present ?? 0, dot: "bg-emerald-500" },
                    { label: "Absent", count: summary?.absent ?? 0, dot: "bg-red-500" },
                    { label: "On leave", count: summary?.onLeave ?? 0, dot: "bg-amber-400" },
                    { label: "Holiday", count: summary?.holidays ?? 0, dot: "bg-blue-500" },
                    { label: "Unmarked", count: summary?.notMarked ?? 0, dot: "bg-gray-300" },
                  ].map(({ label, count, dot }) => (
                    <div key={label} className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
                      <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        <i className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                        {label}
                      </p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Attendance history */}
          <div className="dk-inset overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-blue-50/70 via-white to-white px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <Clock className="h-4 w-4" />
                </span>
                <h2 className="text-sm font-semibold text-gray-900">Attendance history</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={prevMonth}
                  aria-label="Previous month"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-all duration-200 hover:scale-105 hover:border-blue-300 hover:text-blue-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[128px] text-center text-xs font-medium text-gray-700">{monthLabel}</span>
                <button
                  type="button"
                  onClick={nextMonth}
                  disabled={!canGoNext}
                  aria-label="Next month"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-all duration-200 hover:scale-105 hover:border-blue-300 hover:text-blue-700 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {historyLoading ? (
              <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
            ) : historyDates.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">No records yet this month</div>
            ) : (
              <div className="custom-scrollbar max-h-[380px] divide-y divide-gray-100 overflow-y-auto">
                {historyDates.map((dateStr) => {
                  const rec = recordByDate.get(dateStr);
                  const isToday = dateStr === today;
                  const d = new Date(dateStr + "T00:00:00");
                  // Holiday if Sunday or in the holiday master; a real record still wins.
                  const holidayName = d.getDay() === 0 ? "Sunday" : (monthHolidays.get(dateStr) ?? null);
                  const status = rec?.status ?? (holidayName ? "Holiday" : "Not Marked");
                  const dayName = d.toLocaleDateString("en-IN", { weekday: "short" });
                  const dayNum = d.getDate();
                  const monthShort = d.toLocaleDateString("en-IN", { month: "short" });
                  const time = fmtTime(rec?.markedAt);
                  return (
                    <div
                      key={dateStr}
                      className={`flex items-center gap-4 px-5 py-3 transition-colors ${isToday ? "bg-blue-50/60" : "hover:bg-gray-50/70"}`}
                    >
                      <div className="w-14 shrink-0">
                        <p className="text-sm font-medium tabular-nums text-gray-900">{dayNum} {monthShort}</p>
                        <p className="text-[11px] text-gray-400">{dayName}</p>
                      </div>

                      <div className="min-w-0 flex-1">
                        {isToday && (
                          <span className="mb-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">Today</span>
                        )}
                        {rec?.checkInTime ? (
                          <p className="text-xs text-gray-500">
                            <span className="text-gray-400">In</span> <span className="tabular-nums text-gray-700">{rec.checkInTime}</span>
                            {rec.checkOutTime && (
                              <> <span className="mx-1 text-gray-300">·</span> <span className="text-gray-400">Out</span> <span className="tabular-nums text-gray-700">{rec.checkOutTime}</span></>
                            )}
                          </p>
                        ) : time ? (
                          <p className="text-xs text-gray-400">Marked at {time}</p>
                        ) : holidayName && holidayName !== "Sunday" ? (
                          <p className="text-xs text-blue-600/80">{holidayName}</p>
                        ) : (
                          <p className="text-xs text-gray-300">—</p>
                        )}
                      </div>

                      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_PILL[status]}`}>
                        <i className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Today card (sticky) ── */}
        <div className="dk-inset sticky top-4 flex flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">

          {/* Person */}
          <div className="flex items-center gap-3 border-b border-gray-100 bg-gradient-to-r from-blue-50/70 via-white to-white px-5 py-4">
            {user?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoUrl} alt={user.name} className="h-11 w-11 rounded-full object-cover ring-2 ring-white" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700 ring-2 ring-white">
                {getInitials(user?.name ?? "U")}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{user?.name ?? "—"}</p>
              <p className="truncate text-xs text-gray-500">{user?.softwareDesignation ?? ""}</p>
            </div>
          </div>

          {/* Today + status */}
          <div className="px-5 pb-1 pt-5 text-center">
            <p className="text-[11px] uppercase tracking-wider text-gray-400">Today</p>
            <p className="mt-1 text-lg font-medium text-gray-900">{todayLabelShort}</p>
            <div className="mt-3 flex justify-center">
              {todayLoaded ? (
                <span className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${STATUS_PILL[displayTodayStatus]}`}>
                  <i className={`h-2 w-2 rounded-full ${STATUS_DOT[displayTodayStatus]}`} />
                  {displayTodayStatus}
                </span>
              ) : (
                <span className="inline-block h-8 w-28 animate-pulse rounded-full bg-gray-100" />
              )}
            </div>
            {markedTime && <p className="mt-2 text-xs text-gray-400">Marked at {markedTime}</p>}
          </div>

          {/* Action area */}
          <div className="flex flex-1 flex-col gap-2.5 p-5">

            {/* Admin override */}
            {adminOverridden && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200/80 bg-red-50/70 px-4 py-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div>
                  <p className="text-xs font-medium text-red-700">Updated by admin</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-red-600/80">
                    Your attendance for today was changed by Admin. Contact admin if you think this is incorrect.
                  </p>
                </div>
              </div>
            )}

            {/* Holiday — nothing to mark */}
            {todayHoliday && todayStatus === "Not Marked" && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-blue-200/80 bg-blue-50/70 px-4 py-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <CalendarOff className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium text-gray-900">
                  {todayHoliday === "Sunday" ? "Sunday holiday" : "Holiday"}
                </p>
                {todayHoliday !== "Sunday" && <p className="text-xs text-blue-700">{todayHoliday}</p>}
                <p className="text-xs text-gray-500">Enjoy your day off — no attendance needed today.</p>
              </div>
            )}

            {/* Not marked yet → three choices */}
            {todayStatus === "Not Marked" && !adminOverridden && !todayHoliday && (
              <>
                <p className="mb-0.5 text-[11px] uppercase tracking-wider text-gray-400">How is your day?</p>
                {ACTIONS.map(({ status, label, hint, icon: Icon, chip, hover }) => (
                  <button
                    key={status}
                    type="button"
                    disabled={marking || !todayLoaded}
                    onClick={() => handleMark(status)}
                    className={`group flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${hover} disabled:pointer-events-none disabled:opacity-50`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${chip}`}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">{label}</span>
                      <span className="block text-xs text-gray-500">{hint}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gray-500" />
                  </button>
                ))}
              </>
            )}

            {/* Present → shift times + close shift */}
            {todayStatus === "Present" && (
              <div className="flex flex-col gap-2.5">
                <p className="text-[11px] uppercase tracking-wider text-gray-400">
                  {checkOutTime ? "Shift complete" : adminOverridden ? "Marked by admin" : "Shift in progress"}
                </p>

                {checkInTime && (
                  <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
                    <span className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                      Checked in
                    </span>
                    <span className="text-sm font-medium tabular-nums text-gray-900">{checkInTime}</span>
                  </div>
                )}

                {checkOutTime ? (
                  <>
                    <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
                      <span className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                          <LogOut className="h-4 w-4" />
                        </span>
                        Checked out
                      </span>
                      <span className="text-sm font-medium tabular-nums text-gray-900">{checkOutTime}</span>
                    </div>
                    {length && (
                      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
                        <span className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                            <Timer className="h-4 w-4" />
                          </span>
                          Shift length
                        </span>
                        <span className="text-sm font-medium tabular-nums text-gray-900">{length}</span>
                      </div>
                    )}
                  </>
                ) : !adminOverridden ? (
                  <button
                    type="button"
                    disabled={closingShift}
                    onClick={handleCloseShift}
                    className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-blue-600 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-[1.02] hover:bg-blue-700 hover:shadow-md disabled:pointer-events-none disabled:opacity-60"
                  >
                    <LogOut className="h-4 w-4" />
                    {closingShift ? "Closing…" : "Close shift"}
                  </button>
                ) : null}
              </div>
            )}

            {/* Absent / On Leave → locked */}
            {(todayStatus === "Absent" || todayStatus === "On Leave") && (
              <div className="flex flex-col items-center gap-1 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-6 text-center">
                <p className="text-sm font-medium text-gray-900">Attendance recorded</p>
                <p className="text-xs text-gray-500">No further action is needed for today.</p>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t border-gray-100 px-5 py-3 text-center">
            <p className="text-xs text-gray-400">
              {todayHoliday && todayStatus === "Not Marked"
                ? todayHoliday === "Sunday" ? "Sunday is a weekly holiday" : `Holiday: ${todayHoliday}`
                : adminOverridden
                ? "Updated by admin — contact admin to dispute"
                : !todayLoaded || todayStatus === "Not Marked"
                ? "Attendance can only be marked for today"
                : shiftOpen
                ? "Close your shift when you leave for the day"
                : "Attendance is locked for today"}
            </p>
          </div>
        </div>

      </div>

      {/* ── Appreciation dialog ── */}
      {appreciationMsg && (
        <>
          <style>{`
            @keyframes dialogIn {
              from { opacity: 0; transform: scale(0.9); }
              to   { opacity: 1; transform: scale(1);   }
            }
            @keyframes fadeChar {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
            @keyframes drainBar {
              from { transform: scaleX(1); }
              to   { transform: scaleX(0); }
            }
          `}</style>

          {/* Overlay — click outside to close */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm"
            onClick={() => setAppreciationMsg(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
              style={{ animation: "dialogIn 0.3s ease forwards" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center border-b border-gray-100 bg-gradient-to-b from-blue-50/60 to-transparent px-8 py-7">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/companylogo.png" alt="Canaan" className="h-14 w-auto object-contain" />
              </div>

              {/* Message — split at first ". " into two animated lines */}
              <div className="px-10 py-9 text-center">
                {(() => {
                  const dotIdx = appreciationMsg.indexOf(". ");
                  const line1 = dotIdx !== -1 ? appreciationMsg.slice(0, dotIdx + 1) : appreciationMsg;
                  const line2 = dotIdx !== -1 ? appreciationMsg.slice(dotIdx + 2) : "";
                  const line2Offset = line1.length * 36 + 300;
                  return (
                    <div className="flex flex-col gap-3">
                      <p className="text-[17px] font-medium leading-relaxed text-gray-800">
                        {line1.split("").map((char, i) => (
                          <span key={i} style={{ opacity: 0, animation: "fadeChar 0.22s ease forwards", animationDelay: `${i * 36}ms` }}>
                            {char}
                          </span>
                        ))}
                      </p>
                      {line2 && (
                        <p className="text-[15px] leading-relaxed text-gray-500">
                          {line2.split("").map((char, i) => (
                            <span key={i} style={{ opacity: 0, animation: "fadeChar 0.22s ease forwards", animationDelay: `${line2Offset + i * 36}ms` }}>
                              {char}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Auto-dismiss progress bar — drains over 6 seconds */}
              <div className="mx-8 mb-6 h-0.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-brand-gold"
                  style={{ transformOrigin: "left", animation: "drainBar 6s linear forwards" }}
                />
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
