"use client";

import { useRef, useState } from "react";
import { ChevronDown, CheckCircle2, XCircle, CalendarOff, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { getAttendanceForDate } from "@/lib/attendance-data";
import { formatDateTime } from "@/lib/format-date";
import type { Driver } from "@/types/driver";
import type { DriverAttendanceRecord } from "@/types/attendance";

type DriverAttendanceTableProps = {
  drivers: Driver[];
  records: DriverAttendanceRecord[];
  date: string;
  onMark: (driverId: string, currentRecord: DriverAttendanceRecord | undefined, status: string) => Promise<void>;
};

const columns = ["Photo", "Driver ID", "Driver's Name", "Branch", "Status", "Marked At", "Action"];

const statusStyles: Record<string, string> = {
  Present: "bg-green-50 text-green-700",
  Absent: "bg-red-50 text-red-700",
  "On Leave": "bg-yellow-50 text-yellow-700",
  "Not Marked": "bg-gray-100 text-gray-500",
};

const statusOptions = [
  { value: "Present", label: "Present", icon: CheckCircle2, color: "text-green-600 hover:bg-green-50" },
  { value: "Absent", label: "Absent", icon: XCircle, color: "text-red-600 hover:bg-red-50" },
  { value: "On Leave", label: "On Leave", icon: CalendarOff, color: "text-yellow-600 hover:bg-yellow-50" },
];


function MarkButton({
  driverId,
  record,
  onMark,
}: {
  driverId: string;
  record: DriverAttendanceRecord | undefined;
  onMark: DriverAttendanceTableProps["onMark"];
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function handleSelect(status: string) {
    setOpen(false);
    setSaving(true);
    try {
      await onMark(driverId, record, status);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={saving}
        onClick={() => setOpen((o) => !o)}
        onBlur={(e) => {
          if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
        }}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <>
            Mark Attendance
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-44 rounded-xl border border-white/60 bg-white p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl">
          {statusOptions.map(({ value, label, icon: Icon, color }) => (
            <button
              key={value}
              type="button"
              onMouseDown={() => handleSelect(value)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                color,
                record?.status === value && "font-semibold ring-1 ring-inset ring-current/20"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {record?.status === value && (
                <span className="ml-auto text-[10px] font-bold uppercase opacity-60">current</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DriverAttendanceTable({ drivers, records, date, onMark }: DriverAttendanceTableProps) {
  if (drivers.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No driver records yet. Add drivers under &ldquo;Our Drivers&rdquo; to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {drivers.map((driver) => {
            const record = getAttendanceForDate(records, driver.driverId, date);
            const status = record?.status ?? "Not Marked";
            return (
              <tr key={driver.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Avatar photoUrl={driver.photoUrl} label={driver.name} size={44} />
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{driver.driverId}</td>
                <td className="px-4 py-3 text-gray-600">{driver.name}</td>
                <td className="px-4 py-3 text-gray-600">{driver.branch}</td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", statusStyles[status] ?? "bg-gray-100 text-gray-600")}>
                    {status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{formatDateTime(record?.markedAt)}</td>
                <td className="px-4 py-3">
                  <MarkButton driverId={driver.driverId} record={record || undefined} onMark={onMark} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
