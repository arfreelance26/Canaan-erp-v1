"use client";

import { useEffect, useRef, useState } from "react";
import { trucksApi, tyreRangeConfigApi, tyreLayoutTypeConfigApi, type TyreLayoutTypeConfigEditEventRow } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { RiLayoutGridLine as LayoutGrid, RiInformationLine as Info, RiRecordCircleLine as CircleDot, RiLoader4Line as Loader2, RiCheckLine as Check, RiMoneyDollarCircleLine as DollarSign, RiHistoryLine as History, RiSave3Line as Save } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { Dialog } from "@/components/ui/Dialog";
import { PillSearch } from "@/components/ui/PillSearch";
import { formatDateTime } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
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
  // Matches a layout name (shows all its tyre types) or a tyre type.
  const [search, setSearch] = useState("");

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

  const q = search.trim().toLowerCase();
  const rowsFor = (layout: string) =>
    !q || layout.toLowerCase().includes(q) ? tyreRows : tyreRows.filter((r) => r.tyre_type.toLowerCase().includes(q));
  const visibleLayouts = layouts.filter((l) => !q || l.toLowerCase().includes(q) || rowsFor(l).length > 0);

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal-border bg-teal-surface text-teal-text shadow-sm">
            <DollarSign className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Tyre Cost Configuration</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Set tyre quantities per layout — Base Cost per KM is auto-calculated
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 mt-2">
          {/* Auto-save status */}
          <div className="h-6">
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1.5 text-caption-1-medium text-success-text">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>
          {isAdmin && (
<button
            type="button"
            onClick={openEditHistory}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
          >
            <History className="h-4 w-4" />
            Edit History
          </button>
)}
        </div>
      </div>

      {/* Info note */}
      <div className="flex gap-3 rounded-xl border border-accent-border bg-accent-surface px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
        <div className="text-xs text-accent-text-strong space-y-1">
          <p className="font-semibold">How this is used</p>
          <p>
            Enter how many tyres of each type are installed in the layout. The{" "}
            <span className="font-semibold">Base Cost (₹ / km)</span> is the sum of{" "}
            <span className="font-semibold">Quantity × Base Cost Per KM</span> across all tyre types —
            used by the <span className="font-semibold">Running Cost Calculator</span>.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search layouts or tyre types..." value={search} onChange={setSearch} />
      </div>

      {/* Layout cards */}
      {layouts.length > 0 && visibleLayouts.length === 0 ? (
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-10 text-center text-sm text-text-tertiary">
          No results match &ldquo;{search}&rdquo;.
        </div>
      ) : layouts.length === 0 ? (
        <EmptyState size="compact" illustration="logistics" title="No tyre layouts found" description="Add trucks with a tyre layout first" />
      ) : (
        <div className="flex flex-col gap-4">
          {visibleLayouts.map((layout) => {
            // The total always covers every tyre type, even when the search hides some rows.
            const totalCostPerKm = calcLayoutTotal(layout, quantities);

            return (
              <div
                key={layout}
                className="rounded-xl border border-separator-border bg-background-primary-default shadow-sm overflow-hidden"
              >
                {/* Card header — layout name + auto-calculated base cost */}
                <div className="flex items-center gap-4 border-b border-separator-border bg-fill-1 px-5 py-3.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface-strong text-accent-text">
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </div>
                  <span className="flex-1 text-body-semibold text-text-primary">{layout}</span>

                  {/* Auto-calculated base cost per km */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-caption-2-semibold text-text-tertiary">
                      Base Cost (₹ / km)
                    </span>
                    <div className="relative w-44">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-caption-2-semibold text-text-tertiary">₹</span>
                      <input
                        type="text"
                        readOnly
                        value={totalCostPerKm > 0 ? totalCostPerKm.toFixed(4) : ""}
                        placeholder="Auto-calculated"
                        className="w-full rounded-lg border border-separator-border bg-fill-2 py-2 pl-7 pr-10 text-body-semibold text-text-secondary outline-none cursor-default"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption-2-semibold text-text-tertiary">/ km</span>
                    </div>
                  </div>
                </div>

                {/* Tyre types section */}
                {rowsFor(layout).length > 0 && (
                  <div className="px-5 py-4">
                    <div className="mb-3 flex items-center gap-6">
                      <p className="w-36 text-caption-2-semibold text-text-tertiary">Tyre Type</p>
                      <p className="w-32 text-caption-2-semibold text-text-tertiary">Quantity</p>
                      <p className="w-48 text-caption-2-semibold text-text-tertiary">Cost Per KM</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      {rowsFor(layout).map((row) => {
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
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-fill-2 text-text-tertiary">
                                <CircleDot className="h-3.5 w-3.5" />
                              </div>
                              <span className="text-caption-1-semibold text-text-primary">{row.tyre_type}</span>
                            </div>

                            {/* Quantity input */}
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="0"
                              value={qtyStr}
                              onChange={(e) => updateQuantity(layout, row.tyre_type, e.target.value)}
                              className="w-32 rounded-lg border border-separator-border bg-fill-1 px-3 py-1.5 text-body-semibold text-text-primary outline-none focus:border-accent-border-strong focus:bg-background-primary-default focus:ring-2 focus:ring-accent-border transition"
                            />

                            {/* Cost Per KM — auto-calculated */}
                            <div className="relative w-48">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-caption-2-semibold text-text-tertiary">₹</span>
                              <input
                                type="text"
                                readOnly
                                value={costPerKm != null ? costPerKm.toFixed(4) : ""}
                                placeholder="—"
                                className="w-full rounded-lg border border-separator-border bg-fill-2 py-1.5 pl-7 pr-10 text-body-semibold text-text-secondary outline-none cursor-default"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption-2-semibold text-text-tertiary">/ km</span>
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
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch || ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => (
                      <tr key={ev.id}>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-2 py-0.5 text-caption-2-semibold text-warning-text">
                            <Save className="h-3 w-3" /> {ev.event}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">
                          {ev.actorName}
                          {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                      </tr>
                    )}
                  </PagedTbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
