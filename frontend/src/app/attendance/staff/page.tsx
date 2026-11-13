"use client";

import { useAuth } from "@/context/AuthContext";
import { PagedTbody } from "@/components/ui/PagedTbody";
import { RiGroupLine as Users, RiHistoryLine as History, RiAddLine as Plus, RiPencilLine as Pencil, RiTimeLine as Clock } from "@remixicon/react";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffAttendanceTable } from "@/components/attendance/StaffAttendanceTable";
import { AttendanceMandatoryToggle } from "@/components/attendance/AttendanceMandatoryToggle";
import { staffApi, attendanceApi, type StaffAttendanceEditEventRow } from "@/lib/api";
import type { Staff } from "@/types/staff";
import type { StaffAttendanceRecord } from "@/types/attendance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { todayIst, formatDateTime } from "@/lib/format-date";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showError } from "@/lib/feedback";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { AttendanceReport } from "@/lib/attendance-report-pdf";
import { PillSearch } from "@/components/ui/PillSearch";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const SetWorkingHoursDialog = dynamic(() => import("@/components/attendance/SetWorkingHoursDialog").then((m) => m.SetWorkingHoursDialog));
const EDIT_EVENT_ICON: Record<StaffAttendanceEditEventRow["event"], typeof Plus> = {
  "Attendance Marked": Plus,
  "Attendance Updated": Pencil,
};

const EDIT_EVENT_COLOR: Record<StaffAttendanceEditEventRow["event"], string> = {
  "Attendance Marked": "bg-accent-surface-strong text-accent-text",
  "Attendance Updated": "bg-warning-surface-strong text-warning-text",
};

function getStaffAttendanceForDate(
  records: StaffAttendanceRecord[],
  staffId: string,
  date: string
): StaffAttendanceRecord | undefined {
  return records.find((r) => r.staffId === staffId && r.date === date);
}

