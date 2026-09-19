export type AdBlueLog = {
  id: string;
  truckId: string;
  date: string;
  odometer: string;
  litres: string;
  pricePerLitre: string;
  totalCost: string;
  fillingLocation: string | null;
  remarks: string | null;
  enteredByName: string | null;
  createdAt: string | null;
  version?: number;
};
