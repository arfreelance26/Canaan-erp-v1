"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { maintenanceApi, type TruckStatusData } from "@/lib/api";
import type { Truck } from "@/types/truck";
import {
  AlertTriangle, CheckCircle2, TrendingUp, TrendingDown,
  Minus, Wrench, CalendarDays, IndianRupee, Gauge, Loader2,
} from "lucide-react";

type HealthStatus = "Bad" | "Average" | "Good" | "Great";

function fmt(v: number) {
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const HEALTH_CONFIG: Record<HealthStatus, {
  ring: string; bg: string; text: string; sub: string;
  icon: React.ReactNode; bar: string;
}> = {
  Great:   { ring: "border-emerald-200", bg: "bg-emerald-50",  text: "text-emerald-700", sub: "text-emerald-500", icon: <TrendingUp  className="h-6 w-6" />, bar: "bg-emerald-500" },
  Good:    { ring: "border-blue-200",    bg: "bg-blue-50",     text: "text-blue-700",    sub: "text-blue-500",   icon: <CheckCircle2 className="h-6 w-6" />, bar: "bg-blue-500"    },
  Average: { ring: "border-amber-200",   bg: "bg-amber-50",    text: "text-amber-700",   sub: "text-amber-500",  icon: <Minus        className="h-6 w-6" />, bar: "bg-amber-500"   },
  Bad:     { ring: "border-red-200",     bg: "bg-red-50",      text: "text-red-700",     sub: "text-red-500",    icon: <TrendingDown className="h-6 w-6" />, bar: "bg-red-500"     },
};

type Props = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
};

export function TruckStatusDialog({ open, onClose, truck }: Props) {
  const [data, setData] = useState<TruckStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !truck) return;
    setData(null);
    setError(null);
    setLoading(true);
    maintenanceApi
      .getTruckStatus(truck.id)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load truck status"))
      .finally(() => setLoading(false));
  }, [open, truck]);

  if (!truck) return null;

  const healthStatus = (data?.healthStatus ?? "Average") as HealthStatus;
  const cfg = HEALTH_CONFIG[healthStatus];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Truck Status — ${truck.registrationNumber}`}
    >
      <div className="flex flex-col gap-5">

        {/* Truck identity strip */}
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <Gauge className="h-5 w-5 text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">{truck.registrationNumber}</p>
            <p className="text-xs text-gray-400">
              {truck.truckId && <span className="mr-3">{truck.truckId}</span>}
              Odometer: {Number(data?.odometer ?? truck.odometer).toLocaleString()} km
            </p>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading truck status…</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Data loaded */}
        {data && !loading && (
          <>
            {/* ── Health Status card ─────────────────────────────────────────── */}
            <div className={`rounded-2xl border ${cfg.ring} ${cfg.bg} px-5 py-4`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                Health Status
              </p>
              <div className="flex items-center gap-4 mb-4">
                <div className={`flex items-center gap-2 ${cfg.text}`}>
                  {cfg.icon}
                  <span className="text-3xl font-extrabold tracking-tight">{data.healthStatus}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-semibold ${cfg.sub}`}>Score</span>
                    <span className={`text-sm font-bold ${cfg.text}`}>{data.healthScore}/100</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200">
                    <div
                      className={`h-2 rounded-full ${cfg.bar} transition-all duration-500`}
                      style={{ width: `${data.healthScore}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Overdue/upcoming chips */}
              <div className="flex flex-wrap gap-2">
                {data.overdueCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-white/70 border border-red-200 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {data.overdueCount} overdue maintenance item{data.overdueCount > 1 ? "s" : ""}
                  </span>
                )}
                {data.upcomingCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-white/70 border border-amber-200 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
                    <Wrench className="h-3 w-3 shrink-0" />
                    {data.upcomingCount} service item{data.upcomingCount > 1 ? "s" : ""} due soon
                  </span>
                )}
                {data.daysSinceLastService != null ? (
                  <span className={`flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-medium ${
                    data.daysSinceLastService > 180
                      ? "border border-red-200 text-red-700"
                      : data.daysSinceLastService > 90
                        ? "border border-amber-200 text-amber-700"
                        : "border border-emerald-200 text-emerald-700"
                  }`}>
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    {data.daysSinceLastService > 90
                      ? `Last serviced ${data.daysSinceLastService} days ago`
                      : `Recently serviced (${data.daysSinceLastService} days ago)`}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-white/70 border border-red-200 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> No maintenance records on file
                  </span>
                )}
                {data.overdueCount === 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-white/70 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                    <CheckCircle2 className="h-3 w-3 shrink-0" /> No overdue maintenance items
                  </span>
                )}
              </div>
            </div>

            {/* ── Cost cards ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <IndianRupee className="h-4 w-4 text-blue-400" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                    Avg Monthly Maintenance Cost
                  </p>
                </div>
                <p className="text-2xl font-bold text-blue-700">{fmt(data.avgMonthlyCost)}</p>
                <p className="mt-1 text-xs text-blue-400">
                  Based on {fmt(data.totalYearlyCost)} total over {data.recordCountYearly} record{data.recordCountYearly !== 1 ? "s" : ""} in the past 12 months ÷ 12
                </p>
              </div>

              <div className="rounded-xl border border-purple-100 bg-purple-50 px-5 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="h-4 w-4 text-purple-400" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-purple-400">
                    Avg Daily Maintenance Cost
                  </p>
                </div>
                <p className="text-2xl font-bold text-purple-700">{fmt(data.avgDailyCost)}</p>
                <p className="mt-1 text-xs text-purple-400">
                  Monthly avg ÷ 26 working days
                </p>
              </div>
            </div>

            {/* ── Stats summary ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-gray-100 bg-white px-3 py-3">
                <p className="text-xl font-bold text-red-600">{data.overdueCount}</p>
                <p className="mt-0.5 text-[11px] font-medium text-gray-400">Overdue Items</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white px-3 py-3">
                <p className="text-xl font-bold text-amber-600">{data.upcomingCount}</p>
                <p className="mt-0.5 text-[11px] font-medium text-gray-400">Due Soon</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white px-3 py-3">
                <p className="text-xl font-bold text-blue-600">{data.recordCountYearly}</p>
                <p className="mt-0.5 text-[11px] font-medium text-gray-400">Records (1 yr)</p>
              </div>
            </div>

            {/* ── Overdue items detail list ────────────────────────────────────── */}
            {data.overdueCount > 0 && (
              <div className="rounded-xl border border-red-100 bg-red-50/60 px-4 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Overdue Items
                </p>
                <div className="flex flex-col gap-1.5">
                  {data.overdueItems.map((s, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-white/80 border border-red-100 px-3 py-2">
                      <div>
                        <p className="text-xs font-semibold text-red-700">{s.item}</p>
                        <p className="text-[11px] text-red-400">{s.category}</p>
                      </div>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                        {Math.abs(s.remainingKm).toLocaleString()} km overdue
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Due-soon items detail list ───────────────────────────────────── */}
            {data.upcomingCount > 0 && (
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-500 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Due Soon
                </p>
                <div className="flex flex-col gap-1.5">
                  {data.upcomingItems.map((s, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-white/80 border border-amber-100 px-3 py-2">
                      <div>
                        <p className="text-xs font-semibold text-amber-700">{s.item}</p>
                        <p className="text-[11px] text-amber-400">{s.category}</p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        {s.remainingKm.toLocaleString()} km left
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}
