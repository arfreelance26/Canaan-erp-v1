"use client";

import { useEffect, useState } from "react";
import { tyreApi } from "@/lib/api";
import type { TyreData, TyreMovementEvent } from "@/types/tyre-inventory";
import { Dialog } from "@/components/ui/Dialog";
import { formatDate, formatDateTime } from "@/lib/format-date";

const EVENT_LABEL: Record<TyreMovementEvent["event"], string> = {
  "Flagged for Retreading": "Moved for retreading",
  "Moved to Inventory": "Moved back to inventory",
  "Flagged as Discarded": "Moved to discarded tyres",
  "Restored from Discard": "Restored from discarded tyres",
};

type Props = {
  tyreId: string | null;
  onClose: () => void;
};

// Full record for one tyre: its details, when it was first added to inventory,
// and every move to/from the Retread Queue or Discarded Tyres, with what was entered.
export function TyreDataDialog({ tyreId, onClose }: Props) {
  const [data, setData] = useState<TyreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tyreId) return;
    setLoading(true);
    setError(null);
    setData(null);
    tyreApi.getTyreData(tyreId)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load tyre data."))
      .finally(() => setLoading(false));
  }, [tyreId]);

  const tyre = data?.tyre;

  return (
    <Dialog
      open={tyreId !== null}
      onClose={onClose}
      title={tyre ? `Tyre ${tyre.tyreNumber}` : "Tyre Data"}
    >
      {loading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
      {error && <p className="p-4 text-sm text-red-600">{error}</p>}
      {data && tyre && (
        <div className="flex flex-col gap-5 p-1">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Details</h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Row label="Brand" value={tyre.brand} />
              <Row label="Tyre Type" value={tyre.tyreType} />
              <Row label="Tyre Size" value={tyre.size} />
              <Row label="Condition" value={tyre.condition} />
              <Row label="Purchase Date" value={tyre.purchaseDate ? formatDate(tyre.purchaseDate) : "—"} />
              <Row label="Purchase Cost" value={tyre.cost ? `₹${Number(tyre.cost).toLocaleString()}` : "—"} />
              <Row label="Expected Range" value={tyre.rangeKm && tyre.rangeKm !== "0" ? `${Number(tyre.rangeKm).toLocaleString()} km` : "—"} />
              <Row label="Cost Per KM" value={tyre.costPerKm ? `₹${Number(tyre.costPerKm).toFixed(4)}` : "—"} />
              <Row label="Retread Count" value={tyre.retreadCount || "0"} />
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">History</h3>
            <ol className="flex flex-col gap-3 border-l border-gray-200 pl-4 text-sm">
              <li>
                <p className="font-medium text-gray-900">Added to inventory</p>
                <p className="text-xs text-gray-500">
                  {data.addedToInventoryAt ? formatDateTime(data.addedToInventoryAt) : "—"}
                </p>
              </li>
              {data.movements.length === 0 && (
                <li className="text-xs text-gray-500">No retread or discard moves yet.</li>
              )}
              {data.movements.map((m) => (
                <li key={m.id}>
                  <p className="font-medium text-gray-900">{EVENT_LABEL[m.event]}</p>
                  <p className="text-xs text-gray-500">
                    {formatDateTime(m.createdAt)} · {m.actorName}
                    {m.actorRole ? ` (${m.actorRole})` : ""}
                  </p>
                  {m.retreadDoneBy && (
                    <p className="mt-0.5 text-xs text-gray-600">Retreaded by {m.retreadDoneBy}</p>
                  )}
                  {(m.retreadCost != null || m.expectedRange != null || m.retreadCount != null) && (
                    <p className="mt-0.5 text-xs text-gray-600">
                      {m.retreadCost != null && <>Retread cost ₹{Number(m.retreadCost).toLocaleString()} · </>}
                      {m.expectedRange != null && <>Range {m.expectedRange.toLocaleString()} km · </>}
                      {m.retreadCount != null && <>Retread count {m.retreadCount}</>}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value || "—"}</dd>
    </div>
  );
}
