"use client";

import { useEffect, useMemo, useState } from "react";
import { Gauge } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { trucksApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import type { EmiRecord } from "@/types/finance";
import { paidInstallments } from "@/lib/emi-schedule";
import { formatDate } from "@/lib/format-date";
import { useTruckTripRuns, computeTruckRunStats } from "@/hooks/useTruckTripRuns";

const RUN_CONFIG_KEY = "erp_truck_run_config";

function getKmPerDayFromCache(tyreLayout: string): number {
  try {
    const saved = JSON.parse(localStorage.getItem(RUN_CONFIG_KEY) ?? "{}");
    return Number(saved[tyreLayout]?.day) || 0;
  } catch { return 0; }
}

type EmiInsightsDialogProps = {
  open: boolean;
  onClose: () => void;
  record: EmiRecord | null;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-gray-50 px-3.5 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <span className="truncate text-sm font-semibold text-gray-800">{value || "—"}</span>
    </div>
  );
}

export function EmiInsightsDialog({ open, onClose, record }: EmiInsightsDialogProps) {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [runConfigCache, setRunConfigCache] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    trucksApi.list().then(setTrucks).catch(() => setTrucks([]));
    trucksApi.getRunConfig().then((rows: { tyre_layout: string; km_per_day: string | null }[]) => {
      const map: Record<string, number> = {};
      for (const r of rows) map[r.tyre_layout] = Number(r.km_per_day) || 0;
      setRunConfigCache(map);
    }).catch(() => {});
  }, [open]);

  const selectedTruck = useMemo(
    () => trucks.find((t) => t.registrationNumber === record?.truckRegistration) ?? null,
    [trucks, record]
  );

  // Real, trip-history-based Monthly Distance Average for this truck — same
  // source and formula as the "View Breakdown" dialog on the Truck Run
  // Record page — used for EMI Cost Per KM (Advanced) below.
  const { rows: truckRuns } = useTruckTripRuns(selectedTruck, open);
  const runStats = useMemo(() => computeTruckRunStats(truckRuns), [truckRuns]);

  const insights = useMemo(() => {
    if (!record) return null;
    const tenure = Number(record.tenureMonths) || 0;
    const emiAmt = Number(record.emiAmount) || 0;

    const paidMonths = paidInstallments(record, tenure);
    const amountPaid = paidMonths * emiAmt;
    const remainingEmiAmount = (tenure - paidMonths) * emiAmt;
    const totalEmiPayable = tenure > 0 ? tenure * emiAmt : 0;
    const dailyFinanceCost = emiAmt > 0 ? emiAmt / 26 : 0;

    const kmPerDay = selectedTruck
      ? (runConfigCache[selectedTruck.tyreLayout] || getKmPerDayFromCache(selectedTruck.tyreLayout))
      : 0;
    const emiCostPerKm = dailyFinanceCost > 0 && kmPerDay > 0 ? dailyFinanceCost / kmPerDay : 0;

    // EMI Cost Per KM (Advanced) = Daily Finance Cost ÷ Monthly Distance
    // Average for this truck (from the Truck Run Record page's real trip
    // history), instead of Basic's admin-configured Km/Day figure.
    const emiCostPerKmAdvanced = dailyFinanceCost > 0 && runStats.monthlyAvg > 0
      ? dailyFinanceCost / runStats.monthlyAvg
      : 0;

    return { tenure, emiAmt, amountPaid, remainingEmiAmount, totalEmiPayable, dailyFinanceCost, emiCostPerKm, kmPerDay, emiCostPerKmAdvanced };
  }, [record, selectedTruck, runConfigCache, runStats]);

  if (!record || !insights) return null;

  const fmtCur = (n: number) => `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`EMI Insights — ${record.emiName || record.truckRegistration || "Untitled"}`}
      className="sm:max-w-xl md:max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="EMI Name" value={record.emiName} />
          <Field label="Truck Registration Number" value={record.truckRegistration} />
          <Field label="Bank Name" value={record.bankName} />
          <Field label="EMI Amount" value={fmtCur(insights.emiAmt)} />
          <Field label="EMI Start Date" value={formatDate(record.emiStartDate)} />
          <Field label="EMI End Date" value={formatDate(record.emiEndDate)} />
          <Field label="Tenure (in Months)" value={insights.tenure ? `${insights.tenure} months` : ""} />
          <Field label="Amount Paid" value={insights.tenure > 0 ? fmtCur(insights.amountPaid) : ""} />
          <Field label="Remaining EMI Payable" value={insights.tenure > 0 ? fmtCur(insights.remainingEmiAmount) : ""} />
          <Field label="Total EMI Payable" value={insights.totalEmiPayable > 0 ? fmtCur(insights.totalEmiPayable) : ""} />
          <Field label="Daily Finance Cost" value={insights.dailyFinanceCost > 0 ? fmtCur(insights.dailyFinanceCost) : ""} />
          <Field label="Auto-Debit Date (Day of Month)" value={record.autoDebitDate ? String(new Date(record.autoDebitDate).getDate()) : ""} />
        </div>

        {/* EMI Cost per Km — Basic & Advanced */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Gauge className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">EMI Cost per Km (Basic)</p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {insights.emiCostPerKm > 0
                  ? `₹ ${insights.emiCostPerKm.toLocaleString("en-IN", { minimumFractionDigits: 4 })}`
                  : "—"}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
                {!record.truckRegistration
                  ? "No truck assigned to this EMI"
                  : insights.kmPerDay === 0
                  ? `No run config for ${selectedTruck?.tyreLayout ?? "this truck's layout"}`
                  : "Daily Finance Cost ÷ Km/Day"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Gauge className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">EMI Cost Per KM (Advanced)</p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {insights.emiCostPerKmAdvanced > 0
                  ? `₹ ${insights.emiCostPerKmAdvanced.toLocaleString("en-IN", { minimumFractionDigits: 4 })}`
                  : "—"}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
                {!record.truckRegistration
                  ? "No truck assigned to this EMI"
                  : runStats.monthlyAvg === 0
                  ? "No trip run history for this truck yet"
                  : "Daily Finance Cost ÷ Monthly Avg. Distance"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
