export type MaintenanceRecord = {
  id: string;
  truckId: string;
  date: string;
  odometer: string;
  maintenanceType: string;
  description: string;
  cost: string;
  enteredByName?: string | null;
  source?: string | null;
  version?: number;
};

export type MaintenanceStatusItem = {
  truckId: string;
  item: string;
  remainingKm: number;
  category: string;
  status: "ok" | "attention";
};
