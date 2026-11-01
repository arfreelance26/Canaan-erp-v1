export type TyreInventoryItem = {
  id: string;
  brand: string;
  tyreType: string;
  tyreNumber: string;
  size: string;
  rangeKm: string;
  cost: string;
  costPerKm: string;
  purchaseDate: string;
  retreadCost: string;
  retreadCount: string;
  condition: "New" | "Rethreaded";
  /** Vendor name (snapshot) or the individual's typed name. */
  maintenanceBy?: string;
  maintenanceByType?: "Vendor" | "Individual" | null;
  vendorId?: string | null;
  invoiceNumber?: string;
  invoiceDate?: string;
  /** Proof of Payment/Invoice — set once a file is uploaded (one per tyre). */
  proofFileName?: string | null;
  proofSizeBytes?: number | null;
  version?: number;
  retreadFlaggedAt?: string | null;
  retreadFlaggedBy?: string | null;
  discardedAt?: string | null;
  discardedBy?: string | null;
  discardReason?: string | null;
  /** Set when the tyre left with a sold/deleted truck — it can't go back to inventory. */
  soldWithTruckAt?: string | null;
};

export type TyreMovementEvent = {
  id: number;
  event: "Flagged for Retreading" | "Moved to Inventory" | "Flagged as Discarded" | "Restored from Discard" | "Sold with Truck";
  actorName: string;
  actorRole: string | null;
  retreadCost: string | null;
  expectedRange: number | null;
  retreadCount: number | null;
  retreadDoneBy?: string | null;
  /** Retread rows: Vendor (linked to Our Vendors) or Individual, the invoice and its proof. */
  retreadByType?: "Vendor" | "Individual" | null;
  vendorId?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  proofFileName?: string | null;
  proofSizeBytes?: number | null;
  createdAt: string;
};

/** Retread Queue → Move to Inventory: who did it, the invoice and the proof (one request). */
export type RetreadMoveInput = {
  retreadCost: string;
  expectedRange: string;
  retreadByType: "Vendor" | "Individual";
  vendorId: string;        // Vendor
  retreadDoneBy: string;   // Individual (typed name)
  invoiceNumber: string;
  invoiceDate: string;
  proof: File | null;
};

/** A retread a vendor did — Our Vendors → View Record → Tyre Retreads. */
export type VendorRetread = {
  id: string;              // the retread's history row
  tyreId: string;
  tyreNumber: string;
  brand: string;
  tyreSize: string;
  tyreType: string;
  date: string;
  retreadCost: number;
  expectedRange: number | null;
  retreadCount: number | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  proofFileName: string | null;
  proofSizeBytes: number | null;
  actorName: string;
};

export type TyreData = {
  tyre: TyreInventoryItem;
  addedToInventoryAt: string | null;
  movements: TyreMovementEvent[];
};

export type TyreRemarkScenario = "Attachment" | "Removal" | "Swap";

export type TyreRemarkPreset = {
  id: number;
  scenario: TyreRemarkScenario;
  text: string;
};
