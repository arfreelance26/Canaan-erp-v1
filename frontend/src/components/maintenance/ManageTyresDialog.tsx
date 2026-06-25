"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { TyreLayoutDiagram } from "@/components/fleet/TyreLayoutDiagram";
import { inputClass } from "@/components/ui/Field";
import { cn } from "@/lib/utils";
import { getTyreLayout, getTyrePositions } from "@/lib/tyre-layouts";
import { initialTrucks } from "@/lib/truck-data";
import {
  getAvailableTyres,
  getFitmentForPosition,
} from "@/lib/tyre-fitment-data";
import { useTyreInventory } from "@/context/TyreInventoryContext";
import { tyreApi } from "@/lib/api";
import type { Truck } from "@/types/truck";

type ManageTyresDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
};

type ActiveAction = { position: string; type: "attach" | "remove" } | null;



export function ManageTyresDialog({ open, onClose, truck }: ManageTyresDialogProps) {
  const { tyres, fitmentRecords, setFitmentRecords } = useTyreInventory();
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [selectedTyreId, setSelectedTyreId] = useState("");
  const [odometerInput, setOdometerInput] = useState("");
  const [error, setError] = useState("");

  if (!truck) return null;

  const layout = getTyreLayout(truck.tyreLayout);
  const positions = layout ? getTyrePositions(layout) : [];
  const availableTyres = getAvailableTyres(tyres, fitmentRecords);
  const filledPositions = new Set(
    positions.filter((position) => getFitmentForPosition(truck.id, position, fitmentRecords) !== null)
  );

  function startAttach(position: string) {
    setActiveAction({ position, type: "attach" });
    setSelectedTyreId("");
    setOdometerInput(truck ? truck.odometer : "");
    setError("");
  }

  function startRemove(position: string) {
    setActiveAction({ position, type: "remove" });
    setOdometerInput(truck ? truck.odometer : "");
    setError("");
  }

  function cancelAction() {
    setActiveAction(null);
    setError("");
  }

  async function confirmAttach(position: string) {
    if (!truck) return;
    if (!selectedTyreId) {
      setError("Select a tyre to attach.");
      return;
    }
    const odometer = Number(odometerInput);
    if (!odometerInput || Number.isNaN(odometer) || odometer < 0) {
      setError("Enter a valid odometer reading.");
      return;
    }

    try {
      const fittedDate = new Date().toISOString().slice(0, 10);
      const newFitment = await tyreApi.fitTyre(selectedTyreId, truck.id, position, odometer, fittedDate);
      setFitmentRecords((prev) => [...prev, newFitment]);
      setActiveAction(null);
    } catch (err: any) {
      setError(err.message || "Failed to attach tyre.");
    }
  }

  async function confirmRemove(position: string) {
    if (!truck) return;
    const fitment = getFitmentForPosition(truck.id, position, fitmentRecords);
    if (!fitment) return;

    const odometer = Number(odometerInput);
    if (!odometerInput || Number.isNaN(odometer) || odometer < fitment.fittedOdometer) {
      setError(`Enter an odometer reading of at least ${fitment.fittedOdometer.toLocaleString()} km.`);
      return;
    }

    try {
      const removedDate = new Date().toISOString().slice(0, 10);
      const updatedFitment = await tyreApi.removeTyre(fitment.id, odometer, removedDate);
      setFitmentRecords((prev) =>
        prev.map((record) =>
          record.id === fitment.id ? updatedFitment : record
        )
      );
      setActiveAction(null);
    } catch (err: any) {
      setError(err.message || "Failed to remove tyre.");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Manage Tyres — ${truck.registrationNumber}`} className="max-w-3xl">
      <div className="flex flex-col gap-4">
        {layout ? (
          <TyreLayoutDiagram layout={layout} filledPositions={filledPositions} />
        ) : (
          <p className="text-sm text-gray-500">No tyre layout has been set for this truck.</p>
        )}

        {positions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {positions.map((position) => {
              const fitment = getFitmentForPosition(truck.id, position, fitmentRecords);
              const tyre = fitment ? tyres.find((t) => t.id === fitment.tyreId) ?? null : null;
              const isActive = activeAction?.position === position;

              return (
                <li key={position} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-gray-900">{position}</span>
                    {tyre ? (
                      <button
                        type="button"
                        onClick={() => startRemove(position)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                      >
                        Remove Tyre
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startAttach(position)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Attach Tyre
                      </button>
                    )}
                  </div>

                  {tyre && fitment ? (
                    <div className="mt-2 flex flex-col gap-1 text-xs text-gray-600">
                      <span>
                        {tyre.brand} · {tyre.tyreNumber} ({tyre.size})
                      </span>
                      <span>
                        Fitted at {fitment.fittedOdometer.toLocaleString()} km on {fitment.fittedDate}
                      </span>

                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">Empty</p>
                  )}

                  {isActive && activeAction?.type === "attach" && (
                    <div className="mt-3 flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
                      <select
                        value={selectedTyreId}
                        onChange={(e) => setSelectedTyreId(e.target.value)}
                        className={inputClass}
                      >
                        <option value="" disabled>
                          Select a tyre
                        </option>
                        {availableTyres.map((tyreOption) => (
                          <option key={tyreOption.id} value={tyreOption.id}>
                            {tyreOption.brand} · {tyreOption.tyreNumber} ({tyreOption.size})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        value={odometerInput}
                        onChange={(e) => setOdometerInput(e.target.value)}
                        placeholder="Odometer reading at fitment (km)"
                        className={inputClass}
                      />
                      {error && <p className="text-xs text-red-600">{error}</p>}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelAction}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmAttach(position)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  )}

                  {isActive && activeAction?.type === "remove" && (
                    <div className="mt-3 flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
                      <input
                        type="number"
                        min="0"
                        value={odometerInput}
                        onChange={(e) => setOdometerInput(e.target.value)}
                        placeholder="Odometer reading at removal (km)"
                        className={inputClass}
                      />
                      {error && <p className="text-xs text-red-600">{error}</p>}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelAction}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmRemove(position)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
