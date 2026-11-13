"use client";

import { useMemo } from "react";
import { RiPencilLine as Pencil, RiEyeLine as Eye, RiPulseLine as Activity, RiCalendarScheduleLine as Scheduled } from "@remixicon/react";
import type { Truck } from "@/types/truck";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import { TruckTiles, type TruckView } from "@/components/fleet/TruckTiles";
import { formatDate } from "@/lib/format-date";

type TruckMaintenanceTableProps = {
  trucks: Truck[];
  view: TruckView;
  records: MaintenanceRecord[];
  onUpdateRecord: (truck: Truck) => void;
  /** Jobs saved before their cost was known. */
  onScheduledRecords: (truck: Truck) => void;
  /** How many jobs wait for a cost, by truck id. */
  scheduledCounts?: Record<string, number>;
  onViewRecord: (truck: Truck) => void;
  onViewStatus: (truck: Truck) => void;
};

export function TruckMaintenanceTable({
  trucks,
  view,
  records,
  onUpdateRecord,
  onScheduledRecords,
  scheduledCounts = {},
  onViewRecord,
  onViewStatus,
}: TruckMaintenanceTableProps) {
  // Per truck: how many records, and the newest one (its last service).
  const byTruck = useMemo(() => {
    const map = new Map<string, { count: number; last: MaintenanceRecord }>();
    for (const r of records) {
      const cur = map.get(r.truckId);
      if (!cur) map.set(r.truckId, { count: 1, last: r });
      else {
        cur.count += 1;
        if (r.date > cur.last.date) cur.last = r;
      }
    }
    return map;
  }, [records]);

  return (
    <TruckTiles
      trucks={trucks}
      view={view}
      tile="border-orange-border bg-orange-surface text-orange-text"
      emptyTitle="No trucks yet"
      emptyDescription="Add a truck under “Our Fleet” to get started"
      content={(truck) => {
        const m = byTruck.get(truck.id);
        const waiting = scheduledCounts[truck.id] ?? 0;
        return {
          facts: [
            { label: "Records", value: m ? `${m.count}` : "None yet", tone: m ? undefined : "muted" },
            { label: "Last service", value: m ? `${formatDate(m.last.date)} · ${m.last.maintenanceType}` : "—", tone: m ? undefined : "muted" },
            { label: "Waiting for a cost", value: waiting ? `${waiting} job${waiting === 1 ? "" : "s"}` : "None", tone: waiting ? "warn" : "muted" },
          ],
          actions: [
            { label: "Update Record", icon: Pencil, onClick: () => onUpdateRecord(truck),
              cls: "border border-warning-border bg-warning-surface text-warning-text hover:bg-warning-surface-strong" },
            { label: "Scheduled", icon: Scheduled, onClick: () => onScheduledRecords(truck), badge: waiting,
              cls: "border border-teal-border bg-teal-surface text-teal-text hover:bg-teal-surface-strong" },
            { label: "View Record", icon: Eye, onClick: () => onViewRecord(truck),
              cls: "bg-accent-solid text-on-solid shadow-sm hover:bg-accent-solid-hover" },
            { label: "Full Status", icon: Activity, onClick: () => onViewStatus(truck),
              cls: "border border-purple-border bg-purple-surface text-purple-text hover:bg-purple-surface-strong" },
          ],
        };
      }}
    />
  );
}
