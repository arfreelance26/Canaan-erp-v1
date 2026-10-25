/** A new maintenance record waiting on (or decided in) Maintenance Approvals —
 *  backend/routers/maintenance_requests.py. */
export type MaintenanceRequestStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";

export type MaintenanceRequest = {
  id: string;
  truckId: string;                 // truck DB id
  truckIdStr: string;              // CGI-T0005
  registrationNumber: string;
  tripId: string | null;
  tripIdStr: string | null;        // TRP-1282 for trip-sheet repairs
  source: "Web" | "Trip Sheet";
  status: MaintenanceRequestStatus;
  // The record as submitted.
  date: string;
  maintenanceEndDate: string;
  odometer: number;
  maintenanceType: string;
  repairType: string;
  compliant: string;
  maintenanceLocation: string;
  maintenanceBy: string;
  maintenanceByType: "Vendor" | "Individual" | null;
  invoiceNumber: string;
  invoiceDate: string;
  description: string;
  cost: number;
  remindAtOdometer: number | null;
  submittedByName: string;
  submittedByRole: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  rejectReason: string | null;
  recordId: string | null;
  requesterSeenAt: string | null;
  proofCount: number;
  createdAt: string;
};

export type MaintenanceRequestProof = {
  id: string;
  requestId: string;
  kind: "image" | "pdf";
  fileName: string;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: string | null;
};
