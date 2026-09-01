export type MaintenanceRecord = {
  id: string;
  truckId: string;
  date: string;               // Maintenance Start Date
  maintenanceEndDate: string;
  odometer: string;
  maintenanceType: string;
  compliant: string;          // "Yes" | "No" | ""
  maintenanceLocation: string;
  maintenanceBy: string;
  description: string;        // Remarks
  cost: string;
  enteredByName?: string | null;
  source?: string | null;
  version?: number;
};

export type AirFilterRecord = {
  id: string;
  truckId: string;
  date: string;
  odometerDuringChange: string;
  currentOdometer: string;
  remarks: string;
  enteredByName?: string | null;
  version?: number;
};

export type MaintenanceStatusItem = {
  truckId: string;
  item: string;
  remainingKm: number;
  category: string;
  status: "ok" | "attention";
};
