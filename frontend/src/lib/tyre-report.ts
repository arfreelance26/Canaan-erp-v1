import type { TyreInventoryItem } from "@/types/tyre-inventory";

export function getTotalInvestment(tyre: TyreInventoryItem): number {
  return (Number(tyre.cost) || 0) + (Number(tyre.repairCost) || 0) + (Number(tyre.retreadCost) || 0);
}

export function getCostPerKilometer(totalInvestment: number, lifetimeKm: number): number | null {
  if (lifetimeKm <= 0) return null;
  return totalInvestment / lifetimeKm;
}

export function getNumberOfRetreads(tyre: TyreInventoryItem): number {
  return Math.max(0, Math.round(Number(tyre.retreadCount) || 0));
}

export function getTyreAgeInDays(tyre: TyreInventoryItem): number | null {
  if (!tyre.purchaseDate) return null;
  const purchase = new Date(tyre.purchaseDate).getTime();
  if (Number.isNaN(purchase)) return null;
  return Math.max(0, Math.floor((Date.now() - purchase) / (1000 * 60 * 60 * 24)));
}


