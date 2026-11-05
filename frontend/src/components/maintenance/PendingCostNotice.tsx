"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RiCalendarScheduleLine as Scheduled } from "@remixicon/react";
import { maintenanceRequestsApi } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import type { MaintenanceRequest } from "@/types/maintenance-request";

type Props = {
  /** The period shown, YYYY-MM-DD; a job counts when its start date is inside. */
  from?: string;
  to?: string;
  /** Or the last N months up to today (the Running Cost Calculator's window). */
  lastMonths?: number;
  /** Only these trucks (DB ids); every truck when left out. */
  truckIds?: string[];
  className?: string;
};

/**
 * A warning on pages that show money (Profitability, Running Cost
 * Calculator): maintenance done in this period whose cost isn't known yet
 * (Scheduled Records), so the figures will change once it's added. Renders
 * nothing when there's none.
 */
export function PendingCostNotice({ from = "", to = "", lastMonths, truckIds, className = "" }: Props) {
  const [jobs, setJobs] = useState<MaintenanceRequest[]>([]);
  const [since, setSince] = useState("");
  const load = useCallback(() => {
    if (lastMonths) {
      const d = new Date();
      d.setMonth(d.getMonth() - lastMonths);
      setSince(d.toISOString().slice(0, 10));
    }
    maintenanceRequestsApi.scheduled().then(setJobs).catch(() => {});
  }, [lastMonths]);
  useEffect(() => { load(); }, [load]);
  useWebSocketEvent("maintenance_request_updated", load);

  const inPeriod = jobs.filter(
    (j) => (!from || j.date >= from) && (!to || j.date <= to) && (!since || j.date >= since)
      && (!truckIds || truckIds.includes(j.truckId)),
  );
  if (inPeriod.length === 0) return null;

  const trucks = [...new Set(inPeriod.map((j) => j.registrationNumber || j.truckIdStr))];
  const n = inPeriod.length;
  return (
    <div
      data-tour="pending-cost-notice"
      className={`flex items-start gap-2.5 rounded-xl border border-teal-border bg-teal-surface px-4 py-3 text-xs text-teal-text-strong ${className}`}
    >
      <Scheduled className="mt-0.5 h-4 w-4 shrink-0 text-teal-text" />
      <p>
        <span className="font-semibold">
          {n} maintenance job{n === 1 ? "" : "s"} {lastMonths ? `from the last ${lastMonths} months` : "in this period"} {n === 1 ? "is" : "are"} still waiting for {n === 1 ? "its" : "their"} cost
        </span>{" "}
        ({trucks.slice(0, 4).join(", ")}{trucks.length > 4 ? ` +${trucks.length - 4} more` : ""}). These figures don&apos;t include {n === 1 ? "it" : "them"} yet and will change once the cost is added and approved —{" "}
        <Link href="/maintenance/trucks" className="font-semibold underline underline-offset-2 hover:text-teal-text">
          add it in Scheduled Records
        </Link>.
      </p>
    </div>
  );
}
