export type TyreCondition = "New" | "Rethreaded";

export type TyreInventoryItem = {
  id: string;
  brand: string;
  pattern: string;
  tyreType: string;
  tyreNumber: string;
  size: string;
  range: string;
  cost: string;
  condition: TyreCondition | "";
  purchaseDate: string;
  repairCost: string;
  retreadCost: string;
  retreadCount: string;
};
