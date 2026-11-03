"use client";

import { useEffect, useState } from "react";
import { RiDeleteBinLine as Trash2 } from "@remixicon/react";
import { tyreApi } from "@/lib/api";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { confirmAction, showSuccess, showError } from "@/lib/feedback";
import { TyreDataDialog } from "@/components/tyre-inventory/TyreDataDialog";

import { EmptyState } from "@/components/ui/EmptyState";
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
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <Trash2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Discarded Tyres</h1>
            <p className="mt-0.5 text-sm text-text-secondary">Tyres taken out of service and written off</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-10 text-center text-sm text-text-secondary">Loading…</div>
      ) : tyres.length === 0 ? (
        <EmptyState size="compact" illustration="logistics" title="No discarded tyres" description="Use &ldquo;Flag as Discarded&rdquo; on Tyre Inventory or the Retread Queue to add one" />
      ) : (
        <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
          <table className="w-full min-w-[1500px] text-left text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-separator-border bg-fill-1">
                {columns.map((column) => (
                  <th key={column} className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-separator-border">
              {tyres.map((tyre) => (
                <tr key={tyre.id} className="hover:bg-fill-2">
                  <td className="px-4 py-3 font-medium text-text-primary">{tyre.brand}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.tyreType}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.tyreNumber}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.size}</td>
                  <td className="px-4 py-3 text-text-secondary">₹{Number(tyre.cost || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(tyre.purchaseDate)}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.retreadCount}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.condition}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.discardedAt ? formatDateTime(tyre.discardedAt) : "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">{tyre.discardedBy ?? "—"}</td>
                  <td className="px-4 py-3 text-text-secondary max-w-xs truncate" title={tyre.discardReason ?? ""}>
                    {tyre.soldWithTruckAt && (
                      <span className="mr-1.5 rounded-full bg-fill-2 px-2 py-0.5 text-caption-2-semibold text-text-secondary">
                        Sold with truck
                      </span>
                    )}
                    {tyre.discardReason ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDataTyreId(tyre.id)}
                        className="rounded-lg border border-separator-border px-3 py-1.5 text-caption-1-medium text-text-primary hover:bg-fill-2 transition-colors"
                      >
                        View Tyre Data
                      </button>
                      {!tyre.soldWithTruckAt && (
                      <button
                        type="button"
                        disabled={actingId === tyre.id}
                        onClick={() => handleMoveToInventory(tyre)}
                        className="rounded-lg border border-accent-border bg-accent-surface px-3 py-1.5 text-caption-1-medium text-accent-text hover:bg-accent-surface-strong transition-colors disabled:opacity-50"
                      >
                        Move to Inventory
                      </button>
                      )}
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
