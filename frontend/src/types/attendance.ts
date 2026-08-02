export type AttendanceStatus = "Present" | "Absent" | "On Leave" | "Not Marked" | "On Trip" | "On Halt" | "Leave" | "On Workshop";

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
  checkOutTime: string | null;
  markedAt: string | null;
  source: AttendanceSource;
  adminOverride: boolean;
};

export type DriverAttendanceRemark = {
  id: string;
  driverId: string;
  date: string;
  remark: string;
  isLateEntry: boolean;
  createdAt: string | null;
};

export type AttendanceSummaryRow = {
  id: string;
  code: string;
  name: string;
  present: number;
  absent: number;
  onLeave: number;
  onTrip: number;
  onHalt: number;
  leave: number;
  onWorkshop: number;
  notMarked: number;
  totalDays: number;
};

export type StaffSelfSummary = {
  present: number;
  absent: number;
  onLeave: number;
  notMarked: number;
  daysElapsed: number;
  workingDays: number;
  percentage: number;
};
