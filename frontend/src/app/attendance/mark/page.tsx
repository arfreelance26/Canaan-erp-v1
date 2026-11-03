"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiCheckboxCircleLine as CheckCircle2, RiCloseCircleLine as XCircle, RiCalendarCloseLine as CalendarOff, RiArrowLeftSLine as ChevronLeft, RiArrowRightSLine as ChevronRight, RiLogoutBoxRLine as LogOut, RiLoginBoxLine as LogIn, RiShieldFlashLine as ShieldAlert, RiTimeLine as Clock, RiCalendarCheckLine as CalendarCheck, RiTimerLine as Timer, RiClipboardLine as ClipboardCheck, RiLoader4Line as Loader2 } from "@remixicon/react";
import { attendanceApi, usageApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import type { StaffAttendanceRecord, StaffSelfSummary } from "@/types/attendance";
import { todayIst } from "@/lib/format-date";
import { showError } from "@/lib/feedback";

import { EmptyState } from "@/components/ui/EmptyState";
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

/** Genuine worked time, from active seconds — "Total Working Time" everywhere
 * on this page, not checkout-minus-checkin (see dailyActive's comment). */
function formatWorkedTime(seconds: number | undefined): string | null {
  if (!seconds) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 1) return null;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

type MarkableStatus = "Present" | "Absent" | "On Leave";

// Static class strings so Tailwind can see them.
const ACTIONS: {
  status: MarkableStatus; label: string; hint: string; icon: React.ElementType; chip: string; hover: string;
}[] = [
  { status: "Present", label: "Present", hint: "Start your shift", icon: CheckCircle2, chip: "bg-success-surface-strong text-success-text", hover: "hover:border-success-border-strong" },
  { status: "Absent", label: "Absent", hint: "Not working today", icon: XCircle, chip: "bg-danger-surface-strong text-danger-text", hover: "hover:border-danger-border-strong" },
  { status: "On Leave", label: "On leave", hint: "Away on approved leave", icon: CalendarOff, chip: "bg-warning-surface-strong text-warning-text", hover: "hover:border-warning-border-strong" },
];

const STATUS_DOT: Record<string, string> = {
  Present: "bg-success-solid",
  Absent: "bg-danger-solid",
  "On Leave": "bg-warning-solid",
  Holiday: "bg-accent-solid",
  "Not Marked": "bg-fill-4",
};

const STATUS_PILL: Record<string, string> = {
  Present: "bg-success-surface text-success-text",
  Absent: "bg-danger-surface text-danger-text",
  "On Leave": "bg-warning-surface text-warning-text",
  Holiday: "bg-accent-surface text-accent-text",
  "Not Marked": "bg-fill-2 text-text-secondary",
};

// Colour of the ring that pulses out of today's pill right after marking (.ma-pop).
const STATUS_PULSE: Record<string, string> = {
  Present: "rgba(16,185,129,0.45)",
  Absent: "rgba(239,68,68,0.4)",
  "On Leave": "rgba(245,158,11,0.45)",
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Counts from the number on screen to `target` (ease-out, ~0.6 s) — on load
 * from 0, on a month change from the old month's figure. */
function useCountUp(target: number, ms = 600): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (from.current === target) return;
    const start = from.current;
    const t0 = performance.now();
    const length = prefersReducedMotion() ? 0 : ms;
    let raf = 0;
    const step = (t: number) => {
      const k = length ? Math.min(1, (t - t0) / length) : 1;
      const v = Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3)));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

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
  // Real worked time per day — genuine active seconds (idle-filtered, summed
  // across every login session that day), not checkout-minus-checkin: a
  // resumed shift's raw span would include any break in the middle. See
  // usageApi.dailyActive.
  const [dailyActive, setDailyActive] = useState<Map<string, number>>(new Map());
  const [todayHolidayName, setTodayHolidayName] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [summary, setSummary] = useState<StaffSelfSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [markingStatus, setMarkingStatus] = useState<MarkableStatus | null>(null);   // the option being saved
  const [closingShift, setClosingShift] = useState(false);
  const [appreciationMsg, setAppreciationMsg] = useState<string | null>(null);

  // One-off effects after an action: today's pill pops (just marked) and
  // today's history row flashes (marked, shift closed or resumed).
  const [popPill, setPopPill] = useState(false);
  const [flashRow, setFlashRow] = useState(false);
  useEffect(() => {
    if (!popPill) return;
    const t = setTimeout(() => setPopPill(false), 1100);
    return () => clearTimeout(t);
  }, [popPill]);
  useEffect(() => {
    if (!flashRow) return;
    const t = setTimeout(() => setFlashRow(false), 1300);
    return () => clearTimeout(t);
  }, [flashRow]);
  // Which way the history list slides in after a month change.
  const [slideFrom, setSlideFrom] = useState<"left" | "right" | null>(null);

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
      .catch(() => {
        // A fetch failure here previously rendered identically to a genuine
        // "you haven't marked today" state, inviting a mark click while the
        // real status was actually unknown.
        showError("Couldn't check today's attendance status — please refresh before marking.");
        setTodayRecord(null);
      });
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
    usageApi.dailyActive(staffNumericId, from, to).then(setDailyActive).catch(() => {});
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

  // Re-fetch today's record when admin overrides it — and, since an admin
  // override can just as easily target a *past* day, also refresh the month
  // history/summary when the viewed month is open, instead of leaving it
  // stale until a manual prev/next-month navigation.
  useWebSocketEvent("attendance_updated", (payload) => {
    if (!staffNumericId) return;
    const evtStaffId = (payload as { staff_id?: number }).staff_id;
    if (evtStaffId !== undefined && evtStaffId !== staffNumericId) return;
    attendanceApi
      .listStaff(today, staffNumericId)
      .then((recs) => setTodayRecord(recs[0] ?? null))
      .catch(() => {});

    const from = `${viewYear}-${String(viewMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(viewYear, viewMonth, 0).getDate();
    const to = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    attendanceApi.listStaff(undefined, staffNumericId, from, to).then(setMonthRecords).catch(() => {});
    attendanceApi.getStaffSelfSummary(staffNumericId, viewYear, viewMonth).then(setSummary).catch(() => {});
  });

  const handleMark = useCallback(
    async (status: MarkableStatus) => {
      if (marking || !staffNumericId) return;
      setMarking(true);
      setMarkingStatus(status);
      try {
        const updated = await attendanceApi.selfMarkStaff(staffNumericId, status);
        setTodayRecord(updated);
        setPopPill(true);
        setFlashRow(true);
        const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;
        if (isCurrentMonth) {
          setMonthRecords((prev) => [...prev.filter((r) => r.date !== today), updated]);
          attendanceApi.getStaffSelfSummary(staffNumericId, viewYear, viewMonth).then(setSummary).catch(() => {});
        }
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : "Failed to mark attendance.");
      } finally {
        setMarking(false);
        setMarkingStatus(null);
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
      setFlashRow(true);
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

  const [resumingShift, setResumingShift] = useState(false);
  const handleResumeShift = useCallback(async () => {
    if (resumingShift || !staffNumericId) return;
    setResumingShift(true);
    try {
      const updated = await attendanceApi.resumeShiftStaff(staffNumericId);
      setTodayRecord(updated);
      setFlashRow(true);
      const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;
      if (isCurrentMonth) {
        setMonthRecords((prev) => [...prev.filter((r) => r.date !== today), updated]);
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Could not resume your shift.");
    } finally {
      setResumingShift(false);
    }
  }, [resumingShift, staffNumericId, today, viewYear, viewMonth, currentYear, currentMonth]);

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
    setSlideFrom("left");
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (!canGoNext) return;
    setSlideFrom("right");
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

  const pct = Math.round(summary?.percentage ?? 0);
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - pct / 100);
  const ringColor = pct >= 75 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  const standingLabel = pct >= 75 ? "Good standing" : pct >= 50 ? "Needs improvement" : "Below threshold";
  const standingDot = pct >= 75 ? "bg-success-solid" : pct >= 50 ? "bg-warning-solid" : "bg-danger-solid";

  // The figures count up to their value (hooks — so before the early returns).
  const pctShown = useCountUp(pct);
  const presentShown = useCountUp(summary?.present ?? 0);
  const absentShown = useCountUp(summary?.absent ?? 0);
  const onLeaveShown = useCountUp(summary?.onLeave ?? 0);
  const holidaysShown = useCountUp(summary?.holidays ?? 0);
  const notMarkedShown = useCountUp(summary?.notMarked ?? 0);

  if (!ready) return null;

  if (staffNumericId === null) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-border bg-purple-surface text-purple-text shadow-sm">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Mark Attendance</h1>
            <p className="mt-0.5 text-sm text-text-secondary">{todayLabelFull}</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-warning-border/80 bg-warning-surface/60 px-8 py-16 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-warning-surface-strong text-warning-text ring-8 ring-warning-border">
            <CalendarOff className="h-6 w-6" />
          </span>
          <div>
            <p className="text-headline-medium text-text-primary">Staff record not linked</p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-text-secondary">
              No Staff record with <span className="font-medium text-text-primary">Software Designation = Admin</span> was found in the database.
              Please make sure the admin staff profile exists under <span className="font-medium text-text-primary">Our Staff</span>, then log out and back in.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-stagger mx-auto flex max-w-7xl flex-col gap-6">

      {/* Page header */}
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-border bg-purple-surface text-purple-text shadow-sm">
            <ClipboardCheck className="h-5 w-5" />
          </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">Mark Attendance</h1>
          <p className="mt-0.5 text-sm text-text-secondary">{todayLabelFull}</p>
        </div>
      </div>

      {/* Main grid: left (stats + history) | right (today card, sticky) */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_380px]">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-4">

          {/* Monthly attendance */}
          <div className={`overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm transition-opacity ${summaryLoading ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator-border bg-accent-surface/70 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-surface-strong text-accent-text">
                  <CalendarCheck className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-body-semibold text-text-primary">Monthly attendance</h2>
                  <p className="text-xs text-text-secondary">{monthLabel}</p>
                </div>
              </div>
              <span key={standingLabel} className="ma-fade inline-flex items-center gap-2 rounded-full border border-separator-border bg-background-primary-default px-3 py-1 text-caption-1-medium text-text-secondary">
                <i className={`h-1.5 w-1.5 rounded-full ${standingDot}`} />
                {standingLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-6 p-5">
              {/* Ring */}
              <div className="relative flex h-[104px] w-[104px] shrink-0 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r={r} fill="none" className="stroke-foreground-icon-quaternary" strokeWidth="7" />
                  <circle
                    cx="50" cy="50" r={r} fill="none"
                    stroke={ringColor} strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    className="transition duration-700"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-title-1-semibold leading-none tabular-nums text-text-primary">{pctShown}%</span>
                  <span className="mt-1 text-[10px] text-text-tertiary">attendance</span>
                </div>
              </div>

              <div className="flex min-w-[260px] flex-1 flex-col gap-3">
                <p className="text-sm text-text-secondary">
                  <span className="font-medium tabular-nums text-text-primary">{presentShown}</span> present out of{" "}
                  <span className="font-medium tabular-nums text-text-primary">{summary?.workingDays ?? 26}</span> working days
                </p>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill-3">
                  <div
                    className="h-full rounded-full transition duration-700"
                    style={{ width: `${pct}%`, backgroundColor: ringColor }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-5">
                  {[
                    { label: "Present", count: presentShown, dot: "bg-success-solid" },
                    { label: "Absent", count: absentShown, dot: "bg-danger-solid" },
                    { label: "On leave", count: onLeaveShown, dot: "bg-warning-solid" },
                    { label: "Holiday", count: holidaysShown, dot: "bg-accent-solid" },
                    { label: "Unmarked", count: notMarkedShown, dot: "bg-fill-4" },
                  ].map(({ label, count, dot }) => (
                    <div key={label} className="rounded-xl border border-separator-border bg-fill-1 px-3 py-2">
                      <p className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                        <i className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                        {label}
                      </p>
                      <p className="mt-0.5 text-title-3-semibold tabular-nums text-text-primary">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Attendance history */}
          <div className="overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator-border bg-accent-surface/70 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-surface-strong text-accent-text">
                  <Clock className="h-4 w-4" />
                </span>
                <h2 className="text-body-semibold text-text-primary">Attendance history</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={prevMonth}
                  aria-label="Previous month"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-separator-border bg-background-primary-default text-text-secondary shadow-sm transition duration-200 hover:border-accent-border-strong hover:text-accent-text"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[128px] text-center text-caption-1-medium text-text-primary">{monthLabel}</span>
                <button
                  type="button"
                  onClick={nextMonth}
                  disabled={!canGoNext}
                  aria-label="Next month"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-separator-border bg-background-primary-default text-text-secondary shadow-sm transition duration-200 hover:border-accent-border-strong hover:text-accent-text disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {historyLoading ? (
              <div className="divide-y divide-separator-border" aria-busy="true" aria-label="Loading attendance history">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex animate-pulse items-center gap-4 px-5 py-3.5" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="w-14 shrink-0 space-y-1.5">
                      <div className="h-3.5 w-12 rounded bg-fill-3" />
                      <div className="h-2.5 w-8 rounded bg-fill-2" />
                    </div>
                    <div className="h-3 flex-1 rounded bg-fill-2" />
                    <div className="h-6 w-20 rounded-full bg-fill-2" />
                  </div>
                ))}
              </div>
            ) : historyDates.length === 0 ? (
              <EmptyState size="compact" illustration="no-data" title="No records yet this month" />
            ) : (
              <div
                key={`${viewYear}-${viewMonth}`}
                className={`custom-scrollbar max-h-[380px] divide-y divide-separator-border overflow-y-auto ${slideFrom === "right" ? "ma-from-right" : slideFrom === "left" ? "ma-from-left" : ""}`}
              >
                {historyDates.map((dateStr, rowIndex) => {
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
                  const workedTime = formatWorkedTime(dailyActive.get(dateStr));
                  return (
                    <div
                      key={dateStr}
                      className={`ma-row relative flex items-center gap-4 px-5 py-3 transition-colors ${isToday ? "bg-accent-surface/60" : "hover:bg-fill-2"}`}
                      style={{ animationDelay: `${Math.min(rowIndex, 10) * 35}ms` }}
                    >
                      {isToday && flashRow && (
                        <span className="ma-flash pointer-events-none absolute inset-0 bg-success-surface-strong/70" aria-hidden="true" />
                      )}
                      <div className="w-14 shrink-0">
                        <p className="text-body-medium tabular-nums text-text-primary">{dayNum} {monthShort}</p>
                        <p className="text-[11px] text-text-tertiary">{dayName}</p>
                      </div>

                      <div className="min-w-0 flex-1">
                        {isToday && (
                          <span className="mb-1 inline-block rounded-full bg-accent-surface-strong px-2 py-0.5 text-caption-2-medium text-accent-text">Today</span>
                        )}
                        {rec?.checkInTime ? (
                          <p className="text-xs text-text-secondary">
                            <span className="text-text-tertiary">In</span> <span className="tabular-nums text-text-primary">{rec.checkInTime}</span>
                            {rec.checkOutTime && (
                              <> <span className="mx-1 text-text-tertiary">·</span> <span className="text-text-tertiary">Out</span> <span className="tabular-nums text-text-primary">{rec.checkOutTime}</span></>
                            )}
                          </p>
                        ) : time ? (
                          <p className="text-xs text-text-tertiary">Marked at {time}</p>
                        ) : holidayName && holidayName !== "Sunday" ? (
                          <p className="text-xs text-accent-text/80">{holidayName}</p>
                        ) : (
                          <p className="text-xs text-text-tertiary">—</p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption-2-medium ${STATUS_PILL[status]}`}>
                          <i className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
                          {status}
                        </span>
                        {/* Independent of attendance status — real logged-in
                            activity even on a day marked Absent/On Leave/Not
                            Marked, not just a Present day with a closed shift. */}
                        {workedTime && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-surface px-2.5 py-1 text-caption-2-semibold tabular-nums text-purple-text ring-1 ring-inset ring-purple-border">
                            <Timer className="h-3 w-3" />
                            {workedTime}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Today card (sticky) ── */}
        <div className="sticky top-4 flex flex-col overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">

          {/* Person */}
          <div className="flex items-center gap-3 border-b border-separator-border bg-accent-surface/70 px-5 py-4">
            {user?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoUrl} alt={user.name} className="h-11 w-11 rounded-full object-cover ring-2 ring-background-primary-default" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-surface-strong text-body-medium text-accent-text ring-2 ring-background-primary-default">
                {getInitials(user?.name ?? "U")}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-body-semibold text-text-primary">{user?.name ?? "—"}</p>
              <p className="truncate text-xs text-text-secondary">{user?.softwareDesignation ?? ""}</p>
            </div>
          </div>

          {/* Today + status */}
          <div className="px-5 pb-1 pt-5 text-center">
            <p className="text-[11px] text-text-tertiary">Today</p>
            <p className="mt-1 text-title-3-medium text-text-primary">{todayLabelShort}</p>
            <div className="mt-3 flex justify-center">
              {todayLoaded ? (
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-body-medium ${STATUS_PILL[displayTodayStatus]} ${popPill ? "ma-pop" : ""}`}
                  style={popPill ? ({ "--ma-pulse": STATUS_PULSE[displayTodayStatus] ?? "transparent" } as React.CSSProperties) : undefined}
                >
                  <i className={`h-2 w-2 rounded-full ${STATUS_DOT[displayTodayStatus]}`} />
                  {displayTodayStatus}
                </span>
              ) : (
                <span className="inline-block h-8 w-28 animate-pulse rounded-full bg-fill-2" />
              )}
            </div>
            {markedTime && <p className="mt-2 text-xs text-text-tertiary">Marked at {markedTime}</p>}
          </div>

          {/* Action area */}
          <div className="flex flex-1 flex-col gap-2.5 p-5">

            {/* Total Working Time — independent of attendance status: shows
                real logged-in activity even on a day marked Absent/On Leave/
                Not Marked, not just a Present day with a closed shift. */}
            {formatWorkedTime(dailyActive.get(today)) && (
              <div className="flex items-center justify-between rounded-xl border border-purple-border bg-purple-surface/60 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-text-secondary">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-surface-strong text-purple-text">
                    <Timer className="h-4 w-4" />
                  </span>
                  Total Working Time
                </span>
                <span className="text-body-medium tabular-nums text-text-primary">{formatWorkedTime(dailyActive.get(today))}</span>
              </div>
            )}

            {/* Admin override */}
            {adminOverridden && (
              <div className="flex items-start gap-3 rounded-xl border border-danger-border/80 bg-danger-surface/70 px-4 py-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger-text" />
                <div>
                  <p className="text-caption-1-medium text-danger-text">Updated by admin</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-danger-text/80">
                    Your attendance for today was changed by Admin. Contact admin if you think this is incorrect.
                  </p>
                </div>
              </div>
            )}

            {/* Holiday — marking is optional, not blocked: some roles (Maintenance,
                Yard Supervisor, etc.) genuinely work through one, so this sits
                alongside the mark options below rather than replacing them. */}
            {todayHoliday && todayStatus === "Not Marked" && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-accent-border/80 bg-accent-surface/70 px-4 py-4 text-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-surface-strong text-accent-text">
                  <CalendarOff className="h-4 w-4" />
                </span>
                <p className="text-body-medium text-text-primary">
                  {todayHoliday === "Sunday" ? "Sunday holiday" : "Holiday"}
                  {todayHoliday !== "Sunday" && <span className="font-normal text-accent-text"> — {todayHoliday}</span>}
                </p>
                <p className="text-xs text-text-secondary">No attendance needed today — but if you&apos;re working, go ahead and mark it below.</p>
              </div>
            )}

            {/* Not marked yet → three choices — available every day, holiday or not */}
            {todayStatus === "Not Marked" && !adminOverridden && (
              <>
                <p className="ma-enter mb-0.5 text-[11px] text-text-tertiary">How is your day?</p>
                {ACTIONS.map(({ status, label, hint, icon: Icon, chip, hover }, i) => {
                  // While one option saves, it stays lit (with a spinner) and the others fade back.
                  const saving = markingStatus === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={marking || !todayLoaded}
                      onClick={() => handleMark(status)}
                      style={{ animationDelay: `${60 + i * 50}ms` }}
                      className={`ma-enter group flex w-full items-center gap-3 rounded-2xl border bg-background-primary-default px-4 py-3 text-left shadow-sm transition duration-200 hover:shadow-md ${hover} disabled:pointer-events-none ${
                        saving ? "border-border-button-default shadow-md" : markingStatus ? "border-separator-border opacity-40" : "border-separator-border disabled:opacity-50"
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${chip}`}>
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-medium text-text-primary">{label}</span>
                        <span className="block text-xs text-text-secondary">{saving ? "Saving…" : hint}</span>
                      </span>
                      {saving ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-text-tertiary" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200 group-hover:text-text-secondary" />
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* Present → shift times + close shift */}
            {todayStatus === "Present" && (
              <div className="ma-enter flex flex-col gap-2.5">
                <p
                  key={checkOutTime ? "done" : adminOverridden ? "admin" : "live"}
                  className="ma-fade flex items-center gap-2 text-[11px] text-text-tertiary"
                >
                  {!checkOutTime && !adminOverridden && <span className="ma-live" aria-hidden="true" />}
                  {checkOutTime ? "Shift complete" : adminOverridden ? "Marked by admin" : "Shift in progress"}
                </p>

                {checkInTime && (
                  <div className="flex items-center justify-between rounded-xl border border-separator-border bg-fill-1 px-4 py-3">
                    <span className="flex items-center gap-2 text-sm text-text-secondary">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-surface-strong text-success-text">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                      Checked in
                    </span>
                    <span className="text-body-medium tabular-nums text-text-primary">{checkInTime}</span>
                  </div>
                )}

                {checkOutTime ? (
                  <>
                    <div className="ma-enter flex items-center justify-between rounded-xl border border-separator-border bg-fill-1 px-4 py-3">
                      <span className="flex items-center gap-2 text-sm text-text-secondary">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-surface-strong text-accent-text">
                          <LogOut className="h-4 w-4" />
                        </span>
                        Checked out
                      </span>
                      <span className="text-body-medium tabular-nums text-text-primary">{checkOutTime}</span>
                      {todayRecord?.autoClosed && (
                        <span className="ml-2 rounded-full bg-warning-surface px-2 py-0.5 text-caption-2-semibold text-warning-text">Auto-closed</span>
                      )}
                    </div>
                    {/* Total Working Time itself is shown once, always-visible
                        at the top of this card regardless of status — not
                        repeated here. */}
                    {/* A self-close is final — only an auto-close or an Admin
                        force-close is resumable, since those are guesses on
                        the person's behalf, not their own confirmation they
                        were done (e.g. a break longer than the configured
                        inactivity limit). */}
                    {todayRecord?.closedBy && todayRecord.closedBy !== "self" && (
                      <button
                        type="button"
                        disabled={resumingShift}
                        onClick={handleResumeShift}
                        className="ma-enter mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-success-solid text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-success-solid-hover hover:shadow-md disabled:pointer-events-none disabled:opacity-60"
                      >
                        {resumingShift ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                        {resumingShift ? "Resuming…" : "Still working — resume shift"}
                      </button>
                    )}
                  </>
                ) : !adminOverridden ? (
                  <button
                    type="button"
                    disabled={closingShift}
                    onClick={handleCloseShift}
                    className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent-solid text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:pointer-events-none disabled:opacity-60"
                  >
                    {closingShift ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    {closingShift ? "Closing…" : "Close shift"}
                  </button>
                ) : null}
              </div>
            )}

            {/* Absent / On Leave → locked */}
            {(todayStatus === "Absent" || todayStatus === "On Leave") && (
              <div className="ma-enter flex flex-col items-center gap-1 rounded-xl border border-separator-border bg-fill-1 px-4 py-6 text-center">
                <p className="text-body-medium text-text-primary">Attendance recorded</p>
                <p className="text-xs text-text-secondary">No further action is needed for today.</p>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t border-separator-border px-5 py-3 text-center">
            <p className="text-xs text-text-tertiary">
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/55 px-6"
            onClick={() => setAppreciationMsg(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-background-primary-default shadow-2xl"
              style={{ animation: "dialogIn 0.3s ease forwards" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center border-b border-separator-border bg-accent-surface/60 px-8 py-7">
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
                      <p className="text-[17px] font-medium leading-relaxed text-text-primary">
                        {line1.split("").map((char, i) => (
                          <span key={i} style={{ opacity: 0, animation: "fadeChar 0.22s ease forwards", animationDelay: `${i * 36}ms` }}>
                            {char}
                          </span>
                        ))}
                      </p>
                      {line2 && (
                        <p className="text-[15px] leading-relaxed text-text-secondary">
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
              <div className="mx-8 mb-6 h-0.5 overflow-hidden rounded-full bg-fill-2">
                <div
                  className="h-full rounded-full bg-gold-solid"
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
