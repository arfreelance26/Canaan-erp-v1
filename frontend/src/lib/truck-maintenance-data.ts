import type { Truck } from "@/types/truck";
import type {
  MaintenanceRecord,
  MaintenanceScheduleGroup,
  MaintenanceStatusItem,
  TruckMaintenanceSummary,
} from "@/types/truck-maintenance";

export const MAINTENANCE_SCHEDULE: MaintenanceScheduleGroup[] = [
  {
    category: "Service A",
    intervalKm: 10000,
    items: [
      "Brake inspection",
      "Steering inspection",
      "Greasing",
      "Air filter cleaning",
      "Transmission oil check",
      "Differential oil check",
    ],
  },
  {
    category: "Service B",
    intervalKm: 20000,
    items: [
      "Engine oil change",
      "Oil filter replacement",
      "Fuel filter inspection/replacement",
      "Clutch inspection",
    ],
  },
  {
    category: "Service C",
    intervalKm: 40000,
    items: ["Fuel filter replacement", "Air filter replacement", "Complete brake inspection"],
  },
  {
    category: "Major Service",
    intervalKm: 80000,
    items: [
      "Transmission oil replacement",
      "Differential oil replacement",
      "Full drivetrain inspection",
      "Suspension inspection",
    ],
  },
];

export const MAINTENANCE_TYPE_OPTIONS = MAINTENANCE_SCHEDULE.flatMap((group) => group.items);

export const UPCOMING_WINDOW_KM = 1000;

export const initialMaintenanceRecords: MaintenanceRecord[] = [
  {
    id: "1",
    truckId: "1",
    date: "2026-01-10",
    odometer: "80000",
    maintenanceType: "Engine oil change",
    description: "Routine Service B oil and filter change at authorized service center",
    cost: "8500",
  },
  {
    id: "2",
    truckId: "1",
    date: "2025-11-02",
    odometer: "70000",
    maintenanceType: "Brake inspection",
    description: "Service A brake and steering inspection, greasing done",
    cost: "3200",
  },
];

export function getMaintenanceStatus(truck: Truck, records: MaintenanceRecord[]): MaintenanceStatusItem[] {
  const currentOdometer = Number(truck.odometer) || 0;
  const truckRecords = records.filter((record) => record.truckId === truck.id);

  const result: MaintenanceStatusItem[] = [];

  for (const group of MAINTENANCE_SCHEDULE) {
    for (const item of group.items) {
      const matching = truckRecords
        .filter((record) => record.maintenanceType === item)
        .sort((a, b) => Number(b.odometer) - Number(a.odometer));

      const last = matching[0] ?? null;
      const lastDoneOdometer = last ? Number(last.odometer) : null;
      const dueAtOdometer = (lastDoneOdometer ?? 0) + group.intervalKm;
      const remainingKm = dueAtOdometer - currentOdometer;

      if (remainingKm > UPCOMING_WINDOW_KM) continue;

      result.push({
        truckId: truck.id,
        category: group.category,
        item,
        intervalKm: group.intervalKm,
        lastDoneOdometer,
        lastDoneDate: last?.date ?? null,
        dueAtOdometer,
        remainingKm,
        status: remainingKm <= 0 ? "attention" : "upcoming",
      });
    }
  }

  return result.sort((a, b) => a.remainingKm - b.remainingKm);
}



export function getTruckMaintenanceSummary(truck: Truck, records: MaintenanceRecord[]): TruckMaintenanceSummary {
  const status = getMaintenanceStatus(truck, records);
  const attentionCount = status.filter((entry) => entry.status === "attention").length;
  const upcomingCount = status.filter((entry) => entry.status === "upcoming").length;

  return {
    truckId: truck.id,
  };
}
