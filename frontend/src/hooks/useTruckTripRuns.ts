import { useEffect, useState } from "react";
import { tripsApi } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";

export type TruckTripRun = {
  trip: Trip;
  totalKm: string;
};

/**
 * Fetches every trip assigned to `truck` (matched on trip.vehicleId ===
 * truck.truckId) along with each trip's actual run distance (trip sheet's
 * totalKm). Shared by the "View Record" and "View Breakdown" dialogs on the
 * Truck Run Record page so both work off identical data.
 */
export function useTruckTripRuns(truck: Truck | null, active: boolean) {
  const [rows, setRows] = useState<TruckTripRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active || !truck) return;
    setLoading(true);
    tripsApi
      .list()
      .then(async (allTrips) => {
        const truckTrips = allTrips
          .filter((t) => t.vehicleId === truck.truckId)
          .sort((a, b) => (b.assignedDate || "").localeCompare(a.assignedDate || ""));
        const sheets = await Promise.all(
          truckTrips.map((t) => tripsApi.getSheet(t.id).catch(() => null))
        );
        setRows(truckTrips.map((trip, i) => ({ trip, totalKm: sheets[i]?.totalKm || "" })));
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [active, truck]);

  return { rows, loading };
}

/** Number of calendar months from the earliest trip to today, inclusive, min 1. */
function monthsSpanned(rows: TruckTripRun[]): number {
  const dates = rows.map((r) => r.trip.assignedDate).filter(Boolean).map((d) => new Date(d));
  if (dates.length === 0) return 1;
  const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
  const today = new Date();
  const months = (today.getFullYear() - earliest.getFullYear()) * 12 + (today.getMonth() - earliest.getMonth()) + 1;
  return Math.max(1, months);
}

/**
 * Distance stats for a truck's trip runs — single source of truth shared by
 * the "View Breakdown" dialog on the Truck Run Record page and the EMI
 * Insights dialog's "EMI Cost Per KM (Advanced)" calculation.
 */
export function computeTruckRunStats(rows: TruckTripRun[]) {
  const withDistance = rows.filter((r) => Number(r.totalKm) > 0);
  const totalDistance = withDistance.reduce((sum, r) => sum + Number(r.totalKm), 0);
  const months = monthsSpanned(rows);
  const monthlyAvg = totalDistance / months;
  const dailyAvg = monthlyAvg / 26;
  const avgPerTrip = withDistance.length > 0 ? totalDistance / withDistance.length : 0;
  const longest = withDistance.reduce((max, r) => Math.max(max, Number(r.totalKm)), 0);
  const shortest = withDistance.length > 0 ? withDistance.reduce((min, r) => Math.min(min, Number(r.totalKm)), Infinity) : 0;
  return { totalDistance, months, monthlyAvg, dailyAvg, avgPerTrip, longest, shortest, tripsWithDistance: withDistance.length };
}
