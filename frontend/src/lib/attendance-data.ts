import type { DriverAttendanceRecord, StaffAttendanceRecord } from "@/types/attendance";

export const initialDriverAttendance: DriverAttendanceRecord[] = [
  {
    id: "1",
    driverId: "1",
    date: "2026-06-09",
    status: "Present",
    checkInTime: "08:02 AM",
    markedAt: "2026-06-09T08:02:00",
  },
  {
    id: "2",
    driverId: "1",
    date: "2026-06-10",
    status: "Present",
    checkInTime: "07:55 AM",
    markedAt: "2026-06-10T07:55:00",
  },
  {
    id: "3",
    driverId: "1",
    date: "2026-06-11",
    status: "On Leave",
    checkInTime: null,
    markedAt: "2026-06-11T07:40:00",
  },
  {
    id: "4",
    driverId: "1",
    date: "2026-06-12",
    status: "Present",
    checkInTime: "08:10 AM",
    markedAt: "2026-06-12T08:10:00",
  },
  {
    id: "5",
    driverId: "1",
    date: "2026-06-13",
    status: "Present",
    checkInTime: "07:58 AM",
    markedAt: "2026-06-13T07:58:00",
  },
  {
    id: "6",
    driverId: "2",
    date: "2026-06-09",
    status: "Present",
    checkInTime: "08:20 AM",
    markedAt: "2026-06-09T08:20:00",
  },
  {
    id: "7",
    driverId: "2",
    date: "2026-06-10",
    status: "Absent",
    checkInTime: null,
    markedAt: null,
  },
  {
    id: "8",
    driverId: "2",
    date: "2026-06-11",
    status: "Present",
    checkInTime: "08:05 AM",
    markedAt: "2026-06-11T08:05:00",
  },
  {
    id: "9",
    driverId: "2",
    date: "2026-06-12",
    status: "Present",
    checkInTime: "08:00 AM",
    markedAt: "2026-06-12T08:00:00",
  },
];

export function getAttendanceForDate(
  records: DriverAttendanceRecord[],
  driverId: string,
  date: string
): DriverAttendanceRecord | null {
  return (
    records.find((record) => record.driverId === driverId && record.date === date) ?? null
  );
}

export const initialStaffAttendance: StaffAttendanceRecord[] = [
  {
    id: "1",
    staffId: "1",
    date: "2026-06-09",
    status: "Present",
    checkInTime: "09:02 AM",
    markedAt: "2026-06-09T09:02:00",
    source: "Web",
  },
  {
    id: "2",
    staffId: "1",
    date: "2026-06-10",
    status: "Present",
    checkInTime: "08:58 AM",
    markedAt: "2026-06-10T08:58:00",
    source: "Web",
  },
  {
    id: "3",
    staffId: "1",
    date: "2026-06-11",
    status: "On Leave",
    checkInTime: null,
    markedAt: "2026-06-11T08:30:00",
    source: "Web",
  },
  {
    id: "4",
    staffId: "1",
    date: "2026-06-12",
    status: "Present",
    checkInTime: "09:05 AM",
    markedAt: "2026-06-12T09:05:00",
    source: "Web",
  },
  {
    id: "5",
    staffId: "1",
    date: "2026-06-13",
    status: "Present",
    checkInTime: "08:55 AM",
    markedAt: "2026-06-13T08:55:00",
    source: "Web",
  },
  {
    id: "6",
    staffId: "3",
    date: "2026-06-09",
    status: "Present",
    checkInTime: "08:40 AM",
    markedAt: "2026-06-09T08:40:00",
    source: "App",
  },
  {
    id: "7",
    staffId: "3",
    date: "2026-06-10",
    status: "Present",
    checkInTime: "08:45 AM",
    markedAt: "2026-06-10T08:45:00",
    source: "App",
  },
  {
    id: "8",
    staffId: "3",
    date: "2026-06-11",
    status: "Absent",
    checkInTime: null,
    markedAt: null,
    source: "App",
  },
  {
    id: "9",
    staffId: "3",
    date: "2026-06-12",
    status: "Present",
    checkInTime: "08:38 AM",
    markedAt: "2026-06-12T08:38:00",
    source: "App",
  },
];

export function getStaffAttendanceForDate(
  records: StaffAttendanceRecord[],
  staffId: string,
  date: string
): StaffAttendanceRecord | null {
  return records.find((record) => record.staffId === staffId && record.date === date) ?? null;
}
