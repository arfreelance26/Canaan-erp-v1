import { useEffect, useRef, useState, useCallback } from "react";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { createPortal } from "react-dom";
import { Dialog } from "@/components/ui/Dialog";
import { TrendingUp, Droplets, Route, ArrowRight, ArrowDownRight, ArrowUpRight, IndianRupee, Pencil, X } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { FuelLog, FuelStats } from "@/types/fuel-log";
import { fuelLogsApi, editApprovalsApi } from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { useAuth } from "@/context/AuthContext";
import { showSuccess, showError } from "@/lib/swal";


// ---------------------------------------------------------------------------
// Edit fuel log dialog
// Admin  → saves directly via PUT; changes apply immediately
// Non-admin → submits an edit-approval request for Admin review
// ---------------------------------------------------------------------------

type EditedPatch = {
  date: string; odometer: string; litres: string;
  pricePerLitre: string; totalCost: string; fuelStation: string | null;
};

function EditFuelLogDialog({
  log,
  truck,
  isAdmin,
  onClose,
  onSaved,
}: {
  log: FuelLog;
  truck: Truck;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (patch?: EditedPatch) => void;
}) {
  const [date, setDate]           = useState(log.date);
  const [odometer, setOdometer]   = useState(log.odometer);
  const [litres, setLitres]       = useState(log.litres);
  const [pricePerL, setPricePerL] = useState(log.pricePerLitre);
  const [station, setStation]     = useState(log.fuelStation ?? "");
  const [reason, setReason]       = useState("");
  const [saving, setSaving]       = useState(false);

  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  const computedTotal = (Number(litres) * Number(pricePerL)).toFixed(2);

  async function handleSave() {
    if (!date || !odometer || !litres || !pricePerL) return;
    if (!isAdmin && !reason.trim()) return;
    setSaving(true);
    try {
      if (isAdmin) {
        await fuelLogsApi.updateFuelLog(log.id, {
          date,
          odometer,
          litres,
          pricePerLitre: pricePerL,
          totalCost: computedTotal,
          fuelStation: station.trim() || null,
          version: log.version,
        });
        showSuccess("Fuel log updated.");
        onSaved({
          date,
          odometer: String(Number(odometer)),
          litres: String(Number(litres)),
          pricePerLitre: String(Number(pricePerL)),
          totalCost: computedTotal,
          fuelStation: station.trim() || null,
        });
      } else {
        const resourceName = `Fuel Log — ${truck.registrationNumber} · ${formatDate(log.date)} · ${Number(log.litres).toFixed(1)} L`;
        await editApprovalsApi.create({
          resourceType: "FuelLog",
          resourceId: parseInt(log.id),
          resourceName,
          action: "Edit",
          reason: reason.trim(),
          proposedChanges: {
            date,
            odometer: Number(odometer),
            litres: Number(litres),
            price_per_litre: Number(pricePerL),
            total_cost: Number(computedTotal),
            fuel_station: station.trim() || null,
          },
        });
        showSuccess("Edit request submitted. Awaiting Admin approval.");
        onSaved();
      }
      onClose();
    } catch (err: any) {
      showError(err?.message ?? "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-blue-50 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Pencil className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Edit Fuel Log</p>
              <p className="text-[11px] text-gray-500">
                {isAdmin ? "Changes apply immediately" : "Requires Admin approval"}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Log summary chip */}
        <div className="bg-gray-50 border-b border-gray-100 px-5 py-2.5">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
            <span><span className="text-gray-400">Truck </span>{truck.truckId}</span>
            <span><span className="text-gray-400">Original date </span>{formatDate(log.date)}</span>
            <span><span className="text-gray-400">Original odo </span>{Number(log.odometer).toLocaleString()} km</span>
          </div>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          {/* Fields grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Date <span className="text-red-500">*</span></label>
              <input ref={firstRef} type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Odometer (km) <span className="text-red-500">*</span></label>
              <input type="number" value={odometer} onChange={e => setOdometer(e.target.value)} className={inputCls} min={0} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Litres <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" value={litres} onChange={e => setLitres(e.target.value)} className={inputCls} min={0} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Price / Litre (₹) <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" value={pricePerL} onChange={e => setPricePerL(e.target.value)} className={inputCls} min={0} />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Fuel Station</label>
              <input type="text" value={station} onChange={e => setStation(e.target.value)} placeholder="Optional" className={inputCls} />
            </div>
          </div>

          {/* Computed total preview */}
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
            Computed total: <span className="font-bold">₹{computedTotal}</span>
            <span className="ml-2 text-blue-500 text-xs">(litres × price/L)</span>
          </div>

          {/* Reason — only required for non-admin */}
          {!isAdmin && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Reason for edit <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Explain why this record needs to be changed…"
                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder-gray-400"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!date || !odometer || !litres || !pricePerL || (!isAdmin && !reason.trim()) || saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : isAdmin ? "Save Changes" : "Submit Request"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ title, value, icon: Icon, trend, subtitle }: any) {
  return (
    <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
        <Icon className="w-4 h-4 text-blue-500" />
        {title}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        {trend !== undefined && (
          <span className={`text-xs font-medium flex items-center ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

type FuelHistoryViewDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
};

// ---------------------------------------------------------------------------
// Recompute FuelStats from a logs array (used for instant optimistic updates)
// ---------------------------------------------------------------------------

// Modified Z-score outlier filter (MAD-based) — mirrors backend _iqr_filter.
// Robust for small datasets where standard IQR fences are distorted by the outlier.
// Threshold 3.5 = Iglewicz-Hoaglin standard recommendation.
function _iqrFilter(intervals: { distance: number; litres: number; mileage: number }[]) {
  if (intervals.length < 4) return intervals;
  const mileages = intervals.map((r) => r.mileage).sort((a, b) => a - b);
  if (mileages.length < 4) return intervals;

  const n = mileages.length;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? (mileages[mid - 1] + mileages[mid]) / 2 : mileages[mid];

  const absDevs = mileages.map((m) => Math.abs(m - median)).sort((a, b) => a - b);
  const mad = n % 2 === 0 ? (absDevs[mid - 1] + absDevs[mid]) / 2 : absDevs[mid];

  if (mad === 0) return intervals;

  const threshold = 3.5;
  return intervals.filter((r) => (0.6745 * Math.abs(r.mileage - median)) / mad <= threshold);
}

function computeStatsFromLogs(logsArr: FuelLog[]): FuelStats {
  const sorted = [...logsArr].sort((a, b) => Number(a.odometer) - Number(b.odometer));

  const rawIntervals: { distance: number; litres: number; mileage: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const dist   = Math.max(Number(sorted[i].odometer) - Number(sorted[i - 1].odometer), 0);
    const litres = Number(sorted[i].litres);
    if (dist > 0 && litres > 0) rawIntervals.push({ distance: dist, litres, mileage: dist / litres });
  }

  // IQR outlier removal — mirrors backend _iqr_filter
  const intervals = _iqrFilter(rawIntervals);

  const totalDistance = intervals.reduce((s, r) => s + r.distance, 0);
  const totalFuel     = intervals.reduce((s, r) => s + r.litres, 0);
  const avgMileage    = totalFuel > 0 ? totalDistance / totalFuel : 0;
  const mileages      = intervals.map((r) => r.mileage);
  const lastMileage   = mileages.at(-1) ?? 0;
  const bestMileage   = mileages.length ? Math.max(...mileages) : 0;
  const worstMileage  = mileages.length ? Math.min(...mileages) : 0;
  const trendPct      = avgMileage > 0 && lastMileage > 0
    ? ((lastMileage - avgMileage) / avgMileage) * 100
    : 0;

  return {
    totalDistance:   String(totalDistance),
    totalFuel:       String(totalFuel),
    averageMileage:  String(avgMileage),
    lastMileage:     String(lastMileage),
    bestMileage:     String(bestMileage),
    worstMileage:    String(worstMileage),
    trendPercentage: String(trendPct),
    costPerKm:       "0",
  };
}

// Recompute distance/mileage for every log based on sorted odometer diffs,
// then return the array in its ORIGINAL order (preserving display sequence).
function resequenceWithDistances(logsArr: FuelLog[]): FuelLog[] {
  const sorted = [...logsArr].sort((a, b) => Number(a.odometer) - Number(b.odometer));
  const distMap: Record<string, { distance: number; mileage: number }> = {};
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      distMap[sorted[i].id] = { distance: 0, mileage: 0 };
    } else {
      const dist = Math.max(Number(sorted[i].odometer) - Number(sorted[i - 1].odometer), 0);
      const litres = Number(sorted[i].litres);
      distMap[sorted[i].id] = {
        distance: dist,
        mileage: dist > 0 && litres > 0 ? dist / litres : 0,
      };
    }
  }
  return logsArr.map((l) => ({
    ...l,
    distance: String(distMap[l.id]?.distance ?? 0),
    mileage:  String(distMap[l.id]?.mileage  ?? 0),
  }));
}

export function FuelHistoryViewDialog({ open, onClose, truck }: FuelHistoryViewDialogProps) {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";

  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [stats, setStats] = useState<FuelStats | null>(null);
  const [baseCostPerLitre, setBaseCostPerLitre] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [editLog, setEditLog] = useState<FuelLog | null>(null);

  // Initial load — shows spinner
  function loadData() {
    if (!truck) return;
    setLoading(true);
    Promise.all([
      fuelLogsApi.listFuelLogs(truck.id),
      fuelLogsApi.getFuelStats(truck.id),
      fuelLogsApi.getBaseConfig(),
    ])
      .then(([logsData, statsData, baseConfig]) => {
        setLogs(logsData);
        setStats(statsData);
        setBaseCostPerLitre(baseConfig.cost_per_litre ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  // Background sync — no spinner, used after mutations and WebSocket events
  const syncData = useCallback(() => {
    if (!truck) return;
    Promise.all([
      fuelLogsApi.listFuelLogs(truck.id),
      fuelLogsApi.getFuelStats(truck.id),
    ])
      .then(([logsData, statsData]) => {
        setLogs(logsData);
        setStats(statsData);
      })
      .catch(() => {});
  }, [truck]);

  useEffect(() => {
    if (open && truck) loadData();
  }, [open, truck]);

  // Refresh stats when any fuel log changes elsewhere (new entry, WS push, etc.)
  useWebSocketEvent("fuel_updated", () => { if (open) syncData(); });

  // Called by EditFuelLogDialog on save:
  // - patch present  → admin saved directly; optimistically update logs + stats
  // - patch absent   → non-admin submitted a request; background-sync only
  function handleEditSaved(logId: string, patch?: EditedPatch) {
    if (patch) {
      const patchedLogs = logs.map((l) =>
        l.id === logId
          ? { ...l, date: patch.date, odometer: patch.odometer, litres: patch.litres,
              pricePerLitre: patch.pricePerLitre, totalCost: patch.totalCost, fuelStation: patch.fuelStation }
          : l
      );
      // Recompute distance/mileage for EVERY row (editing odo shifts all subsequent intervals)
      const resequenced = resequenceWithDistances(patchedLogs);
      setLogs(resequenced);
      setStats(computeStatsFromLogs(resequenced));
    }
    syncData();
  }


  if (!truck) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Truck&apos;s Fuel History">
      <div className="mb-6">
        <p className="text-sm text-gray-500">
          {truck.registrationNumber} • {truck.modelName} • {truck.manufacturer}
        </p>
      </div>

      <div className="overflow-y-auto max-h-[70vh] space-y-6">
        {loading ? (
          <div className="py-20 text-center text-gray-500">Loading fuel history...</div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <StatCard
                title="Current Interval"
                value={`${Number(stats?.lastMileage).toFixed(2)} km/L`}
                icon={Route}
                trend={Number(stats?.trendPercentage)}
                subtitle="Latest refill"
              />
              <StatCard
                title="Lifetime Average"
                value={`${Number(stats?.averageMileage).toFixed(2)} km/L`}
                icon={TrendingUp}
                subtitle={`Total: ${Number(stats?.totalDistance).toLocaleString()} km`}
              />
              {(() => {
                const avg = Number(stats?.averageMileage);
                const costPerKm =
                  avg > 0 && baseCostPerLitre != null
                    ? baseCostPerLitre / avg
                    : null;
                return (
                  <StatCard
                    title="Cost Per Kilometer"
                    value={costPerKm != null ? `₹${costPerKm.toFixed(4)}` : "—"}
                    icon={IndianRupee}
                    subtitle="Fuel Price per Litre ÷ Mileage"
                  />
                );
              })()}
              <StatCard
                title="Best Ever"
                value={`${Number(stats?.bestMileage).toFixed(2)} km/L`}
                icon={ArrowUpRight}
              />
              <StatCard
                title="Worst Ever"
                value={`${Number(stats?.worstMileage).toFixed(2)} km/L`}
                icon={ArrowDownRight}
              />
              <StatCard
                title="Base Fuel Cost"
                value={baseCostPerLitre != null ? `₹${Number(baseCostPerLitre).toFixed(2)}/L` : "Not set"}
                icon={Droplets}
                subtitle="Configured base litre rate"
              />
              {(() => {
                const avg = Number(stats?.averageMileage);
                const fuelPerKm = avg > 0 ? (1 / avg) : null;
                return (
                  <StatCard
                    title="Fuel Amount For a KM"
                    value={fuelPerKm != null ? `${fuelPerKm.toFixed(4)} L/km` : "—"}
                    icon={Droplets}
                    subtitle="Formula: 1 ÷ Lifetime Average (km/L)"
                  />
                );
              })()}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="font-semibold text-gray-900">Calculated Mileage History</h3>
              </div>
              <div className="overflow-auto max-h-72">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-100">
                      <th className="px-6 py-3 font-medium">Refuel Date</th>
                      <th className="px-6 py-3 font-medium text-right">Odometer</th>
                      <th className="px-6 py-3 font-medium text-right">Fuel Filled</th>
                      <th className="px-6 py-3 font-medium text-right">Distance</th>
                      <th className="px-6 py-3 font-medium text-right">Interval Mileage</th>
                      <th className="px-6 py-3 font-medium">User Modified</th>
                      <th className="px-6 py-3 font-medium">Source</th>
                      <th className="px-6 py-3 font-medium">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                          No fuel logs found for this truck.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => {
                        const sourceLabel = log.source ?? (log.loggedBy?.startsWith("trip:") ? "Trip Sheet" : "Manual Log");
                        const isTripSheet = sourceLabel.startsWith("Trip Sheet");
                        return (
                          <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 text-gray-900">{formatDate(log.date)}</td>
                            <td className="px-6 py-4 text-right text-gray-600 font-medium">
                              {Number(log.odometer).toLocaleString()} km
                            </td>
                            <td className="px-6 py-4 text-right text-gray-600">
                              <span className="inline-flex items-center gap-1">
                                <Droplets className="w-3 h-3 text-blue-400" />
                                {Number(log.litres).toFixed(1)} L
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right text-gray-600">
                              {Number(log.distance) > 0 ? (
                                <span className="inline-flex items-center gap-1">
                                  <ArrowRight className="w-3 h-3 text-gray-400" />
                                  {Number(log.distance).toLocaleString()} km
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">Baseline</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {Number(log.mileage) > 0 ? (
                                <span className="font-semibold text-gray-900">
                                  {Number(log.mileage).toFixed(2)} km/L
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-gray-600">
                              {log.enteredByName ?? <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${isTripSheet ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                                {sourceLabel}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <button
                                type="button"
                                title={isAdmin ? "Edit" : "Request edit"}
                                onClick={() => setEditLog(log)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 hover:bg-blue-50 hover:text-blue-500 transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {editLog && truck && (
        <EditFuelLogDialog
          log={editLog}
          truck={truck}
          isAdmin={isAdmin}
          onClose={() => setEditLog(null)}
          onSaved={(patch) => handleEditSaved(editLog.id, patch)}
        />
      )}
    </Dialog>
  );
}
