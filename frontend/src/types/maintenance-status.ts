export type MaintenanceStatusItem = {
  typeName: string;
  intervalKm: number;
  lastOdometer: number | null;
  kmSinceLast: number;
  nextDueOdometer: number;
  status: "Overdue" | "Due Soon" | "OK";
};

export type TruckMaintenanceStatus = {
  truckDbId: string;
  truckId: string;
  registrationNumber: string;
  odometer: number;
  overdueCount: number;
  dueSoonCount: number;
  items: MaintenanceStatusItem[];
};
