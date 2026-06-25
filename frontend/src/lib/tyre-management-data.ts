import type { TyreMaintenanceSummary } from "@/types/tyre-management";

export const initialTyreMaintenanceSummaries: TyreMaintenanceSummary[] = [
  {
    truckId: "1",
    upcomingMaintenanceCount: 1,
  },
];

export function getTyreMaintenanceSummary(
  truckId: string,
  summaries: TyreMaintenanceSummary[]
): TyreMaintenanceSummary {
  return (
    summaries.find((summary) => summary.truckId === truckId) ?? {
      truckId,
      upcomingMaintenanceCount: 0,
    }
  );
}
