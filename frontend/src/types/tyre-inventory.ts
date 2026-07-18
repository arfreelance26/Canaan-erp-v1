export type TyreCondition = "New" | "Rethreaded";

export type TyreInventoryItem = {
  id: string;
  brand: string;
  tyreType: string;
  tyreNumber: string;
  size: string;
  rangeKm: string;
  cost: string;
  condition: TyreCondition | "";
  purchaseDate: string;
  repairCost: string;
  retreadCost: string;
  retreadCount: string;
  version?: number;
};
