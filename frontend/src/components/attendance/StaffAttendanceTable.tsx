"use client";

import { useState } from "react";
import { RiCheckboxCircleLine as CheckCircle2, RiCloseCircleLine as XCircle, RiCalendarCloseLine as CalendarOff, RiLoader4Line as Loader2, RiLogoutBoxRLine as LogOut } from "@remixicon/react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { getStaffAttendanceForDate } from "@/lib/attendance-data";
import { formatDateTime } from "@/lib/format-date";
import type { Staff } from "@/types/staff";
import type { StaffAttendanceRecord } from "@/types/attendance";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
type StaffAttendanceTableProps = {
  staff: Staff[];
  records: StaffAttendanceRecord[];
  date: string;
  onMark: (staffId: string, currentRecord: StaffAttendanceRecord | undefined, status: string) => Promise<void>;
  /** Admin force-close for someone who self-checked-in but never closed their
   * own shift — see close_shift on the backend, which already allows Admin to
   * act on any staff_id. Only meaningful for today (see isToday). */
  onCloseShift: (staffId: string) => Promise<void>;
  /** close_shift always acts on TODAY's record regardless of which date is
   * passed, so the button only appears while viewing today. */
  isToday: boolean;
};

const columns = ["Photo", "Staff ID", "Name", "Role", "Attendance", "Shift", "Marked At", "Source"];

const sourceStyles: Record<string, string> = {
  Web: "bg-accent-surface text-accent-text",
  App: "bg-purple-surface text-purple-text",
};

const statusOptions = [
  { value: "Present", label: "Present", icon: CheckCircle2, activeClass: "border-success-solid bg-success-surface text-success-text" },
  { value: "Absent", label: "Absent", icon: XCircle, activeClass: "border-danger-solid bg-danger-surface text-danger-text" },
  { value: "On Leave", label: "On Leave", icon: CalendarOff, activeClass: "border-warning-solid bg-warning-surface text-warning-text" },
];

function AttendanceRadioGroup({
  staffId,
  record,
  onMark,
  onCloseShift,
  isToday,
}: {
  staffId: string;
  record: StaffAttendanceRecord | undefined;
  onMark: StaffAttendanceTableProps["onMark"];
  onCloseShift: StaffAttendanceTableProps["onCloseShift"];
  isToday: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const current = record?.status ?? "Not Marked";
  // Admin force-close — only when there's an actual open, self-checked-in
  // shift to close, and only for today (close_shift always acts on today's
  // record regardless of which date is being viewed).
  const canCloseShift = isToday && record?.status === "Present" && record.checkInTime && !record.checkOutTime;

  async function handleSelect(status: string) {
    if (status === current || saving) return;
    setSaving(true);
    try {
      await onMark(staffId, record, status);
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseShift() {
    setClosing(true);
    try {
      await onCloseShift(staffId);
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label={`Attendance for ${staffId}`}>
      {statusOptions.map(({ value, label, icon: Icon, activeClass }) => {
        const checked = current === value;
        return (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption-1-medium transition-colors",
              checked ? activeClass : "border-separator-border bg-background-primary-default text-text-secondary hover:border-border-button-default hover:bg-fill-2",
              saving && "opacity-50"
            )}
          >
            <input
              type="radio"
              name={`attendance-${staffId}`}
              value={value}
              checked={checked}
              disabled={saving}
              onChange={() => handleSelect(value)}
              className="sr-only"
            />
            <Icon className="h-3.5 w-3.5" />
            {label}
          </label>
        );
      })}
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-tertiary" />}
      {canCloseShift && (
        <button
          type="button"
          onClick={handleCloseShift}
          disabled={closing}
          title="Close this shift now, on their behalf"
          className="flex items-center gap-1 rounded-full border border-warning-border-strong bg-warning-surface px-2.5 py-1 text-caption-1-medium text-warning-text transition-colors hover:bg-warning-surface-strong disabled:opacity-50"
        >
          {closing ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
          Close Shift
        </button>
      )}
    </div>
  );
}

/** "11m ago" / "3h ago" — coarse on purpose, this is a staleness cue next to
 * the Close Shift button, not a precise clock. */
function relativeAgo(iso: string): string {
  const then = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function ShiftCell({ record, isToday }: { record: StaffAttendanceRecord | undefined; isToday: boolean }) {
  if (!record || record.status !== "Present" || !record.checkInTime) {
    return <span className="text-text-tertiary">—</span>;
  }
  if (record.checkOutTime) {
    return <span className="text-text-secondary">{record.checkInTime} → {record.checkOutTime}</span>;
  }
  if (!isToday) {
    return <span className="text-text-secondary">{record.checkInTime} → <span className="italic text-warning-text">open</span></span>;
  }
  return (
    <span className="flex flex-col text-text-secondary">
      <span>{record.checkInTime}</span>
      {record.lastActiveAt && (
        <span className="text-[11px] text-text-tertiary" title="When this person was last actually active">
          last active {relativeAgo(record.lastActiveAt)}
        </span>
      )}
    </span>
  );
}

export function StaffAttendanceTable({ staff, records, date, onMark, onCloseShift, isToday }: StaffAttendanceTableProps) {
  if (staff.length === 0) {
    return (
      <EmptyState size="compact" illustration="no-data" title="No staff records yet" description="Add staff under &ldquo;Our Staff&rdquo; to get started" />
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[1000px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-separator-border bg-fill-1">
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <PagedTbody className="divide-y divide-separator-border" items={staff}>
          {(member) => {
            const record = getStaffAttendanceForDate(records, member.id, date);
            return (
              <tr key={member.id} className="hover:bg-fill-2">
                <td className="px-4 py-3">
                  <Avatar photoUrl={member.photoUrl} label={member.name} size={44} />
                </td>
                <td className="px-4 py-3 font-medium text-text-primary">{member.staffId}</td>
                <td className="px-4 py-3 text-text-secondary">{member.name}</td>
                <td className="px-4 py-3 text-text-secondary">{member.softwareDesignation}</td>
                <td className="px-4 py-3">
                  <AttendanceRadioGroup
                    staffId={member.id}
                    record={record || undefined}
                    onMark={onMark}
                    onCloseShift={onCloseShift}
                    isToday={isToday}
                  />
                </td>
                <td className="px-4 py-3">
                  <ShiftCell record={record || undefined} isToday={isToday} />
                </td>
                <td className="px-4 py-3 text-text-secondary">{formatDateTime(record?.markedAt)}</td>
                <td className="px-4 py-3">
                  {record ? (
                    <span className={cn("rounded-full px-2.5 py-1 text-caption-1-medium", sourceStyles[record.source] ?? "bg-fill-2 text-text-secondary")}>
                      {record.source}
                    </span>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </td>
              </tr>
            );
          }}
        </PagedTbody>
      </table>
    </div>
  );
}
