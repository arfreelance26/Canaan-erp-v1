"use client";

import { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { TyreLayoutDiagram } from "@/components/fleet/TyreLayoutDiagram";
import { inputClass } from "@/components/ui/Field";
import { cn } from "@/lib/utils";
import { getTyreLayout, getTyrePositions, getUnitLabel, type TyreLayout } from "@/lib/tyre-layouts";
import { initialTrucks } from "@/lib/truck-data";
import {
  getAvailableTyres,
  getFitmentForPosition,
} from "@/lib/tyre-fitment-data";
import { useTyreInventory } from "@/context/TyreInventoryContext";
import { tyreApi, tyreRemarkPresetApi } from "@/lib/api";
import type { TyreRemarkPreset, TyreRemarkScenario } from "@/types/tyre-inventory";
import { ArrowLeftRight, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { formatDate, todayIst } from "@/lib/format-date";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { TyreDataDialog } from "@/components/tyre-inventory/TyreDataDialog";
import { showSuccess, showError } from "@/lib/swal";
import type { Truck } from "@/types/truck";
import { Search, Plus } from "lucide-react";

import { DecimalInput } from "@/components/ui/DecimalInput";

// ── Swap helpers ───────────────────────────────────────────────────────────

type AxleEntry = {
  axleLabel: string;       // full position prefix, e.g. "Axle 2" or "Tractor Head - Axle 1"
  wheelsPerSide: 1 | 2;
  displayLabel: string;    // human-readable for the picker
};

function buildAxleEntries(layout: TyreLayout): AxleEntry[] {
  const result: AxleEntry[] = [];
  layout.units.forEach((unit, ui) => {
    const unitLabel = getUnitLabel(layout, unit, ui);
    const prefix = unitLabel ? `${unitLabel} - ` : "";
    unit.axles.forEach((axle, ai) => {
      const axleLabel = `${prefix}Axle ${ai + 1}`;
      const tyreCount = axle.wheelsPerSide * 2;
      const displayLabel = unitLabel
        ? `${unitLabel} — Axle ${ai + 1} (${tyreCount} tyres)`
        : `Axle ${ai + 1} (${tyreCount} tyres)`;
      result.push({ axleLabel, wheelsPerSide: axle.wheelsPerSide, displayLabel });
    });
  });
  return result;
}

function getLRSwapPairs(entry: AxleEntry): [string, string][] {
  const { axleLabel, wheelsPerSide } = entry;
  if (wheelsPerSide === 1) {
    return [[`${axleLabel} - Left`, `${axleLabel} - Right`]];
  }
  return [
    [`${axleLabel} - Left 1`, `${axleLabel} - Right 1`],
    [`${axleLabel} - Left 2`, `${axleLabel} - Right 2`],
  ];
}

type IOSide = "Left" | "Right" | "Both";

function getIOSwapPairs(entry: AxleEntry, side: IOSide = "Both"): [string, string][] {
  const { axleLabel } = entry;
  // Each side: swap wheel 1 (outer) ↔ wheel 2 (inner)
  const sides = side === "Both" ? ["Left", "Right"] : [side];
  return sides.map((s) => [`${axleLabel} - ${s} 1`, `${axleLabel} - ${s} 2`] as [string, string]);
}

// ── Component types ─────────────────────────────────────────────────────────

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
  const [actionDate, setActionDate] = useState(todayIst());
  const [attachRemark, setAttachRemark] = useState("");
  const [removalRemark, setRemovalRemark] = useState("");
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  type SwapStep =
    | { step: "select-axle"; type: "lr" | "io" }
    | { step: "select-side"; type: "io"; entry: AxleEntry }
    | { step: "confirm"; pairs: [string, string][]; description: string }
    | null;
  const [swapStep, setSwapStep] = useState<SwapStep>(null);
  const [swapOdometer, setSwapOdometer] = useState("");
  const [swapDate, setSwapDate] = useState(todayIst());
  const [swapRemark, setSwapRemark] = useState("Tyre Rotation");
  const [swapping, setSwapping] = useState(false);
  // Bulk removal: select several tyre positions, or none to remove every tyre on the truck.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkOdometer, setBulkOdometer] = useState("");
  const [bulkDate, setBulkDate] = useState(todayIst());
  const [bulkRemark, setBulkRemark] = useState("");
  const [bulkConfirmText, setBulkConfirmText] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [dataTyreId, setDataTyreId] = useState<string | null>(null);
  const [fittedOpen, setFittedOpen] = useState(false);
  // Shared quick-pick remarks, managed on the Tyre Management page ("Manage Remarks").
  const [remarkPresets, setRemarkPresets] = useState<TyreRemarkPreset[]>([]);
  useEffect(() => {
    if (!open) return;
    tyreRemarkPresetApi.list().then(setRemarkPresets).catch(() => {});
  }, [open]);
  const presetsFor = (scenario: TyreRemarkScenario) =>
    remarkPresets.filter((p) => p.scenario === scenario).map((p) => p.text);
  // Custom swap: click two positions on the diagram and swap them, across axles or the spare.
  const [customSwap, setCustomSwap] = useState(false);
  const [pickA, setPickA] = useState<string | null>(null);
  const [pickB, setPickB] = useState<string | null>(null);

  useEffect(() => {
    setOdometerInput(truck ? truck.odometer : "");
    setActionDate(todayIst());
    setAttachRemark("");
    setRemovalRemark("");
    setError("");
  }, [selectedPosition, truck]);

  if (!truck) return null;

  // Rotation (swap) and position-level attach/remove are mutually exclusive —
  // doing both at once could leave the truck's fitment history in a
  // confusing, hard-to-untangle state (e.g. a position removed mid-rotation).
  const rotationActive = swapStep !== null;

  // ── Tyre type summary for this truck ──────────────────────────────────────
  const activeFitments = fitmentRecords.filter(
    (f) => f.truckId === truck.id && f.removedOdometer === null
  );
  const tyreTypeCounts: Record<string, number> = {};
  for (const f of activeFitments) {
    const tyre = tyres.find((t) => t.id === f.tyreId);
    if (!tyre) continue;
    const label = tyre.tyreType || "Unknown";
    tyreTypeCounts[label] = (tyreTypeCounts[label] ?? 0) + 1;
  }
  const tyreTypePills = Object.entries(tyreTypeCounts);

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

  // One row per fitted tyre: km run since fitting, and how much of its expected range that is.
  const tyreRows = activeFitments
    .map((f) => {
      const tyre = tyres.find((t) => t.id === f.tyreId);
      const currentOdometer = Number(truck?.odometer) || 0;
      const kmRun = Math.max(0, currentOdometer - Number(f.fittedOdometer || 0));
      const expectedRange = Number(tyre?.rangeKm) || 0;
      const pctOfRange = expectedRange > 0 ? (kmRun / expectedRange) * 100 : null;
      const index = positions.indexOf(f.position);
      return { fitment: f, tyre, kmRun, expectedRange, pctOfRange, order: index === -1 ? positions.length : index };
    })
    .sort((a, b) => a.order - b.order);

  async function exportTyres(format: "xlsx" | "pdf") {
    if (!truck) return;
    if (tyreRows.length === 0) {
      showError("No fitted tyres to export.");
      return;
    }
    const reg = truck.registrationNumber.replace(/\s+/g, "_");
    const rows = tyreRows.map((r) => ({
      Position: r.fitment.position,
      "Tyre Number": r.tyre?.tyreNumber ?? "",
      Brand: r.tyre?.brand ?? "",
      Size: r.tyre?.size ?? "",
      "Fitted On": r.fitment.fittedDate ? formatDate(r.fitment.fittedDate) : "",
      "Fitted Odometer (km)": Number(r.fitment.fittedOdometer) || 0,
      "Current Odometer (km)": Number(truck.odometer) || 0,
      "Km Run": r.kmRun,
      "Expected Range (km)": r.expectedRange || "",
      "% of Range": r.pctOfRange == null ? "" : Number(r.pctOfRange.toFixed(1)),
    }));

    if (format === "xlsx") {
      const { utils, writeFile } = await import("xlsx");
      const ws = utils.json_to_sheet(rows);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Tyres");
      writeFile(wb, `Tyres_${reg}.xlsx`);
      return;
    }

    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.setFontSize(14);
    pdf.text(`Tyres on ${truck.registrationNumber}`, 14, 16);
    pdf.setFontSize(9);
    pdf.text(`Current odometer: ${truck.odometer} km  ·  Exported ${formatDate(todayIst())}`, 14, 22);

    const headers = Object.keys(rows[0]);
    const colWidth = 265 / headers.length;
    let y = 30;
    const drawRow = (cells: (string | number)[], bold: boolean) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      cells.forEach((cell, i) => pdf.text(String(cell), 14 + i * colWidth, y, { maxWidth: colWidth - 2 }));
      y += 6;
    };
    drawRow(headers, true);
    for (const row of rows) {
      if (y > 190) {
        pdf.addPage();
        y = 16;
        drawRow(headers, true);
      }
      drawRow(Object.values(row), false);
    }
    pdf.save(`Tyres_${reg}.pdf`);
  }

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

    if (!actionDate) {
      setError("Select a fitment date.");
      return;
    }

    try {
      const newFitment = await tyreApi.fitTyre(selectedTyreId, truck.id, selectedPosition, odometer, actionDate, attachRemark.trim());
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
    if (!actionDate) {
      setError("Select a removal date.");
      return;
    }

    try {
      const updatedFitment = await tyreApi.removeTyre(fitment.id, odometer, actionDate, removalRemark);
        setFitmentRecords((prev) => (prev.map((f) => (f.id === updatedFitment.id ? updatedFitment : f))));
        setSelectedPosition(null);
        showSuccess("Tyre removed successfully.");
      } catch (err: any) {
      setError(err.message || "Failed to remove tyre.");
      showError(err.message || "Failed to remove tyre.");
    }
  }

  function togglePosition(position: string) {
    if (!filledPositions.has(position)) return;
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  }

  function openBulkRemove() {
    setBulkOdometer(truck?.odometer ?? "");
    setBulkDate(todayIst());
    setBulkRemark("");
    setBulkConfirmText("");
    setError("");
    setBulkOpen(true);
  }

  function closeBulkRemove() {
    setBulkOpen(false);
    setError("");
  }

  async function confirmBulkRemove() {
    if (!truck) return;
    const fitments = selectedSet.size > 0
      ? activeFitments.filter((f) => selectedSet.has(f.position))
      : activeFitments;
    const removingAll = selectedSet.size === 0;

    const odometer = Number(bulkOdometer);
    if (!bulkOdometer || Number.isNaN(odometer) || odometer < 0) {
      setError("Enter a valid odometer reading.");
      return;
    }
    const lowest = fitments.find((f) => odometer < f.fittedOdometer);
    if (lowest) {
      setError(`Odometer must be at least ${Number(lowest.fittedOdometer).toLocaleString()} km (${lowest.position} was fitted at that reading).`);
      return;
    }
    if (!bulkDate) {
      setError("Select a removal date.");
      return;
    }
    if (!bulkRemark.trim()) {
      setError("Enter a remark for this removal.");
      return;
    }
    if (removingAll && bulkConfirmText.trim() !== truck.registrationNumber) {
      setError(`Type ${truck.registrationNumber} to confirm removing all tyres.`);
      return;
    }

    setBulkSaving(true);
    setError("");
    try {
      const updated = await tyreApi.removeTyresBulk(
        truck.id,
        fitments.map((f) => f.id),
        odometer,
        bulkDate,
        bulkRemark.trim(),
      );
      setFitmentRecords((prev) => prev.map((f) => updated.find((u) => u.id === f.id) ?? f));
      setSelectedSet(new Set());
      setSelectMode(false);
      setBulkOpen(false);
      showSuccess(`${updated.length} tyre${updated.length !== 1 ? "s" : ""} removed from ${truck.registrationNumber}.`);
    } catch (err: any) {
      setError(err.message || "Failed to remove tyres.");
      showError(err.message || "Failed to remove tyres.");
    } finally {
      setBulkSaving(false);
    }
  }

  // Label for a position in the custom swap: its tyre number, or "empty".
  function positionLabel(position: string): string {
    const fitment = getFitmentForPosition(truck!.id, position, fitmentRecords);
    if (!fitment) return `${position} (empty)`;
    const tyre = tyres.find((t) => t.id === fitment.tyreId);
    return `${position} (${tyre?.tyreNumber ?? "tyre"})`;
  }

  function toggleCustomSwap() {
    setCustomSwap((v) => !v);
    setPickA(null);
    setPickB(null);
    setError("");
  }

  function pickCustomPosition(position: string) {
    setError("");
    if (position === pickA) {
      // Clicking the first pick removes it; the second pick (if any) becomes the first.
      setPickA(pickB);
      setPickB(null);
      return;
    }
    if (position === pickB) {
      setPickB(null);
      return;
    }
    if (!pickA) {
      setPickA(position);
      return;
    }
    // Two empty positions have nothing to swap.
    if (!filledPositions.has(pickA) && !filledPositions.has(position)) {
      setError("Pick at least one position that has a tyre.");
      return;
    }
    setPickB(position);
  }

  function continueCustomSwap() {
    if (!pickA || !pickB) return;
    openConfirm([[pickA, pickB]], `Swap ${positionLabel(pickA)} ↔ ${positionLabel(pickB)}`);
  }

  function openConfirm(pairs: [string, string][], description: string) {
    setSwapOdometer(truck?.odometer ?? "");
    setSwapDate(todayIst());
    setSwapRemark("Tyre Rotation");
    setSwapStep({ step: "confirm", pairs, description });
  }

  async function executeSwaps() {
    if (!truck || swapStep?.step !== "confirm") return;
    const odometer = Number(swapOdometer);
    if (!swapOdometer || Number.isNaN(odometer) || odometer < 0) {
      showError("Enter a valid odometer reading.");
      return;
    }
    if (!swapDate) {
      showError("Select a date for this rotation.");
      return;
    }
    if (!swapRemark.trim()) {
      showError("A remark is required.");
      return;
    }
    setSwapping(true);
    try {
      const affected = await tyreApi.swapPositions(truck.id, swapStep.pairs, odometer, swapRemark.trim(), swapDate);
      if (affected.length > 0) {
        setFitmentRecords((prev) => {
          const affectedMap = new Map(affected.map((f) => [f.id, f]));
          const existingIds = new Set(prev.map((f) => f.id));
          const updated = prev.map((f) => affectedMap.has(f.id) ? affectedMap.get(f.id)! : f);
          const brandNew = affected.filter((f) => !existingIds.has(f.id));
          return [...updated, ...brandNew];
        });
      }
      setSwapStep(null);
      setSelectedPosition(null);
      setCustomSwap(false);
      setPickA(null);
      setPickB(null);
      showSuccess("Tyre positions swapped and history updated successfully.");
    } catch (err: any) {
      showError(err.message || "Failed to swap tyre positions.");
    } finally {
      setSwapping(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Manage Tyres — ${truck.registrationNumber}`}
      className="max-w-4xl"
      headerRight={
        tyreTypePills.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {tyreTypePills.map(([label, count]) => (
              <span
                key={label}
                className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700"
              >
                {label}-{count}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[11px] font-medium text-gray-400 italic">No tyres configured</span>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {layout ? (
          <>
            <TyreLayoutDiagram
              layout={layout}
              filledPositions={filledPositions}
              onPositionClick={rotationActive ? undefined : (customSwap ? pickCustomPosition : selectMode ? togglePosition : setSelectedPosition)}
              selectedPosition={customSwap ? pickA : selectedPosition}
              selectedPositions={customSwap ? new Set<string>(pickB ? [pickB] : []) : selectedSet}
              animatingPosition={animatingPosition}
            />
            {rotationActive && (
              <p className="text-xs italic text-gray-400">
                Finish or cancel the tyre rotation below before selecting a position.
              </p>
            )}

            {/* ── Bulk removal ────────────────────────────────────────────── */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Bulk Removal</p>
                <button
                  type="button"
                  disabled={rotationActive || !!selectedPosition || bulkOpen || bulkSaving || customSwap}
                  onClick={() => {
                    setSelectMode((v) => !v);
                    setSelectedSet(new Set());
                    setBulkOpen(false);
                  }}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    selectMode
                      ? "border-gray-400 bg-white text-gray-700 hover:bg-gray-100"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100",
                    (rotationActive || !!selectedPosition || bulkOpen || bulkSaving) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {selectMode ? "Exit select mode" : "Select tyres"}
                </button>
              </div>

              {selectMode && !bulkOpen && (
                <>
                  <p className="text-xs text-gray-500">
                    Click fitted tyre positions to select them. Select none to remove all {activeFitments.length} tyre{activeFitments.length !== 1 ? "s" : ""} on this truck.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-700">{selectedSet.size} selected</span>
                    <button
                      type="button"
                      onClick={() => setSelectedSet(new Set())}
                      disabled={selectedSet.size === 0}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-40"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={openBulkRemove}
                      disabled={activeFitments.length === 0 || bulkSaving}
                      className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
                    >
                      {selectedSet.size > 0
                        ? `Remove ${selectedSet.size} selected`
                        : `Remove all ${activeFitments.length} tyre${activeFitments.length !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </>
              )}

              {bulkOpen && (
                <div className="rounded-md border border-red-200 bg-white p-4 flex flex-col gap-3">
                  <p className="text-xs font-semibold text-red-800">
                    {selectedSet.size > 0
                      ? `Remove ${selectedSet.size} tyre${selectedSet.size !== 1 ? "s" : ""} from ${truck.registrationNumber}`
                      : `Remove all ${activeFitments.length} tyre${activeFitments.length !== 1 ? "s" : ""} from ${truck.registrationNumber}`}
                  </p>
                  <p className="text-xs text-gray-600">
                    Positions: {(selectedSet.size > 0 ? activeFitments.filter((f) => selectedSet.has(f.position)) : activeFitments)
                      .map((f) => f.position).join(", ")}
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-700">Odometer at Removal (km) *</label>
                      <input
                        type="number"
                        min="0"
                        value={bulkOdometer}
                        onChange={(e) => setBulkOdometer(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-700">Date of Removal *</label>
                      <DatePickerInput
                        required
                        value={bulkDate}
                        onChange={setBulkDate}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700">Remark *</label>
                    <input
                      type="text"
                      value={bulkRemark}
                      onChange={(e) => setBulkRemark(e.target.value)}
                      placeholder="e.g. Worn out, end of life"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                    />
                  </div>
                  {selectedSet.size === 0 && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-red-700">
                        Type {truck.registrationNumber} to confirm removing all tyres *
                      </label>
                      <input
                        type="text"
                        value={bulkConfirmText}
                        onChange={(e) => setBulkConfirmText(e.target.value)}
                        className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                      />
                    </div>
                  )}
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeBulkRemove}
                      disabled={bulkSaving}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmBulkRemove}
                      disabled={bulkSaving}
                      className="rounded-md bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {bulkSaving ? "Removing…" : "Confirm removal"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">No tyre layout has been set for this truck.</p>
        )}

        {/* ── Fitted tyres: km run and range use ──────────────────────── */}
        {layout && tyreRows.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setFittedOpen((v) => !v)}
                aria-expanded={fittedOpen}
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700 transition-colors"
              >
                {fittedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Fitted Tyres ({tyreRows.length})
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => exportTyres("xlsx")}
                  className="rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={() => exportTyres("pdf")}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Export PDF
                </button>
              </div>
            </div>
            {fittedOpen && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    {["Position", "Tyre", "Brand / Size", "Fitted On", "Km Run", "% of Range", ""].map((h) => (
                      <th key={h} className="px-2 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tyreRows.map((r) => {
                    const pct = r.pctOfRange;
                    const warning =
                      pct == null ? null
                        : pct >= 100 ? { text: "Past range", cls: "bg-red-50 text-red-700" }
                        : pct >= 90 ? { text: "Near range", cls: "bg-amber-50 text-amber-700" }
                        : null;
                    return (
                      <tr key={r.fitment.id} className="border-b border-gray-100 text-gray-700">
                        <td className="px-2 py-2 font-medium">{r.fitment.position}</td>
                        <td className="px-2 py-2">{r.tyre?.tyreNumber ?? "—"}</td>
                        <td className="px-2 py-2">{[r.tyre?.brand, r.tyre?.size].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-2 py-2">{r.fitment.fittedDate ? formatDate(r.fitment.fittedDate) : "—"}</td>
                        <td className="px-2 py-2">{r.kmRun.toLocaleString()} km</td>
                        <td className="px-2 py-2">
                          {pct == null ? "—" : (
                            <span className="inline-flex items-center gap-1.5">
                              {pct.toFixed(0)}%
                              {warning && (
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", warning.cls)}>
                                  {warning.text}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => setDataTyreId(r.fitment.tyreId)}
                            className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            View Tyre Data
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
            <TyreDataDialog tyreId={dataTyreId} onClose={() => setDataTyreId(null)} />
          </div>
        )}

        {/* ── Tyre Rotation / Swap Buttons ──────────────────────────────── */}
        {layout && (() => {
          const axleEntries = buildAxleEntries(layout);
          const dualAxles = axleEntries.filter((a) => a.wheelsPerSide === 2);
          const isSelectingAxle = swapStep?.step === "select-axle";
          const isSelectingSide = swapStep?.step === "select-side";
          const isConfirming = swapStep?.step === "confirm";

          return (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Tyre Rotation</p>
              {!!selectedPosition && !isConfirming && (
                <p className="text-xs italic text-gray-400">
                  Close the tyre position panel below before starting a rotation.
                </p>
              )}

              {/* Step 1 — main action buttons */}
              {!isConfirming && !isSelectingSide && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={swapping || !!selectedPosition || customSwap}
                    onClick={() => {
                      const allPairs = axleEntries.flatMap(getLRSwapPairs);
                      openConfirm(allPairs, "Swap Left ↔ Right across all axles");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" /> Swap Left ↔ Right (All Axles)
                  </button>

                  <button
                    type="button"
                    disabled={swapping || !!selectedPosition || customSwap}
                    onClick={() => setSwapStep(
                      isSelectingAxle && swapStep.type === "lr" ? null : { step: "select-axle", type: "lr" }
                    )}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      isSelectingAxle && swapStep.type === "lr"
                        ? "border-blue-500 bg-blue-600 text-white"
                        : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100",
                      (swapping || !!selectedPosition) && "opacity-50"
                    )}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" /> Swap Left ↔ Right (Selected Axle)
                  </button>

                  <button
                    type="button"
                    disabled={swapping || !!selectedPosition || customSwap || dualAxles.length === 0}
                    onClick={() => setSwapStep(
                      isSelectingAxle && swapStep.type === "io" ? null : { step: "select-axle", type: "io" }
                    )}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      isSelectingAxle && swapStep.type === "io"
                        ? "border-purple-500 bg-purple-600 text-white"
                        : "border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100",
                      (swapping || !!selectedPosition || dualAxles.length === 0) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" /> Swap Inner ↔ Outer Tyres
                  </button>

                  <button
                    type="button"
                    disabled={swapping || !!selectedPosition || selectMode || rotationActive}
                    onClick={toggleCustomSwap}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      customSwap
                        ? "border-amber-500 bg-amber-600 text-white"
                        : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
                      (swapping || !!selectedPosition || selectMode || rotationActive) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" /> {customSwap ? "Cancel Custom Swap" : "Custom Swap (Pick Positions)"}
                  </button>
                </div>
              )}

              {/* Custom swap — pick two positions on the diagram */}
              {customSwap && !isConfirming && (
                <div className="rounded-md border border-amber-200 bg-white p-3 flex flex-col gap-2">
                  {!pickA && (
                    <p className="text-xs font-medium text-gray-600">Click the first position on the diagram (filled or empty, including the spare).</p>
                  )}
                  {pickA && !pickB && (
                    <p className="text-xs font-medium text-gray-600">
                      First: <span className="font-semibold text-gray-900">{positionLabel(pickA)}</span>. Now click the second position.
                    </p>
                  )}
                  {pickA && pickB && (
                    <>
                      <p className="text-xs font-medium text-gray-600">
                        <span className="font-semibold text-gray-900">{positionLabel(pickA)}</span>
                        {" ↔ "}
                        <span className="font-semibold text-gray-900">{positionLabel(pickB)}</span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={continueCustomSwap}
                          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
                        >
                          Continue to confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPickA(null); setPickB(null); setError(""); }}
                          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
                        >
                          Change
                        </button>
                      </div>
                    </>
                  )}
                  {error && <p className="text-xs text-red-600">{error}</p>}
                </div>
              )}

              {/* Step 2 — axle picker */}
              {isSelectingAxle && (
                <div className="rounded-md border border-gray-200 bg-white p-3 flex flex-col gap-2">
                  <p className="text-xs font-medium text-gray-600">
                    {swapStep.type === "lr"
                      ? "Select axle to swap Left ↔ Right:"
                      : "Select dual-wheel axle to swap Inner ↔ Outer:"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(swapStep.type === "lr" ? axleEntries : dualAxles).map((entry) => (
                      <button
                        key={entry.axleLabel}
                        type="button"
                        onClick={() => {
                          if (swapStep.type === "io") {
                            setSwapStep({ step: "select-side", type: "io", entry });
                            return;
                          }
                          openConfirm(getLRSwapPairs(entry), `Swap Left ↔ Right on ${entry.displayLabel}`);
                        }}
                        className="rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                      >
                        {entry.displayLabel}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSwapStep(null)}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2b — inner/outer: choose Left, Right or both sides of the axle */}
              {isSelectingSide && swapStep.step === "select-side" && (
                <div className="rounded-md border border-gray-200 bg-white p-3 flex flex-col gap-2">
                  <p className="text-xs font-medium text-gray-600">
                    Swap Inner ↔ Outer on {swapStep.entry.displayLabel} — which side?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(["Left", "Right", "Both"] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => openConfirm(
                          getIOSwapPairs(swapStep.entry, side),
                          `Swap Inner ↔ Outer on ${swapStep.entry.displayLabel} — ${side === "Both" ? "both sides" : `${side} side`}`
                        )}
                        className="rounded-md border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                      >
                        {side === "Both" ? "Both sides" : `${side} side`}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSwapStep({ step: "select-axle", type: "io" })}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setSwapStep(null)}
                      className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3 — odometer + remark confirm form */}
              {isConfirming && (
                <div className="rounded-md border border-blue-200 bg-blue-50/40 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-blue-800">{swapStep.description}</p>
                    <span className="text-[10px] text-blue-500 font-medium">
                      {swapStep.pairs.length} position pair{swapStep.pairs.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Odometer + Date */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-700">Odometer at Rotation (km) *</label>
                      <input
                        type="number"
                        min="0"
                        value={swapOdometer}
                        onChange={(e) => setSwapOdometer(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="Current truck odometer reading"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-700">Date of Rotation *</label>
                      <DatePickerInput
                        required
                        value={swapDate}
                        onChange={setSwapDate}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  {/* Remark quick chips */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-gray-700">Remark *</label>
                    <div className="flex flex-wrap gap-1.5">
                      {presetsFor("Swap").map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setSwapRemark(r)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                            swapRemark === r
                              ? "border-blue-500 bg-blue-100 text-blue-800"
                              : "border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={swapRemark}
                      onChange={(e) => setSwapRemark(e.target.value)}
                      placeholder="Or type a custom remark…"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSwapStep(null)}
                      disabled={swapping}
                      className="flex-1 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={executeSwaps}
                      disabled={swapping || !swapOdometer || !swapDate || !swapRemark.trim()}
                      className="flex-[2] rounded-lg bg-blue-600 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {swapping ? "Swapping…" : "Confirm Swap & Update History"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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
                      <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700">
                        {attachedTyre.tyreType || "Unknown"}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3 rounded-lg border border-red-100 bg-red-50/30 p-3">
                      <h4 className="text-sm font-medium text-gray-900">Remove Tyre</h4>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-gray-700">Removal Odometer</label>
                          <DecimalInput type="number"
                            min="0"
                            value={odometerInput}
                            onChange={(e) => setOdometerInput(e.target.value)}
                            placeholder="Odometer reading at removal (km)"
                            className={inputClass}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-gray-700">Total Distance Covered</label>
                          <input
                            type="text"
                            readOnly
                            disabled
                            value={
                              odometerInput && !Number.isNaN(Number(odometerInput)) && Number(odometerInput) >= fitment.fittedOdometer
                                ? `${(Number(odometerInput) - fitment.fittedOdometer).toLocaleString()} km`
                                : "—"
                            }
                            className={cn(inputClass, "cursor-not-allowed bg-gray-50 text-gray-500")}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-gray-700">Date of Removal</label>
                          <DatePickerInput
                            required
                            value={actionDate}
                            onChange={setActionDate}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {presetsFor("Removal").map((remark) => (
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
                        disabled={!removalRemark.trim() || !actionDate}
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
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 bg-blue-100 text-blue-700">
                                    {t.tyreType || "Unknown"}
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
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 mt-1">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-gray-700">Odometer at Fitment (km)</label>
                          <DecimalInput type="number"
                            min="0"
                            value={odometerInput}
                            onChange={(e) => setOdometerInput(e.target.value)}
                            placeholder="Current truck odometer"
                            className={inputClass}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-gray-700">Date of Fitment</label>
                          <DatePickerInput
                            required
                            value={actionDate}
                            onChange={setActionDate}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-gray-700">Remarks (optional)</label>
                        <div className="flex flex-wrap gap-1.5">
                          {presetsFor("Attachment").map((remark) => (
                            <button
                              key={remark}
                              type="button"
                              onClick={() => setAttachRemark(remark)}
                              className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-xs text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                            >
                              <Plus className="h-3 w-3" />
                              {remark}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={attachRemark}
                          onChange={(e) => setAttachRemark(e.target.value)}
                          placeholder="Remark for this fitment (optional) — e.g. New tyre fitted"
                          rows={2}
                          className={cn(inputClass, "resize-none")}
                        />
                      </div>
                      {error && <p className="text-xs text-red-600">{error}</p>}
                      <button
                        type="button"
                        onClick={confirmAttach}
                        disabled={!actionDate}
                        className="mt-2 w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
