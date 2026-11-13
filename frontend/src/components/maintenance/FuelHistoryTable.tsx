import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import type { Truck } from "@/types/truck";
import type { FuelLog } from "@/types/fuel-log";
import { RiGasStationLine as Fuel, RiHistoryLine as History } from "@remixicon/react";
import { TruckTiles, type TruckView } from "@/components/fleet/TruckTiles";
import { formatDate } from "@/lib/format-date";

type FuelHistoryTableProps = {
  trucks: Truck[];
  view: TruckView;
  /** Every fuel log, for each truck's last fill and mileage (null while loading). */
  fuelLogs: FuelLog[] | null;
  onViewHistory?: (truck: Truck) => void;
  onEnterFuelLog?: (truck: Truck) => void;
};

// The app's plausible range for a loaded truck's km/L (the same rule as the Fuel report).
const PLAUSIBLE = (m: number) => m >= 1.5 && m <= 6;

export function FuelHistoryTable({ trucks, view, fuelLogs, onViewHistory, onEnterFuelLog }: FuelHistoryTableProps) {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  // Fuel history is open to the Maintenance team as well as Admin.
  const canViewFuelHistory = isAdmin || authUser?.softwareDesignation === "Maintenance";

  // Per truck: its newest fill, and the newest believable mileage.
  const byTruck = useMemo(() => {
    const map = new Map<string, { last: FuelLog; mileage: number | null }>();
    const sorted = [...(fuelLogs ?? [])].sort((a, b) => b.date.localeCompare(a.date) || Number(b.odometer) - Number(a.odometer));
    for (const log of sorted) {
      const cur = map.get(log.truckId);
      const m = parseFloat(log.mileage);
      if (!cur) map.set(log.truckId, { last: log, mileage: PLAUSIBLE(m) ? m : null });
      else if (cur.mileage === null && PLAUSIBLE(m)) cur.mileage = m;
    }
    return map;
  }, [fuelLogs]);

  const daysAgo = (date: string) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return Math.round((t.getTime() - d.getTime()) / 86_400_000);
  };

  return (
    <TruckTiles
      trucks={trucks}
      view={view}
      tile="border-accent-border bg-accent-surface text-accent-text"
      emptyTitle="No trucks found"
      emptyDescription="Add a truck in Our Fleet to get started"
      content={(truck) => {
        const f = byTruck.get(truck.id);
        const loading = fuelLogs === null;
        const ago = f ? daysAgo(f.last.date) : null;
        const litres = f ? parseFloat(f.last.litres) : NaN;
        return {
          facts: [
            {
              label: "Last fill",
              value: loading ? "…" : f ? `${formatDate(f.last.date)}${Number.isFinite(litres) ? ` · ${litres.toLocaleString("en-IN", { maximumFractionDigits: 1 })} L` : ""}` : "No fills yet",
              tone: !loading && (!f || (ago !== null && ago > 30)) ? "warn" : undefined,
            },
            {
              label: "Mileage",
              value: loading ? "…" : f?.mileage != null ? `${f.mileage.toFixed(2)} km/L` : "—",
              tone: f?.mileage == null ? "muted" : undefined,
            },
            ...(f && ago !== null ? [{ label: "Days since fill", value: ago === 0 ? "Today" : `${ago}`, tone: ago > 30 ? ("warn" as const) : undefined }] : []),
          ],
          actions: [
            ...(canViewFuelHistory ? [{
              label: "Fuel History", icon: History, onClick: () => onViewHistory?.(truck),
              cls: "border border-purple-border bg-purple-surface text-purple-text hover:bg-purple-surface-strong",
            }] : []),
            {
              label: "Enter Fuel Log", icon: Fuel, onClick: () => onEnterFuelLog?.(truck),
              cls: "bg-accent-solid text-on-solid shadow-sm hover:bg-accent-solid-hover",
            },
          ],
        };
      }}
    />
  );
}
