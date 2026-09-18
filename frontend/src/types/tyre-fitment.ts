export type TyreFitmentRecord = {
  id: string;
  tyreId: string;
  truckId: string;
  position: string;
  fittedOdometer: number;
  fittedDate: string;
  fittedByName: string | null;
  fittedRemark: string | null;
  removedOdometer: number | null;
  removedDate: string | null;
  removalRemark: string | null;
  removedByName: string | null;
};
