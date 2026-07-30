"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, CalendarOff, ChevronLeft, ChevronRight, Check, LogOut, ShieldAlert } from "lucide-react";
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

type MarkableStatus = "Present" | "Absent" | "On Leave";

const ACTIONS: { status: MarkableStatus; label: string; icon: React.ElementType; idle: string; active: string }[] = [
  {
    status: "Present",
    label: "Present",
    icon: CheckCircle2,
    idle: "border-gray-200 text-gray-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700",
    active: "border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-200",
  },
  {
    status: "Absent",
    label: "Absent",
    icon: XCircle,
    idle: "border-gray-200 text-gray-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700",
    active: "border-red-500 bg-red-500 text-white shadow-md shadow-red-200",
  },
  {
    status: "On Leave",
    label: "On Leave",
    icon: CalendarOff,
    idle: "border-gray-200 text-gray-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700",
    active: "border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-200",
  },
];

const STATUS_DOT: Record<string, string> = {
  Present: "bg-emerald-500",
  Absent: "bg-red-500",
  "On Leave": "bg-amber-400",
  "Not Marked": "bg-gray-300",
};

const STATUS_BADGE: Record<string, string> = {
  Present: "bg-emerald-100 text-emerald-700",
  Absent: "bg-red-100 text-red-700",
  "On Leave": "bg-amber-100 text-amber-700",
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
  }, [viewYear, viewMonth, staffNumericId, ready]);

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
  const markedTime = fmtTime(todayRecord?.markedAt);
  const checkInTime = todayRecord?.checkInTime ?? null;
  const checkOutTime = todayRecord?.checkOutTime ?? null;
  const shiftOpen = todayStatus === "Present" && !checkOutTime;
  const adminOverridden = todayRecord?.adminOverride === true;

  const pct = Math.round(summary?.percentage ?? 0);
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - pct / 100);
  const ringColor = pct >= 75 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  const standingLabel = pct >= 75 ? "Good standing" : pct >= 50 ? "Needs improvement" : "Below threshold";
  const standingColor = pct >= 75 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-600";

  if (!ready) return null;

  if (staffNumericId === null) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mark Attendance</h1>
          <p className="mt-1 text-sm text-gray-500">{todayLabelFull}</p>
        </div>
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-8 py-16 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
            <CalendarOff className="h-7 w-7 text-amber-500" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-800">Staff record not linked</p>
            <p className="mt-1 text-sm text-gray-500">
              No Staff record with <strong>Software Designation = Admin</strong> was found in the database.
              <br />
              Please ensure the admin staff profile is created under <strong>Our Staff</strong>, then log out and back in.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-stagger mx-auto flex max-w-5xl flex-col gap-5">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mark Attendance</h1>
        <p className="mt-1 text-sm text-gray-500">{todayLabelFull}</p>
      </div>

      {/* Main grid: left (stats + history) | right (mark card, sticky) */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-4">

          {/* Monthly Stats card */}
          <div className={`overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-opacity ${summaryLoading ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <p className="text-sm font-bold text-gray-800">Monthly Attendance</p>
              <span className={`text-xs font-semibold ${standingColor}`}>{standingLabel}</span>
            </div>

            <div className="flex items-center gap-6 p-5">
              {/* Ring */}
              <div className="relative flex h-[100px] w-[100px] shrink-0 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
                  <circle
                    cx="50" cy="50" r={r} fill="none"
                    stroke={ringColor} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-[22px] font-extrabold leading-none text-gray-800">{pct}%</span>
                  <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-gray-400">attendance</span>
                </div>
              </div>

              {/* Right side of stats */}
              <div className="flex flex-1 flex-col gap-3">
                <p className="text-xs text-gray-500">
                  <span className="font-bold text-gray-700">{summary?.present ?? 0}</span> present out of{" "}
                  <span className="font-bold text-gray-700">{summary?.workingDays ?? 26}</span> working days
                </p>

                {/* Progress bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: ringColor }}
                  />
                </div>

                {/* Four counts */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[
                    { label: "Present",  count: summary?.present  ?? 0, dot: "bg-emerald-500", text: "text-emerald-600" },
                    { label: "Absent",   count: summary?.absent   ?? 0, dot: "bg-red-500",     text: "text-red-600" },
                    { label: "On Leave", count: summary?.onLeave  ?? 0, dot: "bg-amber-400",   text: "text-amber-600" },
                    { label: "Unmarked", count: summary?.notMarked ?? 0, dot: "bg-gray-300",   text: "text-gray-400" },
                  ].map(({ label, count, dot, text }) => (
                    <div key={label} className="flex flex-col items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${dot}`} />
                      <p className={`text-lg font-bold leading-none ${text}`}>{count}</p>
                      <p className="text-[9px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Attendance History card */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <p className="text-sm font-bold text-gray-800">Attendance History</p>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[120px] text-center text-xs font-semibold text-gray-600">{monthLabel}</span>
                <button
                  type="button"
                  onClick={nextMonth}
                  disabled={!canGoNext}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-25"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {historyLoading ? (
              <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
            ) : historyDates.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No records yet this month</div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-50">
                {historyDates.map((dateStr) => {
                  const rec = recordByDate.get(dateStr);
                  const status = rec?.status ?? "Not Marked";
                  const isToday = dateStr === today;
                  const d = new Date(dateStr + "T00:00:00");
                  const dayName = d.toLocaleDateString("en-IN", { weekday: "short" });
                  const dayNum = d.getDate();
                  const monthShort = d.toLocaleDateString("en-IN", { month: "short" });
                  const time = fmtTime(rec?.markedAt);
                  return (
                    <div
                      key={dateStr}
                      className={`flex items-center gap-3 px-5 py-2.5 ${isToday ? "bg-indigo-50/60" : "hover:bg-gray-50/40"}`}
                    >
                      {/* Date block */}
                      <div className={`flex w-10 shrink-0 flex-col items-center rounded-lg py-1 ${isToday ? "bg-indigo-100" : "bg-gray-50"}`}>
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${isToday ? "text-indigo-400" : "text-gray-400"}`}>{dayName}</span>
                        <span className={`text-base font-extrabold leading-tight ${isToday ? "text-indigo-700" : "text-gray-700"}`}>{dayNum}</span>
                        <span className={`text-[9px] font-medium ${isToday ? "text-indigo-400" : "text-gray-400"}`}>{monthShort}</span>
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        {isToday && (
                          <span className="mb-0.5 inline-block text-[9px] font-bold uppercase tracking-wider text-indigo-500">Today</span>
                        )}
                        {rec?.checkInTime ? (
                          <p className="text-[11px] text-gray-500">
                            <span className="font-semibold text-emerald-600">In</span> {rec.checkInTime}
                            {rec.checkOutTime && (
                              <> &nbsp;<span className="font-semibold text-indigo-500">Out</span> {rec.checkOutTime}</>
                            )}
                          </p>
                        ) : time ? (
                          <p className="text-[11px] text-gray-400">Marked at {time}</p>
                        ) : (
                          <p className="text-[11px] text-gray-300">—</p>
                        )}
                      </div>

                      {/* Status badge */}
                      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGE[status]}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Mark card (sticky) ── */}
        <div className="sticky top-4 flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">

          {/* User profile */}
          <div className="flex flex-col items-center gap-3 border-b border-gray-100 bg-gradient-to-b from-indigo-50 to-blue-50/20 px-6 py-8 text-center">
            {user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={user.name}
                className="h-20 w-20 rounded-full border-4 border-white object-cover shadow-md"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-indigo-600 text-2xl font-bold text-white shadow-md">
                {getInitials(user?.name ?? "U")}
              </div>
            )}
            <div>
              <p className="text-base font-bold text-gray-900">{user?.name ?? "—"}</p>
              <p className="mt-0.5 text-xs text-gray-500">{user?.softwareDesignation ?? ""}</p>
            </div>
          </div>

          {/* Date + status */}
          <div className="border-b border-gray-100 px-6 py-5 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Today</p>
            <p className="mt-1 text-sm font-semibold text-gray-700">{todayLabelShort}</p>
            <div className="mt-3">
              {todayLoaded ? (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold ${STATUS_BADGE[todayStatus]}`}>
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[todayStatus]}`} />
                  {todayStatus}
                </span>
              ) : (
                <span className="inline-block h-7 w-28 animate-pulse rounded-full bg-gray-100" />
              )}
            </div>
            {markedTime && (
              <p className="mt-2 text-[11px] text-gray-400">Marked at {markedTime}</p>
            )}
          </div>

          {/* Action area */}
          <div className="flex flex-1 flex-col gap-2.5 p-5">

            {/* Admin override banner */}
            {adminOverridden && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">Admin override</p>
                  <p className="mt-0.5 text-xs leading-snug text-red-500">
                    Your attendance for today has been updated by Admin. Contact admin if you think this is incorrect.
                  </p>
                </div>
              </div>
            )}

            {/* Not yet marked — show 3 action buttons (hidden if admin overrode) */}
            {todayStatus === "Not Marked" && !adminOverridden && (
              <>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Mark attendance</p>
                {ACTIONS.map(({ status, label, icon: Icon, idle, active }) => (
                  <button
                    key={status}
                    type="button"
                    disabled={marking || !todayLoaded}
                    onClick={() => handleMark(status)}
                    className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-sm font-semibold transition-all duration-150 ${idle} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="flex-1 text-left">{label}</span>
                  </button>
                ))}
              </>
            )}

            {/* Present — show shift times and Close Shift button */}
            {todayStatus === "Present" && (
              <div className="flex flex-col gap-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {checkOutTime ? "Shift complete" : adminOverridden ? "Marked by admin" : "Active shift"}
                </p>

                {/* Check-in row */}
                {checkInTime && (
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="text-xs font-semibold text-emerald-700">Check-in</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-700">{checkInTime}</span>
                  </div>
                )}

                {/* Check-out row or Close Shift button (only if not admin-overridden) */}
                {checkOutTime ? (
                  <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <LogOut className="h-4 w-4 text-indigo-500" />
                      <span className="text-xs font-semibold text-indigo-700">Close shift</span>
                    </div>
                    <span className="text-xs font-bold text-indigo-700">{checkOutTime}</span>
                  </div>
                ) : !adminOverridden ? (
                  <button
                    type="button"
                    disabled={closingShift}
                    onClick={handleCloseShift}
                    className="flex w-full items-center gap-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3.5 text-sm font-semibold text-indigo-700 transition-all duration-150 hover:border-indigo-400 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <LogOut className="h-5 w-5 shrink-0" />
                    <span className="flex-1 text-left">{closingShift ? "Closing…" : "Close Shift"}</span>
                  </button>
                ) : null}
              </div>
            )}

            {/* Absent / On Leave — locked, no actions */}
            {(todayStatus === "Absent" || todayStatus === "On Leave") && (
              <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Attendance marked</p>
                <p className="text-xs text-gray-400">No further action required for today.</p>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-5 py-3 text-center">
            <p className="text-[10px] text-gray-400">
              {adminOverridden
                ? "Attendance updated by admin — contact admin to dispute"
                : !todayLoaded || todayStatus === "Not Marked"
                ? "Attendance is locked to today's date"
                : shiftOpen
                ? "Close shift when you leave for the day"
                : "Attendance locked for today"}
            </p>
          </div>
        </div>

      </div>

      {/* ── Appreciation Dialog ── */}
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm px-6"
            onClick={() => setAppreciationMsg(null)}
          >
            {/* Card — stop click propagation so clicking inside doesn't close */}
            <div
              className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
              style={{ animation: "dialogIn 0.3s ease forwards" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Logo */}
              <div className="flex justify-center border-b border-gray-100 px-8 py-7">
                <img
                  src="/companylogo.png"
                  alt="Canaan"
                  className="h-14 w-auto object-contain"
                />
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
                      <p className="text-[17px] font-semibold leading-relaxed text-gray-800">
                        {line1.split("").map((char, i) => (
                          <span key={i} style={{ opacity: 0, animation: "fadeChar 0.22s ease forwards", animationDelay: `${i * 36}ms` }}>
                            {char}
                          </span>
                        ))}
                      </p>
                      {line2 && (
                        <p className="text-[15px] font-medium leading-relaxed text-gray-500">
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
                  className="h-full rounded-full bg-indigo-300"
                  style={{
                    transformOrigin: "left",
                    animation: "drainBar 6s linear forwards",
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
