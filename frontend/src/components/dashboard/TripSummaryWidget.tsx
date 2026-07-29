"use client";

import { useEffect, useState } from "react";
import { Navigation, CheckCircle2, FileWarning, Activity } from "lucide-react";
import { dashboardApi, type TripsOverview } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

function Stat({
  icon: Icon,
  label,
  value,
  iconCls,
  valueCls,
  labelCls,
  divider,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  iconCls: string;
  valueCls: string;
  labelCls: string;
  divider?: boolean;
}) {
  return (
    <>
      {divider && <div className="w-px self-stretch bg-gray-200/80" />}
      <div className="flex flex-col items-center gap-1 px-5 py-3">
        <div className={`flex items-center gap-1.5 ${iconCls}`}>
          <Icon className="h-3.5 w-3.5" />
          <span className={`text-[10px] font-bold uppercase tracking-widest ${labelCls}`}>{label}</span>
        </div>
        <p className={`text-3xl font-extrabold leading-none tabular-nums ${valueCls}`}>{value}</p>
      </div>
    </>
  );
}

export function TripSummaryWidget() {
  const [data, setData] = useState<TripsOverview | null>(null);

  const refresh = () => dashboardApi.tripsOverview().then(setData).catch(() => {});

  useEffect(() => { refresh(); }, []);
  useAutoRefresh(refresh, 30000);
  useWebSocketEvent("trip_created",  refresh);
  useWebSocketEvent("trip_assigned", refresh);
  useWebSocketEvent("trip_updated",  refresh);
  useWebSocketEvent("trip_closed",   refresh);

  const current  = data?.currentTrips.length          ?? "—";
  const complete = data?.completedTrips.length         ?? "—";
  const pending  = data?.pendingInvoiceTrips.length    ?? "—";

  return (
    <div className="flex shrink-0 items-stretch overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-md">
      {/* Live pill */}
      <div className="flex flex-col items-center justify-center gap-1.5 border-r border-gray-200 bg-gray-50 px-3 py-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <Activity className="h-3.5 w-3.5 text-gray-400" />
        <p className="[writing-mode:vertical-rl] rotate-180 text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400 leading-none">
          Live
        </p>
      </div>

      {/* Stats */}
      <Stat icon={Navigation}   label="Current"          value={current}  iconCls="text-blue-400"    valueCls="text-blue-700"    labelCls="text-blue-400" />
      <Stat icon={CheckCircle2} label="Completed"         value={complete} iconCls="text-emerald-400" valueCls="text-emerald-700" labelCls="text-emerald-400" divider />
      <Stat icon={FileWarning}  label="Pending Invoice"   value={pending}  iconCls="text-amber-400"   valueCls="text-amber-700"   labelCls="text-amber-400"  divider />
    </div>
  );
}
