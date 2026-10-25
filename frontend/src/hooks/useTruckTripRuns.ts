import { useEffect, useState } from "react";
import { runningCostApi, tripsApi, type TruckRunStats } from "@/lib/api";
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
        // One bulk request for the truck's whole history instead of one per trip.
        const withSheet = truckTrips.filter((t) => t.hasSheet).map((t) => t.id);
        const sheets = withSheet.length
          ? await tripsApi.getSheetsBulk(withSheet).catch(() => new Map())
          : new Map();
        setRows(truckTrips.map((trip) => ({ trip, totalKm: sheets.get(trip.id)?.totalKm || "" })));
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [active, truck]);

  return { rows, loading };
}

export const EMPTY_RUN_STATS: TruckRunStats = {
  totalDistance: 0, tripsWithDistance: 0, missingSheets: 0, firstTripDate: null, dataUntil: null, days: 0,
  months: 0, monthlyAvg: 0, dailyAvg: 0, avgPerTrip: 0, longest: 0, shortest: 0,
};

/**
 * A truck's distance stats (Monthly Distance Average etc.) from the server —
 * the single source shared by Truck Run Record, Cost Breakdown, EMI and
 * Truck Maintenance → Full Status, the calculator and Profitability.
 */
export function useTruckRunStats(truck: Truck | null, active: boolean) {
  const [stats, setStats] = useState<TruckRunStats>(EMPTY_RUN_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active || !truck) return;
    setLoading(true);
    runningCostApi
      .getRunStats(truck.truckId)
      .then(setStats)
      .catch(() => setStats(EMPTY_RUN_STATS))
      .finally(() => setLoading(false));
  }, [active, truck]);

  return { stats, loading };
}

/** "⚠ 3 trips missing trip sheets" — or "" when none. */
export function missingSheetsNote(stats: Pick<TruckRunStats, "missingSheets">): string {
  const n = stats.missingSheets;
  return n > 0 ? `⚠ ${n} completed trip${n === 1 ? "" : "s"} missing a trip sheet — not counted until entered` : "";
}
