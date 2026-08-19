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
};
