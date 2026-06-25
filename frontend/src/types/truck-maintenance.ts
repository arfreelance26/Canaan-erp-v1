export type TruckMaintenanceSummary = {
  truckId: string;
};

export type MaintenanceRecord = {
  id: string;
  truckId: string;
  date: string;
  odometer: string;
  maintenanceType: string;
  description: string;
  cost: string;
};

export type MaintenanceCategory = "Service A" | "Service B" | "Service C" | "Major Service";

export type MaintenanceScheduleGroup = {
  category: MaintenanceCategory;
  intervalKm: number;
  items: string[];
};

export type MaintenanceStatus = "upcoming" | "attention";

export type MaintenanceStatusItem = {
  truckId: string;
  category: MaintenanceCategory;
  item: string;
  intervalKm: number;
  lastDoneOdometer: number | null;
  lastDoneDate: string | null;
  dueAtOdometer: number;
  remainingKm: number;
  status: MaintenanceStatus;
};
