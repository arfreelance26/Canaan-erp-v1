"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { AlertTriangle, Clock, CheckCircle2, Gauge, IndianRupee, CalendarDays } from "lucide-react";
import type { TruckMaintenanceStatus } from "@/types/maintenance-status";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import { trucksApi, maintenanceApi } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";

type Props = {
  open: boolean;
  onClose: () => void;
  status: TruckMaintenanceStatus | null;
  truckDbId?: string;
  records: MaintenanceRecord[];
  tyreLayout?: string;
};

function StatusBadge({ status }: { status: "Overdue" | "Due Soon" | "OK" }) {
  if (status === "Overdue")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <AlertTriangle className="h-3 w-3" /> Overdue
      </span>
    );
  if (status === "Due Soon")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        <Clock className="h-3 w-3" /> Due Soon
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> OK
    </span>
  );
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TruckStatusDialog({ open, onClose, status, truckDbId, records, tyreLayout }: Props) {
  const [kmPerDay, setKmPerDay] = useState<number | null>(null);
  const [freshStatus, setFreshStatus] = useState<TruckMaintenanceStatus | null>(null);

  useEffect(() => {
    if (!open) { setFreshStatus(null); return; }
    if (truckDbId) {
      maintenanceApi.getTruckStatus(truckDbId).then(setFreshStatus).catch(() => {});
    }
  }, [open, truckDbId]);

  useEffect(() => {
    if (!open || !tyreLayout) return;
    trucksApi.getRunConfig().then((configs: Array<{ tyre_layout: string; km_per_day: string | null }>) => {
      const match = configs.find((c) => c.tyre_layout === tyreLayout);
      const val = match?.km_per_day ? parseFloat(String(match.km_per_day)) : null;
      setKmPerDay(val && val > 0 ? val : null);
    }).catch(() => {});
  }, [open, tyreLayout]);

  useWebSocketEvent("maintenance_updated", () => {
    if (!open || !truckDbId) return;
    maintenanceApi.getTruckStatus(truckDbId).then(setFreshStatus).catch(() => {});
  });

  const effectiveStatus = freshStatus ?? status;

  const { yearTotal, avgMonthlyCost, avgDailyCost, periodFrom, periodTo } = useMemo(() => {
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    const toIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const from = toIso(oneYearAgo);
    const to   = toIso(today);

    const yearRecords = records.filter((r) => r.date >= from && r.date <= to);
    const total   = yearRecords.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);
    const monthly = total / 12;
    const daily   = monthly / 26;

    return { yearTotal: total, avgMonthlyCost: monthly, avgDailyCost: daily, periodFrom: from, periodTo: to };
  }, [records]);

  if (!effectiveStatus) return null;

  const costPerKm = avgDailyCost > 0 && kmPerDay !== null
    ? avgDailyCost / kmPerDay
    : null;

  const overdueItems = effectiveStatus.items.filter((i) => i.status === "Overdue");
  const dueSoonItems = effectiveStatus.items.filter((i) => i.status === "Due Soon");
  const okItems      = effectiveStatus.items.filter((i) => i.status === "OK");
  const hasAlerts    = effectiveStatus.overdueCount > 0 || effectiveStatus.dueSoonCount > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Maintenance Status — ${effectiveStatus.registrationNumber}`}
      className="max-w-2xl"
    >
      {/* ── Top summary cards ── */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">

        {/* Truck info card */}
        <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700">
              <Gauge className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Truck ID</p>
              <p className="text-base font-bold leading-tight text-slate-800 dark:text-slate-100">{effectiveStatus.truckId}</p>
            </div>
          </div>

          <div className="mx-4 border-t border-slate-200 dark:border-slate-700" />

          {/* Row 1: Odometer + alert chips */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Odometer</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                {effectiveStatus.odometer.toLocaleString("en-IN")} km
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {hasAlerts ? (
                <>
                  {effectiveStatus.overdueCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <AlertTriangle className="h-3 w-3" /> {effectiveStatus.overdueCount} Overdue
                    </span>
                  )}
                  {effectiveStatus.dueSoonCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <Clock className="h-3 w-3" /> {effectiveStatus.dueSoonCount} Due Soon
                    </span>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> All Good
                </span>
              )}
            </div>
          </div>

          {/* Row 2: Tyre Layout + Km/Day */}
          <div className="mx-4 border-t border-slate-200 dark:border-slate-700" />
          <div className="grid grid-cols-2 divide-x divide-slate-200 px-4 py-3 dark:divide-slate-700">
            <div className="pr-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Tyre Layout</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                {tyreLayout ?? <span className="italic text-slate-400">—</span>}
              </p>
            </div>
            <div className="pl-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Km / Day</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                {kmPerDay !== null
                  ? <>{kmPerDay.toLocaleString("en-IN")} <span className="text-xs font-normal text-slate-400">km</span></>
                  : <span className="italic text-slate-400">Not set</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Cost stats card */}
        <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30">
          {/* Card header */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-200 dark:bg-blue-800/60">
              <IndianRupee className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-500 dark:text-blue-400">
              Maintenance Costs
            </p>
          </div>

          <div className="mx-4 border-t border-blue-200 dark:border-blue-800/50" />

          {/* 2×2 stat grid */}
          <div className="flex flex-col divide-y divide-blue-200 px-4 dark:divide-blue-800/50">
            {/* Row 1: 12-Mo Total | Avg/Month */}
            <div className="grid grid-cols-2 divide-x divide-blue-200 py-3 dark:divide-blue-800/50">
              <div className="pr-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-400 dark:text-blue-500">12-Mo Total</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-slate-800 dark:text-slate-200">
                  {yearTotal > 0 ? fmt(yearTotal) : <span className="text-slate-400">—</span>}
                </p>
              </div>
              <div className="pl-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-400 dark:text-blue-500">Avg / Month</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-blue-700 dark:text-blue-300">
                  {yearTotal > 0 ? fmt(avgMonthlyCost) : <span className="text-slate-400">—</span>}
                </p>
              </div>
            </div>

            {/* Row 2: Avg/Day | Cost/Km */}
            <div className="grid grid-cols-2 divide-x divide-blue-200 py-3 dark:divide-blue-800/50">
              <div className="pr-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-400 dark:text-blue-500">Avg / Day</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-blue-700 dark:text-blue-300">
                  {yearTotal > 0 ? fmt(avgDailyCost) : <span className="text-slate-400">—</span>}
                </p>
              </div>
              <div className="pl-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-400 dark:text-blue-500">Cost / Km</p>
                <p className="mt-1 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {costPerKm !== null
                    ? `₹${costPerKm.toFixed(4)}`
                    : <span className="text-slate-400">—</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Formula note */}
          <div className="mx-4 mb-4 rounded-lg border border-blue-200 bg-white/60 px-3 py-2.5 dark:border-blue-800/50 dark:bg-blue-950/50">
            <div className="mb-1.5 flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3 text-blue-400 dark:text-blue-500" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-400 dark:text-blue-500">Period</span>
            </div>
            <p className="text-[11px] font-medium tabular-nums text-blue-600 dark:text-blue-400">
              {periodFrom} → {periodTo}
            </p>
            <div className="mt-2 flex flex-col gap-0.5 border-t border-blue-100 pt-2 dark:border-blue-800/50">
              <p className="text-[10px] text-blue-400 dark:text-blue-500">Avg/month = 12-month total ÷ 12</p>
              <p className="text-[10px] text-blue-400 dark:text-blue-500">Avg/day = Avg/month ÷ 26 working days</p>
              <p className="text-[10px] text-blue-400 dark:text-blue-500">
                Cost/km = Avg/day ÷ km/day
                {tyreLayout && kmPerDay !== null
                  ? ` (${tyreLayout} · ${kmPerDay} km/day)`
                  : tyreLayout
                  ? ` — km/day not configured for ${tyreLayout}`
                  : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Maintenance schedule table ── */}
      {effectiveStatus.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          No maintenance types configured. Visit Admin › Maintenance Alert Management to add types.
        </p>
      ) : (
        <>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Maintenance Schedule &nbsp;·&nbsp; {effectiveStatus.items.length} types
          </p>
          <div className="max-h-[38vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-400">Type</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-400">Interval</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-400">Last Done</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-400">Km Since</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {[...overdueItems, ...dueSoonItems, ...okItems].map((item) => (
                  <tr
                    key={item.typeName}
                    className={
                      item.status === "Overdue"
                        ? "border-l-2 border-l-red-400 bg-red-50/60 dark:bg-red-900/10"
                        : item.status === "Due Soon"
                        ? "border-l-2 border-l-amber-400 bg-amber-50/60 dark:bg-amber-900/10"
                        : "bg-white dark:bg-slate-900"
                    }
                  >
                    <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">{item.typeName}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                      every {item.intervalKm.toLocaleString("en-IN")} km
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                      {item.lastOdometer !== null
                        ? `${item.lastOdometer.toLocaleString("en-IN")} km`
                        : <span className="italic text-slate-400">Never</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={
                        item.status === "Overdue"  ? "font-semibold text-red-600 dark:text-red-400" :
                        item.status === "Due Soon" ? "font-semibold text-amber-600 dark:text-amber-400" :
                        "text-slate-500"
                      }>
                        {item.kmSinceLast.toLocaleString("en-IN")} km
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-4 flex justify-end border-t border-slate-100 pt-4 dark:border-slate-700">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
        >
          Close
        </button>
      </div>
    </Dialog>
  );
}
