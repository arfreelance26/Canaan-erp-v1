"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { tyreApi, vendorsApi } from "@/lib/api";
import { GlassCombobox } from "@/components/ui/GlassCombobox";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { Dialog } from "@/components/ui/Dialog";
import { TyreDataDialog } from "@/components/tyre-inventory/TyreDataDialog";
import { DiscardReasonDialog } from "@/components/tyre-inventory/DiscardReasonDialog";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { showSuccess, showError } from "@/lib/swal";

const columns = [
  "Brand",
  "Tyre Type",
  "Tyre Number",
  "Tyre Size",
  "Range (km)",
  "Cost",
  "Purchase Date",
  "Condition",
  "Flagged On",
  "Flagged By",
  "Actions",
];

export default function RetreadQueuePage() {
  const [tyres, setTyres] = useState<TyreInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [moveTarget, setMoveTarget] = useState<TyreInventoryItem | null>(null);
  const [retreadCostInput, setRetreadCostInput] = useState("");
  const [expectedRangeInput, setExpectedRangeInput] = useState("");
  const [moving, setMoving] = useState(false);
  const [dataTyreId, setDataTyreId] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<TyreInventoryItem | null>(null);
  const [vendorNames, setVendorNames] = useState<string[]>([]);
  const [moveDoneBy, setMoveDoneBy] = useState("");

  useEffect(() => {
    vendorsApi.list().then((vs) => setVendorNames(vs.map((v) => v.name).sort())).catch(() => {});
  }, []);
  const [moveError, setMoveError] = useState<string | null>(null);

  function openMoveDialog(tyre: TyreInventoryItem) {
    setMoveTarget(tyre);
    setRetreadCostInput("");
    setExpectedRangeInput("");
    setMoveDoneBy("");
    setMoveError(null);
  }

  async function handleDiscardConfirm(tyre: TyreInventoryItem, reason: string) {
    try {
      await tyreApi.flagForDiscard(tyre.id, reason);
      setTyres((prev) => prev.filter((t) => t.id !== tyre.id));
      setDiscardTarget(null);
      showSuccess("Tyre moved to Discarded Tyres.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to discard tyre.");
    }
  }

  async function handleMoveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!moveTarget) return;
    const cost = parseFloat(retreadCostInput);
    const range = parseInt(expectedRangeInput, 10);
    if (isNaN(cost) || cost < 0) return setMoveError("Enter a valid retread cost.");
    if (isNaN(range) || range <= 0) return setMoveError("Enter an expected range greater than zero.");
    if (!moveDoneBy.trim()) return setMoveError("Select the vendor that did the retreading.");
    setMoving(true);
    setMoveError(null);
    try {
      await tyreApi.moveToInventory(moveTarget.id, retreadCostInput, expectedRangeInput, moveDoneBy.trim());
      setTyres((prev) => prev.filter((t) => t.id !== moveTarget.id));
      setMoveTarget(null);
      showSuccess("Tyre moved back to Tyre Inventory.");
    } catch (err: unknown) {
      setMoveError(err instanceof Error ? err.message : "Failed to move tyre to inventory.");
    } finally {
      setMoving(false);
    }
  }

  useEffect(() => {
    tyreApi.listRetreadQueue()
      .then(setTyres)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey((k) => k + 1), 5000);
  useWebSocketEvent("tyre_updated", () => setRefreshKey((k) => k + 1));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
            <RefreshCw className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Retread Queue</h1>
            <p className="mt-0.5 text-sm text-gray-500">Tyres waiting to be sent for retreading</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">Loading…</div>
      ) : tyres.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No tyres in the retread queue. Use &ldquo;Flag for Retreading&rdquo; on Tyre Inventory to add one.
        </div>
      ) : (
        <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
          <table className="w-full min-w-[1200px] text-left text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-200 bg-gray-50">
                {columns.map((column) => (
                  <th key={column} className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tyres.map((tyre) => (
                <tr key={tyre.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{tyre.brand}</td>
                  <td className="px-4 py-3 text-gray-600">{tyre.tyreType}</td>
                  <td className="px-4 py-3 text-gray-600">{tyre.tyreNumber}</td>
                  <td className="px-4 py-3 text-gray-600">{tyre.size}</td>
                  <td className="px-4 py-3 text-gray-600">{tyre.rangeKm}</td>
                  <td className="px-4 py-3 text-gray-600">₹{Number(tyre.cost || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(tyre.purchaseDate)}</td>
                  <td className="px-4 py-3 text-gray-600">{tyre.condition}</td>
                  <td className="px-4 py-3 text-gray-600">{tyre.retreadFlaggedAt ? formatDateTime(tyre.retreadFlaggedAt) : "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{tyre.retreadFlaggedBy ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDataTyreId(tyre.id)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        View Tyre Data
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscardTarget(tyre)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                      >
                        Flag as Discarded
                      </button>
                      <button
                        type="button"
                        onClick={() => openMoveDialog(tyre)}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        Move to Inventory
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TyreDataDialog tyreId={dataTyreId} onClose={() => setDataTyreId(null)} />
      <DiscardReasonDialog tyre={discardTarget} onClose={() => setDiscardTarget(null)} onConfirm={handleDiscardConfirm} />

      <Dialog
        open={moveTarget !== null}
        onClose={() => !moving && setMoveTarget(null)}
        title={moveTarget ? `Move ${moveTarget.tyreNumber} to Inventory` : "Move to Inventory"}
      >
        <form onSubmit={handleMoveSubmit} className="flex flex-col gap-4 p-1">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Retread Cost (₹)</span>
            <DecimalInput
              required
              min="0"
              value={retreadCostInput}
              onChange={(e) => setRetreadCostInput(e.target.value)}
              placeholder="e.g. 4500"
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Expected Range (km)</span>
            <input
              type="number"
              required
              min="1"
              step="1"
              value={expectedRangeInput}
              onChange={(e) => setExpectedRangeInput(e.target.value)}
              placeholder="e.g. 60000"
              className="rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Rethreading Done by *</span>
            <GlassCombobox
              required
              strictSelect
              value={moveDoneBy}
              onChange={setMoveDoneBy}
              options={vendorNames.map((name) => ({ value: name, label: name }))}
              placeholder="Search or select a vendor"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span className="font-medium text-gray-700">Retread Count</span>
            <span className="text-gray-600">
              {moveTarget?.retreadCount || 0} → {(parseInt(moveTarget?.retreadCount ?? "0", 10) || 0) + 1}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            The retread cost will become this tyre&apos;s purchase cost in Tyre Inventory.
          </p>
          {moveError && <p className="text-sm text-red-600">{moveError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setMoveTarget(null)}
              disabled={moving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={moving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {moving ? "Moving…" : "Move to Inventory"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
