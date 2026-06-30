"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, CheckCircle2, XCircle, CalendarOff, Loader2 } from "lucide-react";
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
};

const columns = [
  "Photo", "Staff ID", "Name", "Role", "Branch",
  "Status", "Marked At", "Source", "Action",
];

const statusStyles: Record<string, string> = {
  Present: "bg-green-50 text-green-700",
  Absent: "bg-red-50 text-red-700",
  "On Leave": "bg-yellow-50 text-yellow-700",
  "Not Marked": "bg-gray-100 text-gray-500",
};

const sourceStyles: Record<string, string> = {
  Web: "bg-blue-50 text-blue-700",
  App: "bg-purple-50 text-purple-700",
};

const statusOptions = [
  { value: "Present", label: "Present", icon: CheckCircle2, color: "text-green-600 hover:bg-green-50" },
  { value: "Absent", label: "Absent", icon: XCircle, color: "text-red-600 hover:bg-red-50" },
  { value: "On Leave", label: "On Leave", icon: CalendarOff, color: "text-yellow-600 hover:bg-yellow-50" },
];


function MarkButton({
  staffId,
  record,
  onMark,
}: {
  staffId: string;
  record: StaffAttendanceRecord | undefined;
  onMark: StaffAttendanceTableProps["onMark"];
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = 150;
      
      const openUpwards = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
      
      setDropdownStyle({
        position: 'fixed',
        left: rect.right - 176, // w-44 = 176px. Align right side with button right side
        width: 176,
        ...(openUpwards 
             ? { bottom: window.innerHeight - rect.top + 8, maxHeight: Math.min(spaceAbove - 20, 300) }
             : { top: rect.bottom + 8, maxHeight: Math.min(spaceBelow - 20, 300) })
      });
    }
  };

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current && 
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSelect(status: string) {
    setOpen(false);
    setSaving(true);
    try {
      await onMark(staffId, record, status);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={saving}
        onClick={() => setOpen((o) => !o)}
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

      {open && typeof document !== "undefined" && createPortal(
        <div 
          ref={dropdownRef}
          style={dropdownStyle}
          className="z-[9999] rounded-xl border border-white/60 bg-white/80 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-xl animate-dropdown duration-200"
        >
          {statusOptions.map(({ value, label, icon: Icon, color }) => (
            <button
              key={value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(value);
              }}
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
        </div>,
        document.body
      )}
    </div>
  );
}

export function StaffAttendanceTable({ staff, records, date, onMark }: StaffAttendanceTableProps) {
  if (staff.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No staff records yet. Add staff under &ldquo;Our Staff&rdquo; to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[1200px] text-left text-sm">
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
          {staff.map((member) => {
            const record = getStaffAttendanceForDate(records, member.id, date);
            const status = record?.status ?? "Not Marked";
            return (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Avatar photoUrl={member.photoUrl} label={member.name} size={44} />
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{member.staffId}</td>
                <td className="px-4 py-3 text-gray-600">{member.name}</td>
                <td className="px-4 py-3 text-gray-600">{member.softwareDesignation}</td>
                <td className="px-4 py-3 text-gray-600">{member.branch}</td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", statusStyles[status] ?? "bg-gray-100 text-gray-600")}>
                    {status}
                  </span>
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
                <td className="px-4 py-3">
                  <MarkButton staffId={member.id} record={record || undefined} onMark={onMark} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
