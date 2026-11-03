"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { trucksApi, type TruckRunConfigEditEventRow } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { RiTruckLine as TruckIcon, RiLayoutGridLine as LayoutGrid, RiSettings3Line as Settings2, RiCloseLine as X, RiInformationLine as Info, RiDashboard3Line as Gauge, RiHistoryLine as History, RiSave3Line as Save } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { Dialog } from "@/components/ui/Dialog";
import { PillSearch } from "@/components/ui/PillSearch";
import { formatDateTime } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-background-primary-default shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-separator-border bg-fill-1 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-solid text-on-solid">
              <Settings2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-headline-semibold text-text-primary">Set Run Configuration</h2>
              <p className="text-xs text-text-tertiary">Define monthly and daily km targets per tyre layout</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-fill-3 hover:text-text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Formula note card */}
          <div className="flex gap-3 rounded-xl border border-accent-border bg-accent-surface px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
            <div className="text-xs text-accent-text-strong space-y-1">
              <p className="font-semibold">Formula Reference</p>
              <p><span className="font-semibold">Km/Day</span> = Km/Month ÷ 26</p>
              <p><span className="font-semibold">Km/Month</span> = Km/Day × 26</p>
              <p className="text-accent-text mt-1">Based on 26 effective working days per month. Editing either field auto-calculates the other.</p>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_180px_180px] items-center gap-4 px-1">
            <span className="text-caption-2-semibold text-text-tertiary">Tyre Layout</span>
            <span className="text-caption-2-semibold text-text-tertiary">Km / Month</span>
            <span className="text-caption-2-semibold text-text-tertiary">Km / Day</span>
          </div>

          {/* Per-layout rows */}
          <div className="flex flex-col gap-3">
            {layouts.map((layout) => (
              <div
                key={layout}
                className="grid grid-cols-[1fr_180px_180px] items-center gap-4 rounded-xl border border-separator-border bg-fill-1 px-4 py-3"
              >
                {/* Layout name */}
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-surface-strong text-accent-text">
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-body-semibold text-text-primary">{layout}</span>
                </div>

                {/* Km / Month */}
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 6500"
                    value={config[layout]?.month ?? ""}
                    onChange={(e) => onMonthChange(layout, e.target.value)}
                    className="w-full rounded-lg border border-separator-border bg-background-primary-default py-2 pl-3 pr-10 text-body-semibold text-text-primary outline-none focus:border-accent-border-strong focus:ring-2 focus:ring-accent-border transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption-2-semibold text-text-tertiary">km</span>
                </div>

                {/* Km / Day */}
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 250"
                    value={config[layout]?.day ?? ""}
                    onChange={(e) => onDayChange(layout, e.target.value)}
                    className="w-full rounded-lg border border-separator-border bg-background-primary-default py-2 pl-3 pr-10 text-body-semibold text-text-primary outline-none focus:border-accent-border-strong focus:ring-2 focus:ring-accent-border transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption-2-semibold text-text-tertiary">km</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-separator-border bg-fill-1 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 items-center whitespace-nowrap rounded-full border border-separator-border bg-background-primary-default px-6 text-body-medium text-text-secondary shadow-sm transition duration-300 hover:shadow-md"
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
            className="flex h-10 items-center whitespace-nowrap rounded-full bg-accent-solid px-6 text-body-semibold text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
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
    <div className="flex items-center gap-0 overflow-hidden rounded-xl border border-separator-border bg-background-primary-default shadow-sm transition-shadow hover:shadow-md">
      <div className="w-1 self-stretch shrink-0 bg-accent-solid" />
      <div className="flex shrink-0 items-center justify-center bg-accent-surface px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-solid text-on-solid shadow-sm">
          <TruckIcon className="h-4 w-4" />
        </div>
      </div>
      <div className="flex shrink-0 flex-col justify-center border-r border-separator-border px-5 py-3">
        <span className="text-[9px] font-semibold text-text-tertiary">Registration No.</span>
        <span className="mt-0.5 text-body-semibold text-text-primary">{fmtReg(truck.registrationNumber)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3">
        <div>
          <span className="text-[9px] font-semibold text-text-tertiary">Manufacturer</span>
          <p className="text-caption-1-semibold text-text-primary">{truck.manufacturer || "—"}</p>
        </div>
        <div>
          <span className="text-[9px] font-semibold text-text-tertiary">Model</span>
          <p className="text-caption-1-semibold text-text-primary">{truck.modelName || "—"}</p>
        </div>
        <div>
          <span className="text-[9px] font-semibold text-text-tertiary">Type</span>
          <p className="text-caption-1-semibold text-text-primary">{truck.truckType || "—"}</p>
        </div>
        <div>
          <span className="text-[9px] font-semibold text-text-tertiary">Branch</span>
          <p className="text-caption-1-semibold text-text-primary">{truck.branchRegisteredTo || "—"}</p>
        </div>
      </div>
    </div>
  );
}


export default function TruckRunConfigPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const { user } = useAuth();
  const [trucks, setTrucks]                     = useState<Truck[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [showConfig, setShowConfig]     = useState(false);
  const [runConfigMap, setRunConfigMap] = useState<Record<string, { month: string; day: string }>>({});
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<TruckRunConfigEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");
  // Matches a truck (ID, registration, model, make) or a tyre layout name.
  const [search, setSearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    trucksApi.listRunConfigEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

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

  if (user && user.softwareDesignation !== "Admin") return null;
  if (loading) return <PageSkeleton hasButton={false} hasSearch={false} columns={1} />;

  const groups  = groupByTyreLayout(trucks);
  const layouts = [...groups.keys()];

  const q = search.trim().toLowerCase();
  const visibleGroups: [string, Truck[]][] = [...groups.entries()]
    .map(([layout, layoutTrucks]): [string, Truck[]] => [
      layout,
      !q || layout.toLowerCase().includes(q)
        ? layoutTrucks
        : layoutTrucks.filter((t) =>
            [t.truckId, t.registrationNumber, t.modelName, t.manufacturer].some((v) => v?.toLowerCase().includes(q))
          ),
    ])
    .filter(([, layoutTrucks]) => layoutTrucks.length > 0);

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-success-border bg-success-surface text-success-text shadow-sm">
            <Gauge className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Truck Run Configuration</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              {trucks.length} truck{trucks.length !== 1 ? "s" : ""} across {groups.size} tyre layout{groups.size !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isAdmin && (
<button
            type="button"
            onClick={openEditHistory}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
          >
            <History className="h-4 w-4" />
            Edit History
          </button>
)}
          <button
            type="button"
            onClick={() => setShowConfig(true)}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md"
          >
            <Settings2 className="h-4 w-4" />
            Set Run Configuration
          </button>
        </div>
      </div>

      {trucks.length === 0 && (
        <EmptyState size="compact" illustration="logistics" title="No trucks found" />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trucks or tyre layouts..." value={search} onChange={setSearch} />
      </div>

      {trucks.length > 0 && visibleGroups.length === 0 && (
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-10 text-center text-sm text-text-tertiary">
          No results match &ldquo;{search}&rdquo;.
        </div>
      )}

      <div className="flex flex-col gap-8">
        {visibleGroups.map(([layout, layoutTrucks]) => (
          <div key={layout}>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-surface-strong text-accent-text">
                <LayoutGrid className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-body-semibold text-text-primary">{layout}</h2>
              <span className="rounded-full bg-accent-surface px-2 py-0.5 text-caption-2-semibold text-accent-text">
                {layoutTrucks.length} truck{layoutTrucks.length !== 1 ? "s" : ""}
              </span>
              <div className="flex-1 border-t border-separator-border" />

              {/* Run config stats */}
              {runConfigMap[layout]?.month ? (
                <span className="flex items-center gap-1 rounded-full border border-separator-border bg-fill-1 px-2.5 py-0.5 text-caption-2-semibold tabular-nums text-text-secondary">
                  {Number(runConfigMap[layout].month).toLocaleString("en-IN")} km
                  <span className="font-normal text-text-tertiary">/ mo</span>
                </span>
              ) : null}
              {runConfigMap[layout]?.day ? (
                <span className="flex items-center gap-1 rounded-full border border-separator-border bg-fill-1 px-2.5 py-0.5 text-caption-2-semibold tabular-nums text-text-secondary">
                  {Number(runConfigMap[layout].day).toLocaleString("en-IN")} km
                  <span className="font-normal text-text-tertiary">/ day</span>
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

      {/* Edit History — every "Save Configuration" click ever logged, in
          one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-lg"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch || ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => (
                      <tr key={ev.id}>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-2 py-0.5 text-caption-2-semibold text-warning-text">
                            <Save className="h-3 w-3" /> {ev.event}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {ev.actorName}
                          {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                      </tr>
                    )}
                  </PagedTbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
