"use client";

import { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
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
import { formatDate, todayIst } from "@/lib/format-date";
import { showSuccess, showError } from "@/lib/swal";
import type { Truck } from "@/types/truck";
import { Search, Plus } from "lucide-react";

const REMOVAL_QUICK_REMARKS = [
  "Puncture",
  "Powder Work",
  "LHS to RHS to LHS",
  "Tyre Side Change",
  "Retreading",
  "Tyre Busted",
  "Tyre Air Fault",
  "Tyre Side Wall Crack",
  "Speedometer Issue",
  "Tyre Rotation",
];
import { DecimalInput } from "@/components/ui/DecimalInput";

type ManageTyresDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
};





export function ManageTyresDialog({ open, onClose, truck }: ManageTyresDialogProps) {
  const { tyres, fitmentRecords, setFitmentRecords } = useTyreInventory();
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [animatingPosition, setAnimatingPosition] = useState<string | null>(null);
  const [selectedTyreId, setSelectedTyreId] = useState("");
  const [odometerInput, setOdometerInput] = useState("");
  const [removalRemark, setRemovalRemark] = useState("");
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setOdometerInput(truck ? truck.odometer : "");
    setRemovalRemark("");
    setError("");
  }, [selectedPosition, truck]);

  if (!truck) return null;

  const layout = getTyreLayout(truck.tyreLayout);
  const positions = layout ? getTyrePositions(layout) : [];
  const availableTyres = getAvailableTyres(tyres, fitmentRecords);
  const filteredTyres = availableTyres.filter(t => 
    t.brand.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.tyreNumber.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (t.size && t.size.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const filledPositions = new Set(
    positions.filter((position) => getFitmentForPosition(truck.id, position, fitmentRecords) !== null)
  );

  function cancelAction() {
    setSelectedPosition(null);
    setError("");
  }

  async function confirmAttach() {
    if (!truck || !selectedPosition) return;
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
      const fittedDate = todayIst();
      const newFitment = await tyreApi.fitTyre(selectedTyreId, truck.id, selectedPosition, odometer, fittedDate);
      setFitmentRecords((prev) => [...prev, newFitment]);

      const posToAnimate = selectedPosition;
      setSelectedPosition(null);
      setAnimatingPosition(posToAnimate);

      setTimeout(() => {
        setAnimatingPosition(null);
      }, 1000);
      showSuccess("Tyre attached successfully.");
    } catch (err: any) {
      setError(err.message || "Failed to attach tyre.");
      showError(err.message || "Failed to attach tyre.");
    }
  }

  async function confirmRemove() {
    if (!truck || !selectedPosition) return;
    const fitment = getFitmentForPosition(truck.id, selectedPosition, fitmentRecords);
    if (!fitment) return;

    const odometer = Number(odometerInput);
    if (!odometerInput || Number.isNaN(odometer) || odometer < fitment.fittedOdometer) {
      setError(`Enter an odometer reading of at least ${fitment.fittedOdometer.toLocaleString()} km.`);
      return;
    }

    try {
      const removedDate = todayIst();
      const updatedFitment = await tyreApi.removeTyre(fitment.id, odometer, removedDate, removalRemark);
        setFitmentRecords((prev) => (prev.map((f) => (f.id === updatedFitment.id ? updatedFitment : f))));
        setSelectedPosition(null);
        showSuccess("Tyre removed successfully.");
      } catch (err: any) {
      setError(err.message || "Failed to remove tyre.");
      showError(err.message || "Failed to remove tyre.");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Manage Tyres — ${truck.registrationNumber}`} className="max-w-3xl">
      <div className="flex flex-col gap-4">
        {layout ? (
          <TyreLayoutDiagram
            layout={layout}
            filledPositions={filledPositions}
            onPositionClick={setSelectedPosition}
            selectedPosition={selectedPosition}
            animatingPosition={animatingPosition}
          />
        ) : (
          <p className="text-sm text-gray-500">No tyre layout has been set for this truck.</p>
        )}

        <div className="border-t border-gray-200 pt-4">
          {!selectedPosition ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
              <p className="text-sm text-gray-500">Select a tyre position on the diagram above to manage.</p>
            </div>
          ) : (() => {
            const isFilled = filledPositions.has(selectedPosition);
            const fitment = getFitmentForPosition(truck.id, selectedPosition, fitmentRecords);
            const attachedTyre = fitment ? tyres.find((t) => t.id === fitment.tyreId) : null;

            return (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 shadow-sm animate-in fade-in slide-in-from-top-4">
                <div className="mb-4 flex items-center justify-between border-b border-blue-100 pb-3">
                  <h3 className="font-semibold text-gray-900">{selectedPosition}</h3>
                  <button
                    onClick={cancelAction}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    Close
                  </button>
                </div>

                {attachedTyre && fitment ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                      <div className="flex flex-col gap-1 text-sm text-gray-700">
                        <span className="font-medium text-gray-900">
                          {attachedTyre.brand} · {attachedTyre.tyreNumber}
                        </span>
                        <span className="text-xs text-gray-500">Size: {attachedTyre.size}</span>
                        <span className="mt-1 text-xs text-gray-500">
                          Fitted at {fitment.fittedOdometer.toLocaleString()} km on {formatDate(fitment.fittedDate)}
                        </span>
                      </div>
                      <span className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        attachedTyre.condition === "New" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                      )}>
                        {attachedTyre.condition || "Unknown"}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3 rounded-lg border border-red-100 bg-red-50/30 p-3">
                      <h4 className="text-sm font-medium text-gray-900">Remove Tyre</h4>
                      <DecimalInput type="number"
                        min="0"
                        value={odometerInput}
                        onChange={(e) => setOdometerInput(e.target.value)}
                        placeholder="Odometer reading at removal (km)"
                        className={inputClass}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {REMOVAL_QUICK_REMARKS.map((remark) => (
                          <button
                            key={remark}
                            type="button"
                            onClick={() => setRemovalRemark(remark)}
                            className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-700 hover:border-red-400 hover:bg-red-50 hover:text-red-700 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            {remark}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={removalRemark}
                        onChange={(e) => setRemovalRemark(e.target.value)}
                        placeholder="Removal remark (required) — e.g. Tyre worn out, sent for retreading"
                        rows={2}
                        className={cn(inputClass, "resize-none")}
                      />
                      {error && <p className="text-xs text-red-600">{error}</p>}
                      <button
                        type="button"
                        onClick={confirmRemove}
                        disabled={!removalRemark.trim()}
                        className="mt-1 w-full rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Confirm Removal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-3">
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="text-sm font-medium text-gray-900">Attach a New Tyre</h4>
                        <div className="relative w-40">
                          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search tyre..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-medium text-gray-700">Select Available Tyre</label>
                          {filteredTyres.length > 0 && (
                            <span className="text-[10px] text-gray-400 font-medium">{filteredTyres.length} available</span>
                          )}
                        </div>
                        {filteredTyres.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                            <p className="text-sm text-gray-500">{availableTyres.length === 0 ? "No available tyres in inventory." : "No tyres match your search."}</p>
                          </div>
                        ) : (
                          <div className="flex gap-3 overflow-x-auto pb-3 snap-x scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                            {filteredTyres.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setSelectedTyreId(t.id)}
                                className={cn(
                                  "flex-none w-52 text-left rounded-xl border p-3 transition-all snap-start outline-none",
                                  selectedTyreId === t.id
                                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500 shadow-sm"
                                    : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm"
                                )}
                              >
                                <div className="flex justify-between items-start mb-2 gap-2">
                                  <span className="font-semibold text-sm text-gray-900 truncate">{t.brand}</span>
                                  <span className={cn(
                                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
                                    t.condition === "New" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                                  )}>
                                    {t.condition || "Unknown"}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <div className="text-xs font-medium text-gray-700 truncate">{t.tyreNumber}</div>
                                  <div className="text-[10px] text-gray-500">Size: {t.size}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 mt-1">
                        <label className="text-xs font-medium text-gray-700">Odometer at Fitment (km)</label>
                        <DecimalInput type="number"
                          min="0"
                          value={odometerInput}
                          onChange={(e) => setOdometerInput(e.target.value)}
                          placeholder="Current truck odometer"
                          className={inputClass}
                        />
                      </div>
                      {error && <p className="text-xs text-red-600">{error}</p>}
                      <button
                        type="button"
                        onClick={confirmAttach}
                        className="mt-2 w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                      >
                        Attach Tyre
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </Dialog>
  );
}
