"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { RiDashboard3Line as Gauge, RiMoneyRupeeCircleLine as IndianRupee, RiCalendar2Line as CalendarDays } from "@remixicon/react";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import { trucksApi, maintenanceApi } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useTruckRunStats, missingSheetsNote } from "@/hooks/useTruckTripRuns";
import type { Truck } from "@/types/truck";

type Props = {
  open: boolean;
  onClose: () => void;
  truckDbId?: string;
  records: MaintenanceRecord[];
  tyreLayout?: string;
  truck?: Truck | null;
};

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Truck Maintenance → a truck's "Full Status": its maintenance cost (last 12
 * months, per month / per day / per km in Basic and Advanced). The old
 * km-interval maintenance alerts were removed — they're being redesigned.
 */
export function TruckStatusDialog({ open, onClose, truckDbId, records, tyreLayout, truck }: Props) {
  const [kmPerDay, setKmPerDay] = useState<number | null>(null);

  // Real, trip-history-based Monthly Distance Average for this truck — same
  // source and formula as the Truck Run Record page's "View Breakdown"
  // dialog — used for Cost / Km (Advanced) below.
  const { stats: runStats } = useTruckRunStats(truck ?? null, open);

  useEffect(() => {
    if (!open || !tyreLayout) return;
    trucksApi.getRunConfig().then((configs: Array<{ tyre_layout: string; km_per_day: string | null }>) => {
      const match = configs.find((c) => c.tyre_layout === tyreLayout);
      const val = match?.km_per_day ? parseFloat(String(match.km_per_day)) : null;
      setKmPerDay(val && val > 0 ? val : null);
    }).catch(() => {});
  }, [open, tyreLayout]);


  // Maintenance cost from the server (the one formula shared with the
  // calculator and Profitability): the last 12 months' bills spread over the
  // months the truck has actually been on record (≤ 12), ÷ 26 working days.
  const [costSummary, setCostSummary] = useState<{ total: number; months: number; monthly: number; daily: number; from: string | null; to: string } | null>(null);
  const [costKey, setCostKey] = useState(0);
  useEffect(() => {
    if (!open || !truckDbId) return;
    maintenanceApi.getTruckCostSummary(truckDbId).then(setCostSummary).catch(() => setCostSummary(null));
  }, [open, truckDbId, records, costKey]);
  useWebSocketEvent("maintenance_updated", () => { if (open) setCostKey((k) => k + 1); });
  const yearTotal      = costSummary?.total ?? 0;
  const avgMonthlyCost = costSummary?.monthly ?? 0;
  const avgDailyCost   = costSummary?.daily ?? 0;
  const monthsCovered  = costSummary?.months ?? 0;
  const periodFrom     = costSummary?.from ?? "—";
  const periodTo       = costSummary?.to ?? "—";

  if (!truck) return null;

  const costPerKm = avgDailyCost > 0 && kmPerDay !== null
    ? avgDailyCost / kmPerDay
    : null;

  // Advanced = the month's cost ÷ the month's km (Avg/Day × 26 ÷ Monthly
  // Distance Average) — no km/day involved, so it works without that setting.
  const costPerKmAdvanced = avgDailyCost > 0 && runStats.monthlyAvg > 0
    ? (avgDailyCost * 26) / runStats.monthlyAvg
    : null;

  const odometer = parseFloat(truck.odometer || "0") || 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Maintenance — ${truck.registrationNumber || truck.truckId}`}
      className="max-w-2xl"
    >
      {/* ── Top summary cards ── */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">

        {/* Truck info card */}
        <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-separator-border bg-fill-1">
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fill-3">
              <Gauge className="h-4 w-4 text-text-secondary" />
            </div>
            <div>
              <p className="text-caption-2-semibold text-text-tertiary">Truck ID</p>
              <p className="text-headline-semibold leading-tight text-text-primary">{truck.truckId}</p>
            </div>
          </div>

          <div className="mx-4 border-t border-separator-border" />

          {/* Row 1: Odometer */}
          <div className="px-4 py-3">
            <p className="text-caption-2-semibold text-text-tertiary">Odometer</p>
            <p className="mt-0.5 text-body-semibold tabular-nums text-text-primary">
              {odometer.toLocaleString("en-IN")} km
            </p>
          </div>

          {/* Row 2: Tyre Layout + Km/Day */}
          <div className="mx-4 border-t border-separator-border" />
          <div className="grid grid-cols-2 divide-x divide-separator-border px-4 py-3">
            <div className="pr-4">
              <p className="text-caption-2-semibold text-text-tertiary">Tyre Layout</p>
              <p className="mt-0.5 text-body-semibold text-text-primary">
                {tyreLayout ?? <span className="italic text-text-tertiary">—</span>}
              </p>
            </div>
            <div className="pl-4">
              <p className="text-caption-2-semibold text-text-tertiary">Km / Day</p>
              <p className="mt-0.5 text-body-semibold tabular-nums text-text-primary">
                {kmPerDay !== null
                  ? <>{kmPerDay.toLocaleString("en-IN")} <span className="text-caption-1-regular text-text-tertiary">km</span></>
                  : <span className="italic text-text-tertiary">Not set</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Cost stats card */}
        <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-accent-border bg-accent-surface">
          {/* Card header */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-surface-strong">
              <IndianRupee className="h-4 w-4 text-accent-text" />
            </div>
            <p className="text-caption-2-semibold text-accent-text">
              Maintenance Costs
            </p>
          </div>

          <div className="mx-4 border-t border-accent-border" />

          {/* 2×2 stat grid */}
          <div className="flex flex-col divide-y divide-accent-border px-4">
            {/* Row 1: 12-Mo Total | Avg/Month */}
            <div className="grid grid-cols-2 divide-x divide-accent-border py-3">
              <div className="pr-4">
                <p className="text-caption-2-semibold text-accent-text">Total (last 12 mo)</p>
                <p className="mt-1 text-body-semibold tabular-nums text-text-primary">
                  {yearTotal > 0 ? fmt(yearTotal) : <span className="text-text-tertiary">—</span>}
                </p>
              </div>
              <div className="pl-4">
                <p className="text-caption-2-semibold text-accent-text">Avg / Month</p>
                <p className="mt-1 text-body-semibold tabular-nums text-accent-text">
                  {yearTotal > 0 ? fmt(avgMonthlyCost) : <span className="text-text-tertiary">—</span>}
                </p>
              </div>
            </div>

            {/* Row 2: Avg/Day | Cost/Km (Basic) | Cost/Km (Advanced) */}
            <div className="grid grid-cols-3 divide-x divide-accent-border py-3">
              <div className="pr-4">
                <p className="text-caption-2-semibold text-accent-text">Avg / Day</p>
                <p className="mt-1 text-body-semibold tabular-nums text-accent-text">
                  {yearTotal > 0 ? fmt(avgDailyCost) : <span className="text-text-tertiary">—</span>}
                </p>
              </div>
              <div className="px-4">
                <p className="text-caption-2-semibold text-accent-text">Cost / Km (Basic)</p>
                <p className="mt-1 text-body-semibold tabular-nums text-success-text">
                  {costPerKm !== null
                    ? `₹${costPerKm.toFixed(4)}`
                    : <span className="text-text-tertiary">—</span>}
                </p>
              </div>
              <div className="pl-4">
                <p className="text-caption-2-semibold text-accent-text">Cost / Km (Advanced)</p>
                <p className="mt-1 text-body-semibold tabular-nums text-purple-text">
                  {costPerKmAdvanced !== null
                    ? `₹${costPerKmAdvanced.toFixed(6)}`
                    : <span className="text-text-tertiary">—</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Formula note */}
          <div className="mx-4 mb-4 rounded-lg border border-accent-border bg-background-primary-default px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3 text-accent-text" />
              <span className="text-caption-2-semibold text-accent-text">Period</span>
            </div>
            <p className="text-caption-2-medium tabular-nums text-accent-text">
              {periodFrom} → {periodTo}
            </p>
            <div className="mt-2 flex flex-col gap-0.5 border-t border-accent-border pt-2">
              <p className="text-[10px] text-accent-text">
                Avg/month = total ÷ months on record{monthsCovered > 0 ? ` (${monthsCovered.toFixed(1)} months, up to 12)` : " (up to 12)"}
              </p>
              <p className="text-[10px] text-accent-text">Avg/day = Avg/month ÷ 26 working days</p>
              <p className="text-[10px] text-accent-text">
                Cost/km (Basic) = Avg/day ÷ km/day
                {tyreLayout && kmPerDay !== null
                  ? ` (${tyreLayout} · ${kmPerDay} km/day)`
                  : tyreLayout
                  ? ` — km/day not configured for ${tyreLayout}`
                  : ""}
              </p>
              <p className="text-[10px] text-accent-text">
                Cost/km (Advanced) = Avg/day × 26 ÷ Monthly Distance Average
                {runStats.monthlyAvg > 0
                  ? ` (${runStats.monthlyAvg.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km/mo, from Truck Run Record)`
                  : " — no trip run history for this truck yet"}
                {missingSheetsNote(runStats) && <span className="block text-warning-text">{missingSheetsNote(runStats)}</span>}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end border-t border-separator-border pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-fill-2 px-4 py-2 text-body-medium text-text-primary hover:bg-fill-3"
        >
          Close
        </button>
      </div>
    </Dialog>
  );
}
