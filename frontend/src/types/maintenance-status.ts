export type MaintenanceStatusItem = {
  typeName: string;
  intervalKm: number;
  lastOdometer: number | null;
  kmSinceLast: number;
  nextDueOdometer: number;
  /** "No Data" = this type has never had a maintenance record logged for
   * this truck — not evidence it's overdue, just that nothing's been entered. */
  status: "Overdue" | "Due Soon" | "No Data" | "OK";
};

export type TruckMaintenanceStatus = {
  truckDbId: string;
  truckId: string;
  registrationNumber: string;
  odometer: number;
  overdueCount: number;
  dueSoonCount: number;
  noDataCount: number;
  items: MaintenanceStatusItem[];
};
