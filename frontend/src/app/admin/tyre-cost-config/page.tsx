"use client";

import { useEffect, useRef, useState } from "react";
import { trucksApi, tyreRangeConfigApi, tyreLayoutTypeConfigApi, type TyreLayoutTypeConfigEditEventRow } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { LayoutGrid, Info, CircleDot, Loader2, Check, DollarSign, History, Save } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Dialog } from "@/components/ui/Dialog";
import { PillSearch } from "@/components/ui/PillSearch";
import { formatDateTime } from "@/lib/format-date";

type TyreRangeRow = {
  tyre_type: string;
  base_cost_per_km: number | null;
};

function groupLayouts(trucks: Truck[]): string[] {
  const set = new Set<string>();
  for (const t of trucks) set.add(t.tyreLayout || "Unspecified");
  return [...set].sort((a, b) => a.localeCompare(b));
}

export default function TyreCostConfigPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const { user } = useAuth();
  const [layouts, setLayouts]       = useState<string[]>([]);
  const [tyreRows, setTyreRows]     = useState<TyreRangeRow[]>([]);
  const [quantities, setQuantities] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading]       = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const qtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<TyreLayoutTypeConfigEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    tyreLayoutTypeConfigApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
    Promise.all([
      trucksApi.list(),
      trucksApi.getBaseTyreCost(),
      tyreRangeConfigApi.list(),
      tyreLayoutTypeConfigApi.list(),
    ]).then(([trucks, _rows, rangeRows, qtyRows]) => {
      const ls = groupLayouts(trucks);
      setLayouts(ls);
      setTyreRows(rangeRows.map((r) => ({ tyre_type: r.tyre_type, base_cost_per_km: r.base_cost_per_km })));

      const qMap: Record<string, Record<string, string>> = {};
      for (const l of ls) qMap[l] = {};
      for (const q of qtyRows) {
        if (!qMap[q.tyre_layout]) qMap[q.tyre_layout] = {};
        qMap[q.tyre_layout][q.tyre_type] = q.quantity != null ? String(q.quantity) : "";
      }
      setQuantities(qMap);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function calcLayoutTotal(layout: string, qtyMap: Record<string, Record<string, string>>): number {
    let total = 0;
    for (const row of tyreRows) {
      const qtyStr = qtyMap[layout]?.[row.tyre_type] ?? "";
      const qty = qtyStr !== "" ? Number(qtyStr) : 0;
      const cpm = row.base_cost_per_km ?? 0;
      if (qty > 0 && cpm > 0) total += qty * cpm;
    }
    return total;
  }

  function updateQuantity(layout: string, tyreType: string, value: string) {
    const newQty = {
      ...quantities,
      [layout]: { ...(quantities[layout] ?? {}), [tyreType]: value },
    };
    setQuantities(newQty);

    if (qtyTimer.current) clearTimeout(qtyTimer.current);
    setSaveStatus("saving");
    qtyTimer.current = setTimeout(async () => {
      const qtyConfigs: { tyre_layout: string; tyre_type: string; quantity: number | null }[] = [];
      for (const [l, typeMap] of Object.entries(newQty)) {
        for (const [t, v] of Object.entries(typeMap)) {
          qtyConfigs.push({ tyre_layout: l, tyre_type: t, quantity: v !== "" ? Number(v) : null });
        }
      }

      const costPayload = layouts.map((l) => ({
        tyre_layout: l,
        cost: calcLayoutTotal(l, newQty) || null,
      }));

      try {
        await Promise.all([
          tyreLayoutTypeConfigApi.save(qtyConfigs),
          trucksApi.saveBaseTyreCost(costPayload),
        ]);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("idle");
      }
    }, 700);
  }

  if (user && user.softwareDesignation !== "Admin") return null;
  if (loading) return <PageSkeleton hasButton={false} hasSearch={false} columns={1} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white text-teal-600 shadow-sm">
            <DollarSign className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Tyre Cost Configuration</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Set tyre quantities per layout — Base Cost per KM is auto-calculated
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 mt-2">
          {/* Auto-save status */}
          <div className="h-6">
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
          </div>
          {isAdmin && (
<button
            type="button"
            onClick={openEditHistory}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-50"
          >
            <History className="h-4 w-4" />
            Edit History
          </button>
)}
        </div>
      </div>

      {/* Info note */}
      <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <div className="text-xs text-blue-800 space-y-1">
          <p className="font-bold">How this is used</p>
          <p>
            Enter how many tyres of each type are installed in the layout. The{" "}
            <span className="font-semibold">Base Cost (₹ / km)</span> is the sum of{" "}
            <span className="font-semibold">Quantity × Base Cost Per KM</span> across all tyre types —
            used by the <span className="font-semibold">Running Cost Calculator</span>.
          </p>
        </div>
      </div>

      {/* Layout cards */}
      {layouts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
          No tyre layouts found. Add trucks with a tyre layout first.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {layouts.map((layout) => {
            const totalCostPerKm = calcLayoutTotal(layout, quantities);

            return (
              <div
                key={layout}
                className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden"
              >
                {/* Card header — layout name + auto-calculated base cost */}
                <div className="flex items-center gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </div>
                  <span className="flex-1 text-sm font-bold text-gray-800">{layout}</span>

                  {/* Auto-calculated base cost per km */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Base Cost (₹ / km)
                    </span>
                    <div className="relative w-44">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">₹</span>
                      <input
                        type="text"
                        readOnly
                        value={totalCostPerKm > 0 ? totalCostPerKm.toFixed(4) : ""}
                        placeholder="Auto-calculated"
                        className="w-full rounded-lg border border-gray-100 bg-gray-100 py-2 pl-7 pr-10 text-sm font-semibold text-gray-500 outline-none cursor-default"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">/ km</span>
                    </div>
                  </div>
                </div>

                {/* Tyre types section */}
                {tyreRows.length > 0 && (
                  <div className="px-5 py-4">
                    <div className="mb-3 flex items-center gap-6">
                      <p className="w-36 text-[10px] font-bold uppercase tracking-wider text-gray-400">Tyre Type</p>
                      <p className="w-32 text-[10px] font-bold uppercase tracking-wider text-gray-400">Quantity</p>
                      <p className="w-48 text-[10px] font-bold uppercase tracking-wider text-gray-400">Cost Per KM</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      {tyreRows.map((row) => {
                        const qtyStr = quantities[layout]?.[row.tyre_type] ?? "";
                        const qty = qtyStr !== "" ? Number(qtyStr) : null;
                        const costPerKm =
                          qty != null && qty > 0 && row.base_cost_per_km != null && row.base_cost_per_km > 0
                            ? qty * row.base_cost_per_km
                            : null;

                        return (
                          <div key={row.tyre_type} className="flex items-center gap-6">
                            {/* Tyre type label */}
                            <div className="flex w-36 items-center gap-2">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                                <CircleDot className="h-3.5 w-3.5" />
                              </div>
                              <span className="text-xs font-semibold text-gray-700">{row.tyre_type}</span>
                            </div>

                            {/* Quantity input */}
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="0"
                              value={qtyStr}
                              onChange={(e) => updateQuantity(layout, row.tyre_type, e.target.value)}
                              className="w-32 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                            />

                            {/* Cost Per KM — auto-calculated */}
                            <div className="relative w-48">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">₹</span>
                              <input
                                type="text"
                                readOnly
                                value={costPerKm != null ? costPerKm.toFixed(4) : ""}
                                placeholder="—"
                                className="w-full rounded-lg border border-gray-100 bg-gray-100 py-1.5 pl-7 pr-10 text-sm font-semibold text-gray-500 outline-none cursor-default"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">/ km</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit History — every save of tyre quantities ever logged, in one
          searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-lg"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch || ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Action</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">By</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((ev) => (
                      <tr key={ev.id}>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            <Save className="h-3 w-3" /> {ev.event}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {ev.actorName}
                          {ev.actorRole && <span className="text-[11px] text-gray-400"> ({ev.actorRole})</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDateTime(ev.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
