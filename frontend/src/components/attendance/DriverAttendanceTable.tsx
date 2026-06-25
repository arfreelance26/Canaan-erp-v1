"use client";

import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { getAttendanceForDate } from "@/lib/attendance-data";
import type { Driver } from "@/types/driver";
import type { DriverAttendanceRecord } from "@/types/attendance";

type DriverAttendanceTableProps = {
  drivers: Driver[];
  records: DriverAttendanceRecord[];
  date: string;
};

const columns = ["Photo", "Driver ID", "Driver's Name", "Branch", "Status", "Check-in Time", "Marked At"];

const statusStyles: Record<string, string> = {
  Present: "bg-green-50 text-green-700",
  Absent: "bg-red-50 text-red-700",
  "On Leave": "bg-yellow-50 text-yellow-700",
  "Not Marked": "bg-gray-100 text-gray-500",
};

function formatMarkedAt(markedAt: string | null): string {
  if (!markedAt) return "—";
  return new Date(markedAt).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DriverAttendanceTable({ drivers, records, date }: DriverAttendanceTableProps) {
  if (drivers.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No driver records yet. Add drivers under &ldquo;Our Drivers&rdquo; to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[1000px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((column) => (
              <th
                key={column}
                className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {drivers.map((driver) => {
            const record = getAttendanceForDate(records, driver.id, date);
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
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      statusStyles[status] ?? "bg-gray-100 text-gray-600"
                    )}
                  >
                    {status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{record?.checkInTime ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600">{formatMarkedAt(record?.markedAt ?? null)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
