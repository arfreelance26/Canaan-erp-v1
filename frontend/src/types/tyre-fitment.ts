export type TyreFitmentRecord = {
  id: string;
  tyreId: string;
  truckId: string;
  position: string;
  fittedOdometer: number;
  fittedDate: string;
  removedOdometer: number | null;
  removedDate: string | null;
};
