import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Droplets, MapPin, IndianRupee, Gauge, TrendingUp, ArrowRight, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { AdBlueLogFormDialog } from "@/components/fleet/AdBlueLogFormDialog";
import type { Truck } from "@/types/truck";
import type { AdBlueLog } from "@/types/adblue-log";
import { adblueApi, adblueLogsApi, deletionApprovalsApi, editApprovalsApi, type AdBlueStats } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/format-date";
import { showSuccess, showError, confirmDelete } from "@/lib/swal";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";

// Modified Z-score outlier filter (MAD-based) — mirrors FuelHistoryViewDialog's
// _iqrFilter. Robust for small datasets where standard IQR fences are
// distorted by a single bad odometer entry. Threshold 3.5 = Iglewicz-Hoaglin
// standard recommendation.
function _madFilter(intervals: { distance: number; litres: number; rate: number }[]) {
  if (intervals.length < 4) return intervals;
  const rates = intervals.map((r) => r.rate).sort((a, b) => a - b);

  const n = rates.length;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? (rates[mid - 1] + rates[mid]) / 2 : rates[mid];

  const absDevs = rates.map((r) => Math.abs(r - median)).sort((a, b) => a - b);
  const mad = n % 2 === 0 ? (absDevs[mid - 1] + absDevs[mid]) / 2 : absDevs[mid];

  if (mad === 0) return intervals;

  const threshold = 3.5;
  return intervals.filter((r) => (0.6745 * Math.abs(r.rate - median)) / mad <= threshold);
}

type AdBlueHistoryViewDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
};

function StatCard({ title, value, icon: Icon, subtitle }: { title: string; value: string; icon: LucideIcon; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
        <Icon className="h-4 w-4 text-blue-500" />
        {title}
      </div>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
    </div>
  );
}

function logLabel(log: AdBlueLog, truck: Truck) {
  return `AdBlue Log — ${truck.registrationNumber} · ${formatDate(log.date)} · ${Number(log.litres).toFixed(2)} L`;
}

