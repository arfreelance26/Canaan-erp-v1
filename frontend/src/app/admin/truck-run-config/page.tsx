"use client";

import { useEffect, useState } from "react";
import { trucksApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Truck as TruckIcon, LayoutGrid, Settings2, X, Info } from "lucide-react";

export const RUN_CONFIG_STORAGE_KEY = "erp_truck_run_config";

function fmtReg(reg: string) {
  return reg.replace(/^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{1,4})$/, "$1 $2 $3 $4");
}

function groupByTyreLayout(trucks: Truck[]): Map<string, Truck[]> {
  const map = new Map<string, Truck[]>();
  for (const truck of trucks) {
    const key = truck.tyreLayout || "Unspecified";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(truck);
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

type RunConfig = { month: string; day: string };

function ConfigDialog({
  layouts,
  onClose,
}: {
  layouts: string[];
  onClose: () => void;
}) {
  const [config, setConfig] = useState<Record<string, RunConfig>>(() => {
    let saved: Record<string, RunConfig> = {};
    try { saved = JSON.parse(localStorage.getItem(RUN_CONFIG_STORAGE_KEY) ?? "{}"); } catch {}
    return Object.fromEntries(layouts.map((l) => [l, saved[l] ?? { month: "", day: "" }]));
  });
  const [saving, setSaving] = useState(false);

  // Load persisted config from DB on open
  useEffect(() => {
    trucksApi.getRunConfig().then((rows: { tyre_layout: string; km_per_month: string | null; km_per_day: string | null }[]) => {
      if (!rows.length) return;
      const fromDb: Record<string, RunConfig> = {};
      for (const r of rows) {
        fromDb[r.tyre_layout] = {
          month: r.km_per_month ? String(parseFloat(r.km_per_month)) : "",
          day:   r.km_per_day   ? String(parseFloat(r.km_per_day))   : "",
        };
      }
      setConfig((prev) => {
        const merged = { ...prev };
        for (const layout of layouts) {
          if (fromDb[layout]) merged[layout] = fromDb[layout];
        }
        return merged;
      });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onMonthChange(layout: string, value: string) {
    const month = value;
    const dayNum = value !== "" && !isNaN(Number(value)) ? (Number(value) / 26).toFixed(2) : "";
    setConfig((prev) => ({ ...prev, [layout]: { month, day: dayNum } }));
  }

  function onDayChange(layout: string, value: string) {
    const day = value;
    const monthNum = value !== "" && !isNaN(Number(value)) ? (Number(value) * 26).toFixed(2) : "";
    setConfig((prev) => ({ ...prev, [layout]: { month: monthNum, day } }));
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Settings2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Set Run Configuration</h2>
              <p className="text-xs text-gray-400">Define monthly and daily km targets per tyre layout</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Formula note card */}
          <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <div className="text-xs text-blue-800 space-y-1">
              <p className="font-bold">Formula Reference</p>
              <p><span className="font-semibold">Km/Day</span> = Km/Month ÷ 26</p>
              <p><span className="font-semibold">Km/Month</span> = Km/Day × 26</p>
              <p className="text-blue-500 mt-1">Based on 26 effective working days per month. Editing either field auto-calculates the other.</p>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_180px_180px] items-center gap-4 px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tyre Layout</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Km / Month</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Km / Day</span>
          </div>

          {/* Per-layout rows */}
          <div className="flex flex-col gap-3">
            {layouts.map((layout) => (
              <div
                key={layout}
                className="grid grid-cols-[1fr_180px_180px] items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
              >
                {/* Layout name */}
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{layout}</span>
                </div>

                {/* Km / Month */}
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 6500"
                    value={config[layout]?.month ?? ""}
                    onChange={(e) => onMonthChange(layout, e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-10 text-sm font-semibold text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">km</span>
                </div>

                {/* Km / Day */}
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 250"
                    value={config[layout]?.day ?? ""}
                    onChange={(e) => onDayChange(layout, e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-10 text-sm font-semibold text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">km</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const apiPayload = layouts.map((l) => ({
                tyre_layout:   l,
                km_per_month:  config[l]?.month !== "" ? Number(config[l].month) : null,
                km_per_day:    config[l]?.day   !== "" ? Number(config[l].day)   : null,
              }));
              try {
                await trucksApi.saveRunConfig(apiPayload);
              } catch {}
              localStorage.setItem(RUN_CONFIG_STORAGE_KEY, JSON.stringify(config));
              setSaving(false);
              onClose();
            }}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save Configuration"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TruckCard({ truck }: { truck: Truck }) {
  return (
    <div className="flex items-center gap-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="w-1 self-stretch shrink-0 bg-blue-500" />
      <div className="flex shrink-0 items-center justify-center bg-blue-50 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
          <TruckIcon className="h-4 w-4" />
        </div>
      </div>
      <div className="flex shrink-0 flex-col justify-center border-r border-gray-100 px-5 py-3">
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Registration No.</span>
        <span className="mt-0.5 text-sm font-bold tracking-wide text-gray-900">{fmtReg(truck.registrationNumber)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Manufacturer</span>
          <p className="text-xs font-semibold text-gray-700">{truck.manufacturer || "—"}</p>
        </div>
        <div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Model</span>
          <p className="text-xs font-semibold text-gray-700">{truck.modelName || "—"}</p>
        </div>
        <div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Type</span>
          <p className="text-xs font-semibold text-gray-700">{truck.truckType || "—"}</p>
        </div>
        <div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Branch</span>
          <p className="text-xs font-semibold text-gray-700">{truck.branchRegisteredTo || "—"}</p>
        </div>
      </div>
    </div>
  );
}


export default function TruckRunConfigPage() {
  const [trucks, setTrucks]                     = useState<Truck[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [showConfig, setShowConfig]     = useState(false);
  const [runConfigMap, setRunConfigMap] = useState<Record<string, { month: string; day: string }>>({});

  useEffect(() => {
    trucksApi.list().then(setTrucks).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    trucksApi.getRunConfig().then((rows: { tyre_layout: string; km_per_month: string | null; km_per_day: string | null }[]) => {
      const map: Record<string, { month: string; day: string }> = {};
      for (const r of rows) {
        map[r.tyre_layout] = {
          month: r.km_per_month ? String(parseFloat(r.km_per_month)) : "",
          day:   r.km_per_day   ? String(parseFloat(r.km_per_day))   : "",
        };
      }
      setRunConfigMap(map);
    }).catch(() => {});
  }, []);

  if (loading) return <PageSkeleton hasButton={false} hasSearch={false} columns={1} />;

  const groups  = groupByTyreLayout(trucks);
  const layouts = [...groups.keys()];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Truck Run Configuration</h1>
          <p className="mt-1 text-sm text-gray-500">
            {trucks.length} truck{trucks.length !== 1 ? "s" : ""} across {groups.size} tyre layout{groups.size !== 1 ? "s" : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowConfig(true)}
          className="mt-1 flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Settings2 className="h-4 w-4" />
          Set Run Configuration
        </button>
      </div>

      {trucks.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
          No trucks found.
        </div>
      )}

      <div className="flex flex-col gap-8">
        {[...groups.entries()].map(([layout, layoutTrucks]) => (
          <div key={layout}>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <LayoutGrid className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-sm font-bold text-gray-800">{layout}</h2>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                {layoutTrucks.length} truck{layoutTrucks.length !== 1 ? "s" : ""}
              </span>
              <div className="flex-1 border-t border-gray-200" />

              {/* Run config stats */}
              {runConfigMap[layout]?.month ? (
                <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
                  {Number(runConfigMap[layout].month).toLocaleString("en-IN")} km
                  <span className="font-normal text-slate-400">/ mo</span>
                </span>
              ) : null}
              {runConfigMap[layout]?.day ? (
                <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
                  {Number(runConfigMap[layout].day).toLocaleString("en-IN")} km
                  <span className="font-normal text-slate-400">/ day</span>
                </span>
              ) : null}

            </div>
            <div className="flex flex-col gap-2">
              {layoutTrucks.map((truck) => (
                <TruckCard key={truck.id} truck={truck} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {showConfig && (
        <ConfigDialog
          layouts={layouts}
          onClose={() => {
            setShowConfig(false);
            trucksApi.getRunConfig().then((rows: { tyre_layout: string; km_per_month: string | null; km_per_day: string | null }[]) => {
              const map: Record<string, { month: string; day: string }> = {};
              for (const r of rows) {
                map[r.tyre_layout] = {
                  month: r.km_per_month ? String(parseFloat(r.km_per_month)) : "",
                  day:   r.km_per_day   ? String(parseFloat(r.km_per_day))   : "",
                };
              }
              setRunConfigMap(map);
            }).catch(() => {});
          }}
        />
      )}

    </div>
  );
}
