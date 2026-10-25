export type MaintenanceRecord = {
  id: string;
  truckId: string;
  date: string;               // Maintenance Start Date
  maintenanceEndDate: string;
  odometer: string;
  maintenanceType: string;
  repairType: string;
  compliant: string;          // "Yes" | "No" | ""
  maintenanceLocation: string;
  maintenanceBy: string;
  description: string;        // Remarks
  cost: string;
  enteredByName?: string | null;
  source?: string | null;
  version?: number;
  /** Number of Proof of Payment files attached. */
  proofCount?: number;
  /** Maintenance By toggle; for "Vendor", vendorId links the record to Our Vendors. */
  maintenanceByType?: "Vendor" | "Individual" | null;
  vendorId?: string | null;
  /** Invoice number given by the vendor / individual. */
  invoiceNumber?: string;
  /** YYYY-MM-DD, "" when not given. */
  invoiceDate?: string;
  /** "Notify me when this is due again" — the odometer to alert at ("" = no reminder). */
  remindAtOdometer?: string;
  /** Only on Our Vendors → View Record rows. */
  truckCode?: string | null;
  truckRegistration?: string | null;
};

/** A Proof of Payment file on a maintenance record (5 images + 3 PDFs max). */
export type MaintenanceProof = {
  id: string;
  recordId: string;
  kind: "image" | "pdf";
  fileName: string;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: string | null;
};

export const PROOF_MAX_IMAGES = 5;
export const PROOF_MAX_PDFS = 3;
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;