function DeleteRequestDialog({ log, truck, onClose, onSubmit }: {
  log: AdBlueLog;
  truck: Truck;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    await onSubmit(reason.trim());
    setSending(false);
  }

  return (
    <Dialog open onClose={onClose} title="Request AdBlue Log Deletion" className="sm:max-w-md md:max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{logLabel(log, truck)}</p>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Reason for deletion <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="block w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Explain why this log needs to be deleted…"
          />
          <p className="mt-1 text-xs text-gray-500">The log stays until an Admin approves this on Deletion Approvals.</p>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !reason.trim()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send Request"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function AdBlueHistoryViewDialog({ open, onClose, truck }: AdBlueHistoryViewDialogProps) {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [logs, setLogs] = useState<AdBlueLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editLog, setEditLog] = useState<AdBlueLog | null>(null);
  const [deleteRequestLog, setDeleteRequestLog] = useState<AdBlueLog | null>(null);
  // The figures the Running Cost Calculator and Profitability use, worked out
  // on the server: km per litre (like Fuel History's mileage) and AdBlue ₹/km
  // = the manufacturer's AdBlue price ÷ km per litre.
  const [serverStats, setServerStats] = useState<AdBlueStats | null>(null);

  const loadLogs = useCallback((showSpinner: boolean) => {
    if (!truck) return;
    if (showSpinner) setLoading(true);
    adblueApi.getAllStats().then((all) => setServerStats(all[truck.id] ?? null)).catch(() => setServerStats(null));
    adblueLogsApi.listLogs(truck.id)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [truck]);

  useEffect(() => {
    if (open && truck) loadLogs(true);
  }, [open, truck, loadLogs]);

  useWebSocketEvent("adblue_updated", () => { if (open) loadLogs(false); });

  async function handleEditSave(
    edited: Omit<AdBlueLog, "id" | "createdAt" | "enteredByName" | "version">,
    reason?: string,
  ): Promise<boolean> {
    if (!editLog || !truck) return false;
    try {
      if (isAdmin) {
        await adblueLogsApi.updateLog(editLog.id, { ...edited, version: editLog.version });
        showSuccess("AdBlue log updated.");
        loadLogs(false);
      } else {
        await editApprovalsApi.create({
          resourceType: "AdBlueLog",
          resourceId: parseInt(editLog.id),
          resourceName: logLabel(editLog, truck),
          action: "Edit",
          reason: reason ?? "",
          proposedChanges: {
            date: edited.date,
            odometer: Number(edited.odometer),
            litres: Number(edited.litres),
            price_per_litre: Number(edited.pricePerLitre),
            total_cost: Number(edited.totalCost),
            supplier: edited.fillingLocation,
          },
        });
        showSuccess("Edit request submitted. Awaiting approval.");
      }
      setEditLog(null);
      return true;
    } catch (e: unknown) {
      showError(e instanceof Error && e.message ? e.message : "Could not save the change. Please try again.");
      return false;
    }
  }

  async function handleDeleteRequest(log: AdBlueLog, reason: string) {
    if (!truck) return;
    try {
      await deletionApprovalsApi.create({
        resourceType: "AdBlueLog",
        resourceId: parseInt(log.id),
        resourceName: logLabel(log, truck),
        reason,
        logDetails: {
          date: log.date,
          truck_id: truck.registrationNumber,
          odometer: Number(log.odometer),
          litres: Number(log.litres),
          price_per_litre: Number(log.pricePerLitre),
          total_cost: Number(log.totalCost),
          supplier: log.fillingLocation,
          entered_by_name: log.enteredByName,
        },
      });
      showSuccess("Delete request sent to Admin — you'll see it approved or rejected on Edit & Delete Requests.");
      setDeleteRequestLog(null);
    } catch (e: unknown) {
      showError(e instanceof Error && e.message ? e.message : "Could not send the delete request. Please try again.");
    }
  }

  async function handleDelete(log: AdBlueLog) {
    if (!isAdmin) {
      setDeleteRequestLog(log);
      return;
    }
    const result = await confirmDelete(`the AdBlue log from ${formatDate(log.date)}`);
    if (!result.isConfirmed) return;
    setDeletingId(log.id);
    try {
      await adblueLogsApi.deleteLog(log.id);
      setLogs((prev) => prev.filter((l) => l.id !== log.id));
      showSuccess("AdBlue log deleted.");
    } catch (e: unknown) {
      // The server's reason (no permission, truck sold…) when it gives one.
      showError(e instanceof Error && e.message ? e.message : "Could not delete the AdBlue log. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  // Interval-based consumption rate (L/km) — same shape as the fuel-history
  // mileage computation, but the metric here is "litres used per km" rather
  // than "km per litre", since AdBlue draw is a tiny fraction of a litre/km.
  const consumptionStats = useMemo(() => {
    const sorted = [...logs].sort((a, b) => Number(a.odometer) - Number(b.odometer));
    const rawIntervals: { distance: number; litres: number; rate: number }[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const distance = Math.max(Number(sorted[i].odometer) - Number(sorted[i - 1].odometer), 0);
      const litres = Number(sorted[i].litres);
      if (distance > 0 && litres > 0) rawIntervals.push({ distance, litres, rate: litres / distance });
    }
    const intervals = _madFilter(rawIntervals);
    const totalDistance = intervals.reduce((s, r) => s + r.distance, 0);
    const totalIntervalLitres = intervals.reduce((s, r) => s + r.litres, 0);
    const lifetimeAvgRate = totalDistance > 0 ? totalIntervalLitres / totalDistance : null;
    const currentRate = intervals.length > 0 ? intervals[intervals.length - 1].rate : null;

    // Per-row distance/rate for the table below — same odometer-sorted pairing
    // as above, but unfiltered (irrelevant/outlier rows still get logged and
    // shown, just excluded from the stat cards). The chronologically-first
    // entry has no prior reading to diff against, so it's a "Baseline" row —
    // mirrors FuelHistoryViewDialog's `distance: 0` → "Baseline" chip.
    const rowStatsById = new Map<string, { distance: number; rate: number | null; isBaseline: boolean }>();
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        rowStatsById.set(sorted[i].id, { distance: 0, rate: null, isBaseline: true });
        continue;
      }
      const distance = Math.max(Number(sorted[i].odometer) - Number(sorted[i - 1].odometer), 0);
      const litres = Number(sorted[i].litres);
      rowStatsById.set(sorted[i].id, {
        distance,
        rate: distance > 0 && litres > 0 ? litres / distance : null,
        isBaseline: false,
      });
    }

    return { lifetimeAvgRate, currentRate, totalDistance, rowStatsById };
  }, [logs]);

  if (!truck) return null;

  const totalLitres = logs.reduce((sum, l) => sum + (Number(l.litres) || 0), 0);
  const totalCost = logs.reduce((sum, l) => sum + (Number(l.totalCost) || 0), 0);
  const { currentRate, totalDistance, rowStatsById } = consumptionStats;
  // Lifetime figures come from the server (one formula app-wide).
  const kmPerLitre = serverStats?.kmPerLitre ?? null;
  const lifetimeAvgRate = kmPerLitre ? 1 / kmPerLitre : null;          // shown as L/km too
  const costPerKm = serverStats?.costPerKm ?? null;
  const price = serverStats?.pricePerLitre ?? null;

  return (
    <>
    <Dialog open={open} onClose={onClose} title="Truck's Adblue History">
      <div className="mb-6">
        <p className="text-sm text-gray-500">
          {truck.registrationNumber} • {truck.modelName} • {truck.manufacturer}
        </p>
      </div>

      <div className="max-h-[70vh] space-y-6 overflow-y-auto">
        {loading ? (
          <div className="py-20 text-center text-gray-500">Loading AdBlue history...</div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <StatCard
                title="Current Interval"
                value={currentRate != null ? `${currentRate.toFixed(5)} L/km` : "—"}
                icon={Gauge}
                subtitle="Latest refill"
              />
              <StatCard
                title="Lifetime Average"
                value={kmPerLitre != null ? `${kmPerLitre.toFixed(2)} km/L` : "—"}
                icon={TrendingUp}
                subtitle={kmPerLitre != null ? `Total: ${totalDistance.toLocaleString()} km` : "Needs at least 2 fills"}
              />
              <StatCard
                title="Cost Per Kilometer"
                value={costPerKm != null ? `₹${costPerKm.toFixed(4)}` : "—"}
                icon={IndianRupee}
                subtitle={price == null
                  ? `No AdBlue price set for ${truck.manufacturer || "this manufacturer"} (Manufacturers)`
                  : `₹${price.toFixed(2)}/L (${truck.manufacturer}'s price) ÷ km per litre — used in Cost/KM`}
              />
              <StatCard
                title="L/KM"
                value={lifetimeAvgRate != null ? lifetimeAvgRate.toFixed(5) : "—"}
                icon={Droplets}
              />
              <StatCard
                title="L/100KM"
                value={lifetimeAvgRate != null ? (lifetimeAvgRate * 100).toFixed(3) : "—"}
                icon={Droplets}
              />
              <StatCard
                title="L/1000KM"
                value={lifetimeAvgRate != null ? (lifetimeAvgRate * 1000).toFixed(2) : "—"}
                icon={Droplets}
              />
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
                <h3 className="font-semibold text-gray-900">Log Entries</h3>
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full whitespace-nowrap border-collapse text-left">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500">
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 text-right font-medium">Odometer</th>
                      <th className="px-6 py-3 text-right font-medium">Quantity</th>
                      <th className="px-6 py-3 text-right font-medium">Price / L</th>
                      <th className="px-6 py-3 text-right font-medium">Total Cost</th>
                      <th className="px-6 py-3 text-right font-medium">Distance</th>
                      <th className="px-6 py-3 text-right font-medium">Consumption</th>
                      <th className="px-6 py-3 font-medium">Filling Location</th>
                      <th className="px-6 py-3 font-medium">Entered By</th>
                      <th className="sticky right-0 bg-gray-50 px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                          No AdBlue logs found for this truck.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => {
                        const rowStats = rowStatsById.get(log.id);
                        return (
                        <tr key={log.id} className="transition-colors hover:bg-gray-50/50">
                          <td className="px-6 py-4 text-gray-900">{formatDate(log.date)}</td>
                          <td className="px-6 py-4 text-right font-medium text-gray-600">
                            {Number(log.odometer).toLocaleString()} km
                          </td>
                          <td className="px-6 py-4 text-right text-gray-600">
                            <span className="inline-flex items-center gap-1">
                              <Droplets className="h-3 w-3 text-blue-400" />
                              {Number(log.litres).toFixed(2)} L
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-gray-600">₹{Number(log.pricePerLitre).toFixed(2)}</td>
                          <td className="px-6 py-4 text-right font-semibold text-gray-900">₹{Number(log.totalCost).toFixed(2)}</td>
                          <td className="px-6 py-4 text-right text-gray-600">
                            {rowStats?.isBaseline ? (
                              <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-400">Baseline</span>
                            ) : rowStats && rowStats.distance > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                <ArrowRight className="h-3 w-3 text-gray-400" />
                                {rowStats.distance.toLocaleString()} km
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {rowStats?.rate ? (
                              <span className="font-semibold text-gray-900">{rowStats.rate.toFixed(5)} L/km</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {log.fillingLocation ? (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-gray-400" />
                                {log.fillingLocation}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {log.enteredByName ?? <span className="text-gray-400">—</span>}
                          </td>
                          <td className="sticky right-0 bg-white px-4 py-4">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                title={isAdmin ? "Edit" : "Request edit"}
                                onClick={() => setEditLog(log)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title={isAdmin ? "Delete" : "Request delete"}
                                disabled={deletingId === log.id}
                                onClick={() => handleDelete(log)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
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
    </Dialog>

    {editLog && (
      <AdBlueLogFormDialog
        key={editLog.id}
        open
        onClose={() => setEditLog(null)}
        onSave={handleEditSave}
        truck={truck}
        log={editLog}
        requiresApproval={!isAdmin}
      />
    )}

    {deleteRequestLog && (
      <DeleteRequestDialog
        log={deleteRequestLog}
        truck={truck}
        onClose={() => setDeleteRequestLog(null)}
        onSubmit={(reason) => handleDeleteRequest(deleteRequestLog, reason)}
      />
    )}
    </>
  );
}
