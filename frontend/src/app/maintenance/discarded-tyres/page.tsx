"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { tyreApi } from "@/lib/api";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { confirmAction, showSuccess, showError } from "@/lib/swal";
import { TyreDataDialog } from "@/components/tyre-inventory/TyreDataDialog";

const columns = [
  "Brand",
  "Tyre Type",
  "Tyre Number",
  "Tyre Size",
  "Cost",
  "Purchase Date",
  "Retread Count",
  "Condition",
  "Discarded On",
  "Discarded By",
  "Reason",
  "Actions",
];

export default function DiscardedTyresPage() {
  const [tyres, setTyres] = useState<TyreInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dataTyreId, setDataTyreId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    tyreApi.listDiscarded()
      .then(setTyres)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey((k) => k + 1), 5000);
  useWebSocketEvent("tyre_updated", () => setRefreshKey((k) => k + 1));

  async function handleMoveToInventory(tyre: TyreInventoryItem) {
    const result = await confirmAction(
      "Move this tyre back to Tyre Inventory?",
      `${tyre.tyreNumber} (${tyre.brand}) will leave Discarded Tyres and show in Tyre Inventory again.`,
      "Yes, move it"
    );
    if (!result.isConfirmed) return;
    setActingId(tyre.id);
    try {
      await tyreApi.restoreFromDiscard(tyre.id);
      setTyres((prev) => prev.filter((t) => t.id !== tyre.id));
      showSuccess("Tyre moved back to Tyre Inventory.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to move tyre to inventory.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
            <Trash2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Discarded Tyres</h1>
            <p className="mt-0.5 text-sm text-gray-500">Tyres taken out of service and written off</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">Loading…</div>
      ) : tyres.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No discarded tyres. Use &ldquo;Flag as Discarded&rdquo; on Tyre Inventory or the Retread Queue to add one.
        </div>
      ) : (
        <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
          <table className="w-full min-w-[1500px] text-left text-sm whitespace-nowrap">
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
                  <td className="px-4 py-3 text-gray-600">₹{Number(tyre.cost || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(tyre.purchaseDate)}</td>
                  <td className="px-4 py-3 text-gray-600">{tyre.retreadCount}</td>
                  <td className="px-4 py-3 text-gray-600">{tyre.condition}</td>
                  <td className="px-4 py-3 text-gray-600">{tyre.discardedAt ? formatDateTime(tyre.discardedAt) : "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{tyre.discardedBy ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={tyre.discardReason ?? ""}>
                    {tyre.discardReason ?? "—"}
                  </td>
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
                        disabled={actingId === tyre.id}
                        onClick={() => handleMoveToInventory(tyre)}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
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
    </div>
  );
}
