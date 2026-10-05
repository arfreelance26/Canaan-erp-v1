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
  version?: number;
  retreadFlaggedAt?: string | null;
  retreadFlaggedBy?: string | null;
  discardedAt?: string | null;
  discardedBy?: string | null;
  discardReason?: string | null;
};

export type TyreMovementEvent = {
  id: number;
  event: "Flagged for Retreading" | "Moved to Inventory" | "Flagged as Discarded" | "Restored from Discard";
  actorName: string;
  actorRole: string | null;
  retreadCost: string | null;
  expectedRange: number | null;
  retreadCount: number | null;
  retreadDoneBy?: string | null;
  createdAt: string;
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
