export type LeaveRequestStatus = "Pending" | "Approved" | "Rejected";

export type LeaveApplicantCategory = "Driver" | "Fleet Manager" | "Tyre Manager" | "Staff";

export type LeaveRequest = {
  id: string;
  category: LeaveApplicantCategory;
  applicantId: string;
  applicantName: string;
  applicantCode: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: LeaveRequestStatus;
  appliedAt: string;
};
