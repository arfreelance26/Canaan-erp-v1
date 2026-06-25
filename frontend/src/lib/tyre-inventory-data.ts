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

export const TYRE_TYPE_OPTIONS = ["Radial", "Bias-Ply", "Tube", "Tubeless"];

export const TYRE_CONDITION_OPTIONS = ["New", "Rethreaded"];

export const initialTyreInventory: TyreInventoryItem[] = [
  {
    id: "1",
    brand: "MRF",
    pattern: "MRF Steeline TT13",
    tyreType: "Radial",
    tyreNumber: "MRF-2026-0001",
    size: "295/95 R22.5",
    range: "80000",
    cost: "18500",
    condition: "New",
    purchaseDate: "",
    repairCost: "0",
    retreadCost: "0",
    retreadCount: "0",
  },
];