export default function StaffAttendancePage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [workingHoursOpen, setWorkingHoursOpen] = useState(false);
  const [date, setDate] = useState(todayIst());
  const [search, setSearch] = useState("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [records, setRecords] = useState<StaffAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fromDate, setFromDate] = useState(todayIst());
  const [toDate, setToDate] = useState(todayIst());
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<StaffAttendanceEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    attendanceApi.listStaffEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
    Promise.all([staffApi.list(), attendanceApi.listStaff()])
      .then(([s, r]) => {
        setStaff(s);
        setRecords(r);
      })
      .catch(() => {}).finally(() => setLoading(false));
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  // Reload records when date changes or WS event fires
  useEffect(() => {
    attendanceApi.listStaff(date, undefined, undefined, undefined, true).then(setRecords);
  }, [date, refreshKey]);

  useWebSocketEvent("attendance_updated", () => setRefreshKey(k => k + 1));

  const handleMark = useCallback(
    async (staffId: string, currentRecord: StaffAttendanceRecord | undefined, status: string) => {
      try {
        let updated: StaffAttendanceRecord;
        if (currentRecord) {
          updated = await attendanceApi.updateStaff(currentRecord.id, status);
        } else {
          updated = await attendanceApi.markStaff(parseInt(staffId), date, status, undefined, "Web");
        }
        setRecords((prev) => {
          const without = prev.filter((r) => r.id !== updated.id);
          return [...without, updated];
        });
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : "Failed to mark attendance.");
      }
    },
    [date]
  );

  // Admin force-close for someone who self-checked-in but never closed their own
  // shift — the backend already allowed this (close_shift permits Admin to act
  // on any staff_id), it just had no button anywhere. Always acts on TODAY's
  // record regardless of which date is being viewed (see close_shift), so the
  // table only shows/enables this while date === today.
  const handleCloseShift = useCallback(async (staffId: string) => {
    try {
      const updated = await attendanceApi.closeShiftStaff(parseInt(staffId));
      setRecords((prev) => {
        const without = prev.filter((r) => r.id !== updated.id);
        return [...without, updated];
      });
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to close shift.");
    }
  }, []);

  const summary = useMemo(() => {
    const counts = { Present: 0, Absent: 0, "On Leave": 0, "Not Marked": 0 };
    for (const member of staff) {
      const record = getStaffAttendanceForDate(records, member.id, date);
      const status = record?.status ?? "Not Marked";
      counts[status as keyof typeof counts] += 1;
    }
    return counts;
  }, [staff, records, date]);

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return staff;
    return staff.filter((member) => member.name.toLowerCase().includes(query));
  }, [staff, search]);

  if (loading) return <PageSkeleton hasButton={false} hasSearch statCards={4} columns={7} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <SetWorkingHoursDialog open={workingHoursOpen} onClose={() => setWorkingHoursOpen(false)} />
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-success-border bg-success-surface text-success-text shadow-sm">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Staff Attendance</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Track and mark attendance for all staff members
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setWorkingHoursOpen(true)}
              className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
            >
              <Clock className="h-4 w-4" />
              Auto-Close Settings
            </button>
          )}
          {isAdmin && <AttendanceMandatoryToggle />}
          {isAdmin && (
<button
            type="button"
            onClick={openEditHistory}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
          >
            <History className="h-4 w-4" />
            Edit History
          </button>
)}
          {/* Day being marked */}
          <div className="flex h-10 items-center rounded-full border border-border-button-default bg-background-primary-default px-3 shadow-xs transition-colors hover:border-border-button-hover">
            <div className="w-[112px]">
              <DatePickerInput value={date} onChange={(v) => setDate(v)} clearable={false} variant="bare" aria-label="Attendance date" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Present</p>
          <p className="mt-1 text-title-1-semibold text-success-text">{summary.Present}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Absent</p>
          <p className="mt-1 text-title-1-semibold text-danger-text">{summary.Absent}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">On Leave</p>
          <p className="mt-1 text-title-1-semibold text-warning-text">{summary["On Leave"]}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Not Marked</p>
          <p className="mt-1 text-title-1-semibold text-text-secondary">{summary["Not Marked"]}</p>
        </div>
      </div>

      {/* Toolbar: search on the left, report range + View on the right (same layout as the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch value={search} onChange={setSearch} placeholder="Search by staff name" />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill
            from={fromDate}
            to={toDate}
            onFromChange={(v) => { setFromDate(v); if (v > toDate) setToDate(v); }}
            onToChange={(v) => { setToDate(v); if (v < fromDate) setFromDate(v); }}
          />
          {/* The person-wise report: Summary, Register, a sheet per staff (+ its PDF). */}
          <ReportViewButton
            path="/exports/attendance-report"
            filename="Staff_Attendance.xlsx"
            title={`Staff Attendance Report — ${fromDate.split("-").reverse().join("-")} to ${toDate.split("-").reverse().join("-")}${search.trim() ? ` — "${search.trim()}"` : ""}`}
            params={{ category: "staff", from_date: fromDate, to_date: toDate, ...(search.trim() ? { search: search.trim() } : {}) }}
            pdf={(report, file) => import("@/lib/attendance-report-pdf").then((m) => m.downloadAttendanceReportPdf({ report: report as AttendanceReport, filename: file }))}
          />
        </div>
      </div>

      <StaffAttendanceTable
        staff={filteredStaff}
        records={records}
        date={date}
        onMark={handleMark}
        onCloseShift={handleCloseShift}
        isToday={date === todayIst()}
      />
      {/* Edit History — every Admin-override mark/edit ever logged, across
          every staff member, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by staff or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q || ev.staffName.toLowerCase().includes(q) || ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No Admin-override edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Staff</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Date</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-text-primary">{ev.staffName}</td>
                          <td className="px-3 py-2 text-text-secondary">{ev.date}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    }}
                  </PagedTbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
