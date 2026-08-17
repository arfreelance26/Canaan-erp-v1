import type { TyreInventoryItem } from "@/types/tyre-inventory";

export const TYRE_BRAND_OPTIONS = [
  "MRF",
  "CEAT",
  "JK Tyre",
  "Apollo Tyres",
  "Bridgestone",
  "Michelin",
  "Goodyear",
  "Continental",
  "Yokohama",
];

export const TYRE_TYPE_OPTIONS = ["RADIAL", "TUBELESS", "NYLON", "RETREADED"];

export const initialTyreInventory: TyreInventoryItem[] = [
  {
    id: "1",
    brand: "MRF",
    tyreType: "RADIAL",
    tyreNumber: "MRF-2026-0001",
    size: "295/95 R22.5",
    rangeKm: "80000",
    cost: "18500",
    costPerKm: "",
    purchaseDate: "",
    repairCost: "0",
    retreadCost: "0",
    retreadCount: "0",
  },
];
