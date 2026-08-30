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
  /** Snapshot of the staff member's name taken when this record was created —
   * stays populated even if that staff member is later deleted (staffId then
   * comes back as "", since the backend column goes NULL). Prefer this over
   * looking the name up by staffId when it's available. */
  staffName?: string | null;
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
  holidays: number;
  daysElapsed: number;
  workingDays: number;
  percentage: number;
};

export type Holiday = {
  id: string;
  date: string;        // YYYY-MM-DD
  name: string;
  type: "Government" | "Company";
  createdAt: string | null;
};
