/** A new maintenance record waiting on (or decided in) Maintenance Approvals —
 *  backend/routers/maintenance_requests.py. "Scheduled": saved before its cost
 *  was known; it waits in the truck's Scheduled Records until costs are added. */
export type MaintenanceRequestStatus = "Pending" | "Approved" | "Rejected" | "Cancelled" | "Scheduled";

import type { RepairLine } from "@/types/truck-maintenance";

// Mirrors SCHEDULED_REMIND_DAYS in backend/routers/maintenance_requests.py:
// a scheduled job this old reminds its owner (the bell) and shows in the recap.
export const SCHEDULED_REMIND_DAYS = 7;

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
  /** The repairs, each with its own cost, place, who did it and invoice. */
  repairLines: RepairLine[];
  remindAtOdometer: number | null;
  submittedById: string | null;
  submittedByName: string;
  submittedByRole: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  rejectReason: string | null;
  recordId: string | null;
  requesterSeenAt: string | null;
  /** Rejected, then fixed and sent back by its submitter (Maintenance Requests). */
  resubmitCount: number;
  /** The last rejection's reason, kept for the approver once it's sent back. */
  previousRejectReason: string | null;
  resubmittedAt: string | null;
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
