import type { Truck } from "@/types/truck";
import type { AirFilterRecord } from "@/types/truck-maintenance";

/** Flag a truck once its next-change target is within this many km. */
export const AIR_FILTER_DUE_SOON_KM = 5000;

export type AirFilterAlertStatus = "overdue" | "due_soon";

export type AirFilterAlert = {
  truck: Truck;
  record: AirFilterRecord;
  currentOdometer: number;
  nextChangeOdometer: number;
  /** Negative once overdue — km past the next-change target. */
  dueInKm: number;
  status: AirFilterAlertStatus;
};

function n(v: string | number | undefined | null): number {
  const num = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(num) ? num : 0;
}

/** Most recent (by date) air filter record per truck, for trucks that have one. */
function latestRecordByTruck(records: AirFilterRecord[]): Map<string, AirFilterRecord> {
  const map = new Map<string, AirFilterRecord>();
  for (const r of records) {
    const existing = map.get(r.truckId);
    if (!existing || r.date > existing.date) map.set(r.truckId, r);
  }
  return map;
}

/**
 * One alert per truck whose latest air filter log's "Odometer Value for Next
 * Change" is overdue or within AIR_FILTER_DUE_SOON_KM of the truck's live
 * Current Odometer (updated after every trip). Sorted most urgent first.
 * A truck with no air filter log yet has nothing to compare against, so it's
 * not flagged — that's a data-entry gap, not an overdue change.
 */
export function getAirFilterAlerts(trucks: Truck[], records: AirFilterRecord[]): AirFilterAlert[] {
  const latest = latestRecordByTruck(records);
  const alerts: AirFilterAlert[] = [];
  for (const truck of trucks) {
    const record = latest.get(truck.id);
    if (!record) continue;
    const currentOdometer = n(truck.odometer);
    const nextChangeOdometer = n(record.nextChangeOdometer);
    const dueInKm = nextChangeOdometer - currentOdometer;
    if (dueInKm > AIR_FILTER_DUE_SOON_KM) continue;
    alerts.push({
      truck,
      record,
      currentOdometer,
      nextChangeOdometer,
      dueInKm,
      status: dueInKm < 0 ? "overdue" : "due_soon",
    });
  }
  return alerts.sort((a, b) => a.dueInKm - b.dueInKm);
}
