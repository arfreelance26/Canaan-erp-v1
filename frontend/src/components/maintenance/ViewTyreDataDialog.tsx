"use client";

import { Dialog } from "@/components/ui/Dialog";
import { useTyreInventory } from "@/context/TyreInventoryContext";
import { getTyreLayout, getTyrePositions } from "@/lib/tyre-layouts";
import { getFitmentForPosition } from "@/lib/tyre-fitment-data";
import type { Truck } from "@/types/truck";
import type { TyreInventoryItem } from "@/types/tyre-inventory";

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

  const COLS = ["Brand", "Tyre Type", "Tyre Number", "Tyre Cost (₹)", "Expected Range", "Cost Per KM"];

  return (
    <Dialog open={open} onClose={onClose} title="Installed Tyre Data" className="max-w-4xl">
      <div className="mb-4">
        <p className="text-sm text-gray-500">
          {truck.registrationNumber} • {truck.modelName} • {truck.manufacturer}
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-5 py-3">
        <span className="text-sm font-semibold text-blue-700">Total Tyre Cost Per KM</span>
        <span className="text-lg font-bold tabular-nums text-blue-900">
          {total > 0 ? `₹${total.toFixed(4)}` : "—"}
        </span>
      </div>

      <div className="overflow-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-max text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {COLS.map((col) => (
                <th key={col} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {installedTyres.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="px-4 py-8 text-center text-gray-500">
                  No tyres currently installed on this truck.
                </td>
              </tr>
            ) : (
              installedTyres.map((tyre) => {
                const tyreCost = Number(tyre.cost);
                const expectedRange = lookupRange(tyre.tyreType);
                const costPerKm = getCostPerKm(tyre);
                return (
                  <tr key={tyre.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{tyre.brand}</td>
                    <td className="px-4 py-3 text-gray-600">{tyre.tyreType || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{tyre.tyreNumber}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-900">
                      {tyreCost > 0
                        ? `₹${tyreCost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-600">
                      {expectedRange != null
                        ? `${Number(expectedRange).toLocaleString("en-IN")} km`
                        : <span className="italic text-gray-400">Not configured</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-blue-700">
                      {costPerKm != null
                        ? `₹${costPerKm.toFixed(4)}`
                        : <span className="font-normal italic text-gray-400">—</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
