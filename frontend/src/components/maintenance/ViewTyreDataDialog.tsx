"use client";

import { Dialog } from "@/components/ui/Dialog";
import { useTyreInventory } from "@/context/TyreInventoryContext";
import { getTyreLayout, getTyrePositions } from "@/lib/tyre-layouts";
import { getFitmentForPosition } from "@/lib/tyre-fitment-data";
import type { Truck } from "@/types/truck";
import type { TyreInventoryItem } from "@/types/tyre-inventory";

import { EmptyState } from "@/components/ui/EmptyState";
type ViewTyreDataDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
  rangeConfigMap: Record<string, number | null>;
};

export function ViewTyreDataDialog({ open, onClose, truck, rangeConfigMap }: ViewTyreDataDialogProps) {
  const { tyres, fitmentRecords } = useTyreInventory();

  if (!truck || !open) return null;

  const layout = getTyreLayout(truck.tyreLayout);
  const positions = layout ? getTyrePositions(layout) : [];

  const installedTyres: TyreInventoryItem[] = [];
  for (const pos of positions) {
    const fitment = getFitmentForPosition(truck.id, pos, fitmentRecords);
    if (!fitment) continue;
    const tyre = tyres.find((t) => t.id === fitment.tyreId);
    if (tyre) installedTyres.push(tyre);
  }

  function lookupRange(tyreType: string): number | null {
    const key = tyreType?.toUpperCase() ?? "";
    return rangeConfigMap[key] ?? rangeConfigMap[tyreType] ?? null;
  }

  function getCostPerKm(tyre: TyreInventoryItem): number | null {
    const cost = Number(tyre.cost);
    const range = lookupRange(tyre.tyreType);
    if (!cost || !range || range <= 0) return null;
    return cost / range;
  }

  const total = installedTyres.reduce((sum, t) => sum + (getCostPerKm(t) ?? 0), 0);
  const skippedCount = installedTyres.filter((t) => getCostPerKm(t) === null).length;

  const COLS = ["Brand", "Tyre Type", "Tyre Number", "Tyre Cost (₹)", "Expected Range", "Cost Per KM (Advanced)"];

  return (
    <Dialog open={open} onClose={onClose} title="Installed Tyre Data" className="max-w-4xl">
      <div className="mb-4">
        <p className="text-sm text-text-secondary">
          {truck.registrationNumber} • {truck.modelName} • {truck.manufacturer}
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl border border-accent-border bg-accent-surface px-5 py-3">
        <span className="text-body-semibold text-accent-text">Total Tyre Cost Per KM (Advanced)</span>
        <span className="text-title-3-semibold tabular-nums text-accent-text-strong">
          {total > 0 ? `₹${total.toFixed(4)}` : "—"}
        </span>
      </div>

      <div className="overflow-auto rounded-xl border border-separator-border">
        <table className="w-full min-w-max text-left text-sm">
          <thead>
            <tr className="border-b border-separator-border bg-fill-1">
              {COLS.map((col) => (
                <th key={col} className="px-4 py-3 text-caption-2-semibold text-text-secondary">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-separator-border">
            {installedTyres.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="p-0"><EmptyState size="compact" illustration="logistics" title="No tyres currently installed on this truck" /></td>
              </tr>
            ) : (
              installedTyres.map((tyre) => {
                const tyreCost = Number(tyre.cost);
                const expectedRange = lookupRange(tyre.tyreType);
                const costPerKm = getCostPerKm(tyre);
                return (
                  <tr key={tyre.id} className="hover:bg-fill-2">
                    <td className="px-4 py-3 font-medium text-text-primary">{tyre.brand}</td>
                    <td className="px-4 py-3 text-text-secondary">{tyre.tyreType || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">{tyre.tyreNumber}</td>
                    <td className="px-4 py-3 tabular-nums text-text-primary">
                      {tyreCost > 0
                        ? `₹${tyreCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-text-secondary">
                      {expectedRange != null
                        ? `${Number(expectedRange).toLocaleString("en-IN")} km`
                        : <span className="italic text-text-tertiary">Not configured</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-accent-text">
                      {costPerKm != null
                        ? `₹${costPerKm.toFixed(4)}`
                        : <span className="font-normal italic text-text-tertiary">—</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* How the total is worked out */}
      <div className="mt-3 flex flex-col gap-1 rounded-xl bg-fill-1 px-3.5 py-2.5">
        <p className="text-[11px] leading-relaxed text-text-tertiary">
          <span className="font-semibold text-text-secondary">Cost Per KM (Advanced)</span> = Tyre Cost ÷ Expected Range
          (the range set for that tyre type in Tyre Cost Configuration)
        </p>
        <p className="text-[11px] leading-relaxed text-text-tertiary">
          <span className="font-semibold text-text-secondary">Total Tyre Cost Per KM (Advanced)</span> = sum of Cost Per KM
          for every tyre currently installed on this truck
          {skippedCount > 0 &&
            ` — ${skippedCount} tyre${skippedCount === 1 ? "" : "s"} with no cost or no Expected Range ${skippedCount === 1 ? "is" : "are"} left out`}
        </p>
      </div>
    </Dialog>
  );
}
