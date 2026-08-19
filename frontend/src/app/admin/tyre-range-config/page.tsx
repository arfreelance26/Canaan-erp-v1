"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleDot, Plus, X, Check, Loader2, Trash2 } from "lucide-react";
import { tyreRangeConfigApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const DEFAULT_TYPES = ["RADIAL", "TUBELESS", "NYLON", "RETREADED"];

const PALETTE = [
  { icon: "bg-blue-100 text-blue-700",    badge: "bg-blue-50 border-blue-200 text-blue-700" },
  { icon: "bg-violet-100 text-violet-700", badge: "bg-violet-50 border-violet-200 text-violet-700" },
  { icon: "bg-amber-100 text-amber-700",  badge: "bg-amber-50 border-amber-200 text-amber-700" },
  { icon: "bg-emerald-100 text-emerald-700", badge: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  { icon: "bg-rose-100 text-rose-700",    badge: "bg-rose-50 border-rose-200 text-rose-700" },
  { icon: "bg-cyan-100 text-cyan-700",    badge: "bg-cyan-50 border-cyan-200 text-cyan-700" },
  { icon: "bg-orange-100 text-orange-700", badge: "bg-orange-50 border-orange-200 text-orange-700" },
  { icon: "bg-teal-100 text-teal-700",    badge: "bg-teal-50 border-teal-200 text-teal-700" },
];

function colorFor(index: number) {
  return PALETTE[index % PALETTE.length];
}

function AddTyreTypeDialog({
  existing,
  onAdd,
  onClose,
}: {
  existing: string[];
  onAdd: (name: string, baseCost: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [baseCost, setBaseCost] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit() {
    const name = value.trim().toUpperCase();
    if (!name) { setError("Tyre type name cannot be empty."); return; }
    if (existing.includes(name)) { setError(`"${name}" already exists.`); return; }
    onAdd(name, baseCost);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Plus className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-gray-900">Add Tyre Type</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Tyre Type Name</label>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="e.g. BIAS-PLY"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-800 uppercase outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
            />
            {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
            <p className="mt-1.5 text-[11px] text-gray-400">Name will be saved in uppercase automatically.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Base Tyre Cost (₹)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">₹</span>
              <input
                type="number"
                min="0"
                value={baseCost}
                onChange={(e) => setBaseCost(e.target.value)}
                placeholder="e.g. 12000"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-7 pr-3 text-sm font-semibold text-gray-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">
              Add
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function TyreRangeConfigPage() {
  const { user } = useAuth();
  const [tyreTypes, setTyreTypes] = useState<string[]>([]);
  const [ranges, setRanges] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    tyreRangeConfigApi.list().then((rows) => {
      if (rows.length === 0) {
        setTyreTypes(DEFAULT_TYPES);
        setRanges(Object.fromEntries(DEFAULT_TYPES.map((t) => [t, ""])));
        setCosts(Object.fromEntries(DEFAULT_TYPES.map((t) => [t, ""])));
      } else {
        const types = rows.map((r) => r.tyre_type);
        setTyreTypes(types);
        setRanges(Object.fromEntries(rows.map((r) => [r.tyre_type, r.range_km != null ? String(r.range_km) : ""])));
        setCosts(Object.fromEntries(rows.map((r) => [r.tyre_type, r.base_tyre_cost != null ? String(r.base_tyre_cost) : ""])));
      }
    }).catch(() => {
      setTyreTypes(DEFAULT_TYPES);
      setRanges(Object.fromEntries(DEFAULT_TYPES.map((t) => [t, ""])));
      setCosts(Object.fromEntries(DEFAULT_TYPES.map((t) => [t, ""])));
    });
  }, []);

  function calcCostPerKm(cost: string, range: string): number | null {
    const c = parseFloat(cost);
    const r = parseFloat(range);
    return c > 0 && r > 0 ? c / r : null;
  }

  function triggerSave(currentTypes: string[], currentRanges: Record<string, string>, currentCosts: Record<string, string>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      const configs = currentTypes.map((t) => ({
        tyre_type: t,
        range_km: currentRanges[t] !== "" ? Number(currentRanges[t]) : null,
        base_tyre_cost: currentCosts[t] !== "" ? Number(currentCosts[t]) : null,
        base_cost_per_km: calcCostPerKm(currentCosts[t] ?? "", currentRanges[t] ?? ""),
      }));
      try { await tyreRangeConfigApi.save(configs); } catch {}
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 700);
  }

  function updateRange(tyreType: string, value: string) {
    const newRanges = { ...ranges, [tyreType]: value };
    setRanges(newRanges);
    triggerSave(tyreTypes, newRanges, costs);
  }

  function updateCost(tyreType: string, value: string) {
    const newCosts = { ...costs, [tyreType]: value };
    setCosts(newCosts);
    triggerSave(tyreTypes, ranges, newCosts);
  }

  function handleAddType(name: string, baseCost: string) {
    const newTypes = [...tyreTypes, name];
    const newRanges = { ...ranges, [name]: "" };
    const newCosts = { ...costs, [name]: baseCost };
    setTyreTypes(newTypes);
    setRanges(newRanges);
    setCosts(newCosts);
    setShowAdd(false);
    triggerSave(newTypes, newRanges, newCosts);
  }

  async function handleDelete(tyreType: string) {
    try {
      await tyreRangeConfigApi.delete(tyreType);
    } catch {}
    setTyreTypes((prev) => prev.filter((t) => t !== tyreType));
    setRanges((prev) => { const next = { ...prev }; delete next[tyreType]; return next; });
    setCosts((prev) => { const next = { ...prev }; delete next[tyreType]; return next; });
    setConfirmDelete(null);
  }

  if (user && user.softwareDesignation !== "Admin") return null;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tyre Range Configuration</h1>
          <p className="mt-1 text-sm text-gray-500">
            Set the expected kilometre range for each tyre type. Changes save automatically.
          </p>
        </div>

        <div className="flex items-center gap-3 mt-1">
          {/* Auto-save status */}
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Tyre Type
          </button>
        </div>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-3">
        {tyreTypes.map((tyreType, idx) => {
          const colors = colorFor(idx);
          const isConfirming = confirmDelete === tyreType;
          return (
            <div
              key={tyreType}
              className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Icon */}
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}>
                <CircleDot className="h-5 w-5" />
              </div>

              {/* Name + badge */}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">{tyreType}</p>
                  <p className="text-[11px] text-gray-400">Tyre Type</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${colors.badge}`}>
                  {tyreType}
                </span>
              </div>

              {/* Expected Range input */}
              <div className="shrink-0 w-52">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Expected Range</p>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 80000"
                    value={ranges[tyreType] ?? ""}
                    onChange={(e) => updateRange(tyreType, e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-3 pr-10 text-sm font-semibold text-gray-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">
                    km
                  </span>
                </div>
              </div>

              {/* Base Tyre Cost input */}
              <div className="shrink-0 w-52">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Base Tyre Cost</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">₹</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 12000"
                    value={costs[tyreType] ?? ""}
                    onChange={(e) => updateCost(tyreType, e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-7 pr-3 text-sm font-semibold text-gray-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                  />
                </div>
              </div>

              {/* Base Cost Per KM — auto-calculated, read-only */}
              <div className="shrink-0 w-48">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Base Cost Per KM</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">₹</span>
                  <input
                    type="text"
                    readOnly
                    value={(() => {
                      const v = calcCostPerKm(costs[tyreType] ?? "", ranges[tyreType] ?? "");
                      return v != null ? v.toFixed(4) : "";
                    })()}
                    placeholder="Auto-calculated"
                    className="w-full rounded-lg border border-gray-100 bg-gray-100 py-2 pl-7 pr-3 text-sm font-semibold text-gray-500 outline-none cursor-default"
                  />
                </div>
              </div>

              {/* Delete / confirm */}
              <div className="shrink-0">
                {isConfirming ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-red-500">Delete?</span>
                    <button
                      type="button"
                      title="Confirm"
                      onClick={() => handleDelete(tyreType)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Cancel"
                      onClick={() => setConfirmDelete(null)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    title="Delete tyre type"
                    onClick={() => setConfirmDelete(tyreType)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 hover:border-red-300 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <AddTyreTypeDialog
          existing={tyreTypes}
          onAdd={handleAddType}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
