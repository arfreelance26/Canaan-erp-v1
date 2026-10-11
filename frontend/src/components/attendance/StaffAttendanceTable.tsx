"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, CalendarOff, Loader2, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { getStaffAttendanceForDate } from "@/lib/attendance-data";
import { formatDateTime } from "@/lib/format-date";
import type { Staff } from "@/types/staff";
import type { StaffAttendanceRecord } from "@/types/attendance";

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
  Web: "bg-blue-50 text-blue-700",
  App: "bg-purple-50 text-purple-700",
};

const statusOptions = [
  { value: "Present", label: "Present", icon: CheckCircle2, activeClass: "border-green-500 bg-green-50 text-green-700" },
  { value: "Absent", label: "Absent", icon: XCircle, activeClass: "border-red-500 bg-red-50 text-red-700" },
  { value: "On Leave", label: "On Leave", icon: CalendarOff, activeClass: "border-yellow-500 bg-yellow-50 text-yellow-700" },
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
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              checked ? activeClass : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50",
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
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
      {canCloseShift && (
        <button
          type="button"
          onClick={handleCloseShift}
          disabled={closing}
          title="Close this shift now, on their behalf"
          className="flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
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
    return <span className="text-gray-400">—</span>;
  }
  if (record.checkOutTime) {
    return <span className="text-gray-600">{record.checkInTime} → {record.checkOutTime}</span>;
  }
  if (!isToday) {
    return <span className="text-gray-600">{record.checkInTime} → <span className="italic text-amber-600">open</span></span>;
  }
  return (
    <span className="flex flex-col text-gray-600">
      <span>{record.checkInTime}</span>
      {record.lastActiveAt && (
        <span className="text-[11px] text-gray-400" title="When this person was last actually active">
          last active {relativeAgo(record.lastActiveAt)}
        </span>
      )}
    </span>
  );
}

export function StaffAttendanceTable({ staff, records, date, onMark, onCloseShift, isToday }: StaffAttendanceTableProps) {
  if (staff.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No staff records yet. Add staff under &ldquo;Our Staff&rdquo; to get started.
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[1000px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {staff.map((member) => {
            const record = getStaffAttendanceForDate(records, member.id, date);
            return (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Avatar photoUrl={member.photoUrl} label={member.name} size={44} />
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{member.staffId}</td>
                <td className="px-4 py-3 text-gray-600">{member.name}</td>
                <td className="px-4 py-3 text-gray-600">{member.softwareDesignation}</td>
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
                <td className="px-4 py-3 text-gray-600">{formatDateTime(record?.markedAt)}</td>
                <td className="px-4 py-3">
                  {record ? (
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", sourceStyles[record.source] ?? "bg-gray-100 text-gray-600")}>
                      {record.source}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
