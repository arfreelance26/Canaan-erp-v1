import type { Truck } from "@/types/truck";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { TyreInventoryItem } from "@/types/tyre-inventory";



export const initialTyreFitmentRecords: TyreFitmentRecord[] = [];

export function getActiveFitment(tyreId: string, records: TyreFitmentRecord[]): TyreFitmentRecord | null {
  return records.find((record) => record.tyreId === tyreId && record.removedOdometer === null) ?? null;
}

export function getFitmentForPosition(
  truckId: string,
  position: string,
  records: TyreFitmentRecord[]
): TyreFitmentRecord | null {
  return (
    records.find(
      (record) => record.truckId === truckId && record.position === position && record.removedOdometer === null
    ) ?? null
  );
}





export function getAvailableTyres(tyres: TyreInventoryItem[], records: TyreFitmentRecord[]): TyreInventoryItem[] {
  const fittedTyreIds = new Set(
    records.filter((record) => record.removedOdometer === null).map((record) => record.tyreId)
  );
  return tyres.filter((tyre) => !fittedTyreIds.has(tyre.id));
}
