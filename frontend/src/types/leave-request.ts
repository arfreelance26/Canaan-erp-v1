export type LeaveRequestStatus = "Pending" | "Approved" | "Rejected";

export type LeaveApplicantCategory = "Driver" | "Commercial Manager" | "Assistant Commercial Manager" | "Accounts" | "Maintenance" | "Trip Sheet Register" | "Yard Supervisor";

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
