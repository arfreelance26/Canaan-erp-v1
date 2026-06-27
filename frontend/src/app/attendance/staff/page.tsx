"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffAttendanceTable } from "@/components/attendance/StaffAttendanceTable";
import { staffApi, attendanceApi } from "@/lib/api";
import type { Staff } from "@/types/staff";
import type { StaffAttendanceRecord } from "@/types/attendance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { todayIst } from "@/lib/format-date";

function getStaffAttendanceForDate(
  records: StaffAttendanceRecord[],
  staffId: string,
  date: string
): StaffAttendanceRecord | undefined {
  return records.find((r) => r.staffId === staffId && r.date === date);
}

export default function StaffAttendancePage() {
  const [date, setDate] = useState(todayIst());
  const [search, setSearch] = useState("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [records, setRecords] = useState<StaffAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([staffApi.list(), attendanceApi.listStaff()])
      .then(([s, r]) => {
        setStaff(s);
        setRecords(r);
      })
      .finally(() => setLoading(false));
  }, []);

  useAutoRefresh(() => {
    Promise.all([staffApi.list(), attendanceApi.listStaff()])
      .then(([s, r]) => {
        setStaff(s);
        setRecords(r);
      })
      .finally(() => setLoading(false));
  }, 5000);

  // Reload records when date changes
  useEffect(() => {
    attendanceApi.listStaff(date).then(setRecords);
  }, [date]);

  const handleMark = useCallback(
    async (staffId: string, currentRecord: StaffAttendanceRecord | undefined, status: string) => {
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
    },
    [date]
  );

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

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="relative z-50 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Attendance</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track and mark attendance for all staff members
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="staff-attendance-date" className="text-sm font-medium text-gray-600">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Present</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{summary.Present}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Absent</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{summary.Absent}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">On Leave</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600">{summary["On Leave"]}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Not Marked</p>
          <p className="mt-1 text-2xl font-bold text-gray-500">{summary["Not Marked"]}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by staff name"
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <StaffAttendanceTable
        staff={filteredStaff}
        records={records}
        date={date}
        onMark={handleMark}
      />
    </div>
  );
}
