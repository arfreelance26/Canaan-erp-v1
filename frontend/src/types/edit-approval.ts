export type EditApprovalStatus = "Pending" | "Approved" | "Rejected";
export type EditApprovalAction = "Edit" | "Delete";
export type EditApprovalResourceType = "Customer" | "Vendor" | "BookingSheet" | "TripSheet" | "TripData" | "Trip";

export type EditApprovalRequest = {
  id: string;
  staffDbId: number;
  staffName: string;
  staffCode: string | null;
  resourceType: EditApprovalResourceType;
  resourceId: number;
  resourceName: string;
  action: EditApprovalAction;
  reason: string;
  adminNote: string | null;
  approvedByName: string | null;
  status: EditApprovalStatus;
  approvedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
};
