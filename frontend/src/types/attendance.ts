export type AttendanceStatus = "Present" | "Absent" | "On Leave" | "Not Marked";

export type AttendanceSource = "Web" | "App";

export type DriverAttendanceRecord = {
  id: string;
  driverId: string;
  date: string;
  status: AttendanceStatus;
  checkInTime: string | null;
  markedAt: string | null;
};

export type StaffAttendanceRecord = {
  id: string;
  staffId: string;
  date: string;
  status: AttendanceStatus;
  checkInTime: string | null;
  markedAt: string | null;
  source: AttendanceSource;
};
