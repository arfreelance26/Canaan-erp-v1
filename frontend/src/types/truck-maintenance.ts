export type MaintenanceRecord = {
  id: string;
  truckId: string;
  date: string;
  odometer: string;
  maintenanceType: string;
  description: string;
  cost: string;
  version?: number;
};
