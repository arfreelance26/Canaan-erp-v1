"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DriverAttendanceTable } from "@/components/attendance/DriverAttendanceTable";
import { driversApi, attendanceApi } from "@/lib/api";
import type { Driver } from "@/types/driver";
import type { DriverAttendanceRecord } from "@/types/attendance";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function getAttendanceForDate(
  records: DriverAttendanceRecord[],
  driverId: string,
  date: string
): DriverAttendanceRecord | undefined {
  return records.find((r) => r.driverId === driverId && r.date === date);
}

export default function DriverAttendancePage() {
  const [date, setDate] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [records, setRecords] = useState<DriverAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([driversApi.list(), attendanceApi.listDrivers()])
      .then(([d, r]) => {
        setDrivers(d);
        setRecords(r);
      })
      .finally(() => setLoading(false));
  }, []);

  // Reload records when date changes
  useEffect(() => {
    attendanceApi.listDrivers(date).then(setRecords);
  }, [date]);

  const summary = useMemo(() => {
    const counts = { Present: 0, Absent: 0, "On Leave": 0, "Not Marked": 0 };
    for (const driver of drivers) {
      const record = getAttendanceForDate(records, driver.id, date);
      const status = record?.status ?? "Not Marked";
      counts[status as keyof typeof counts] += 1;
    }
    return counts;
  }, [drivers, records, date]);

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return drivers;
    return drivers.filter((driver) => driver.name.toLowerCase().includes(query));
  }, [drivers, search]);

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Driver Attendance</h1>
          <p className="mt-1 text-sm text-gray-500">
            Attendance marked by drivers from the driver app
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="attendance-date" className="text-sm font-medium text-gray-600">
            Date
          </label>
          <input
            id="attendance-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
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
          placeholder="Search by driver name"
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <DriverAttendanceTable drivers={filteredDrivers} records={records} date={date} />
    </div>
  );
}
