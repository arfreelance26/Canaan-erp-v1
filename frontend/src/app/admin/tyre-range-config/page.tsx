"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RiRecordCircleLine as CircleDot, RiAddLine as Plus, RiCloseLine as X, RiCheckLine as Check, RiLoader4Line as Loader2, RiDeleteBinLine as Trash2, RiHistoryLine as History, RiSave3Line as Save } from "@remixicon/react";
import { tyreRangeConfigApi, type TyreRangeConfigEditEventRow } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog } from "@/components/ui/Dialog";
import { PillSearch } from "@/components/ui/PillSearch";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
const EDIT_EVENT_ICON: Record<TyreRangeConfigEditEventRow["event"], typeof Save> = {
  "Tyre Range Config Saved": Save,
  "Tyre Type Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<TyreRangeConfigEditEventRow["event"], string> = {
  "Tyre Range Config Saved": "bg-warning-surface-strong text-warning-text",
  "Tyre Type Deleted": "bg-danger-surface-strong text-danger-text",
};

const DEFAULT_TYPES = ["RADIAL", "TUBELESS", "NYLON", "RETREADED"];

const PALETTE = [
  { icon: "bg-accent-surface-strong text-accent-text",    badge: "bg-accent-surface border-accent-border text-accent-text" },
  { icon: "bg-purple-surface-strong text-purple-text", badge: "bg-purple-surface border-purple-border text-purple-text" },
  { icon: "bg-warning-surface-strong text-warning-text",  badge: "bg-warning-surface border-warning-border text-warning-text" },
  { icon: "bg-success-surface-strong text-success-text", badge: "bg-success-surface border-success-border text-success-text" },
  { icon: "bg-danger-surface-strong text-danger-text",    badge: "bg-danger-surface border-danger-border text-danger-text" },
  { icon: "bg-teal-surface-strong text-teal-text",    badge: "bg-teal-surface border-teal-border text-teal-text" },
  { icon: "bg-orange-surface-strong text-orange-text", badge: "bg-orange-surface border-orange-border text-orange-text" },
  { icon: "bg-teal-surface-strong text-teal-text",    badge: "bg-teal-surface border-teal-border text-teal-text" },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-background-primary-default shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-separator-border bg-fill-1 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-solid text-on-solid">
              <Plus className="h-4 w-4" />
            </div>
            <h2 className="text-body-semibold text-text-primary">Add Tyre Type</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-fill-3 hover:text-text-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-caption-1-semibold text-text-secondary">Tyre Type Name</label>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="e.g. BIAS-PLY"
              className="w-full rounded-lg border border-separator-border bg-fill-1 px-3 py-2.5 text-body-semibold text-text-primary uppercase outline-none focus:border-accent-border-strong focus:bg-background-primary-default focus:ring-2 focus:ring-accent-border transition"
            />
            {error && <p className="mt-1.5 text-xs text-danger-text">{error}</p>}
            <p className="mt-1.5 text-[11px] text-text-tertiary">Name will be saved in uppercase automatically.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-caption-1-semibold text-text-secondary">Base Tyre Cost (₹)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-semibold text-text-tertiary">₹</span>
              <input
                type="number"
                min="0"
                value={baseCost}
                onChange={(e) => setBaseCost(e.target.value)}
                placeholder="e.g. 12000"
                className="w-full rounded-lg border border-separator-border bg-fill-1 py-2.5 pl-7 pr-3 text-body-semibold text-text-primary outline-none focus:border-accent-border-strong focus:bg-background-primary-default focus:ring-2 focus:ring-accent-border transition"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="flex h-10 items-center whitespace-nowrap rounded-full border border-separator-border bg-background-primary-default px-6 text-body-medium text-text-secondary shadow-sm transition duration-300 hover:shadow-md">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} className="flex h-10 items-center whitespace-nowrap rounded-full bg-accent-solid px-6 text-body-semibold text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md disabled:pointer-events-none disabled:opacity-50">
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
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const { user } = useAuth();
  const [tyreTypes, setTyreTypes] = useState<string[]>([]);
  const [ranges, setRanges] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<TyreRangeConfigEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");
  const [search, setSearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    tyreRangeConfigApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

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
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-border bg-purple-surface text-purple-text shadow-sm">
            <CircleDot className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Tyre Range Configuration</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Set the expected kilometre range for each tyre type. Changes save automatically.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-1">
          {/* Auto-save status */}
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
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add Tyre Type
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search tyre types..." value={search} onChange={setSearch} />
      </div>

      {search.trim() && !tyreTypes.some((t) => t.toLowerCase().includes(search.trim().toLowerCase())) && (
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-10 text-center text-sm text-text-tertiary">
          No results match &ldquo;{search}&rdquo;.
        </div>
      )}

      {/* Rows */}
      <div className="flex flex-col gap-3">
        {tyreTypes.map((tyreType, idx) => {
          // Skipped rather than filtered out first, so each type keeps its colour.
          if (search.trim() && !tyreType.toLowerCase().includes(search.trim().toLowerCase())) return null;
          const colors = colorFor(idx);
          const isConfirming = confirmDelete === tyreType;
          return (
            <div
              key={tyreType}
              className="flex items-center gap-4 rounded-xl border border-separator-border bg-background-primary-default px-5 py-4 shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Icon */}
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}>
                <CircleDot className="h-5 w-5" />
              </div>

              {/* Name + badge */}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0">
                  <p className="text-body-semibold text-text-primary">{tyreType}</p>
                  <p className="text-[11px] text-text-tertiary">Tyre Type</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-caption-2-semibold ${colors.badge}`}>
                  {tyreType}
                </span>
              </div>

              {/* Expected Range input */}
              <div className="shrink-0 w-52">
                <p className="mb-1 text-caption-2-semibold text-text-tertiary">Expected Range</p>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 80000"
                    value={ranges[tyreType] ?? ""}
                    onChange={(e) => updateRange(tyreType, e.target.value)}
                    className="w-full rounded-lg border border-separator-border bg-fill-1 py-2 pl-3 pr-10 text-body-semibold text-text-primary outline-none focus:border-accent-border-strong focus:bg-background-primary-default focus:ring-2 focus:ring-accent-border transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption-2-semibold text-text-tertiary">
                    km
                  </span>
                </div>
              </div>

              {/* Base Tyre Cost input */}
              <div className="shrink-0 w-52">
                <p className="mb-1 text-caption-2-semibold text-text-tertiary">Base Tyre Cost</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-semibold text-text-tertiary">₹</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 12000"
                    value={costs[tyreType] ?? ""}
                    onChange={(e) => updateCost(tyreType, e.target.value)}
                    className="w-full rounded-lg border border-separator-border bg-fill-1 py-2 pl-7 pr-3 text-body-semibold text-text-primary outline-none focus:border-accent-border-strong focus:bg-background-primary-default focus:ring-2 focus:ring-accent-border transition"
                  />
                </div>
              </div>

              {/* Base Cost Per KM — auto-calculated, read-only */}
              <div className="shrink-0 w-48">
                <p className="mb-1 text-caption-2-semibold text-text-tertiary">Base Cost Per KM</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-body-semibold text-text-tertiary">₹</span>
                  <input
                    type="text"
                    readOnly
                    value={(() => {
                      const v = calcCostPerKm(costs[tyreType] ?? "", ranges[tyreType] ?? "");
                      return v != null ? v.toFixed(4) : "";
                    })()}
                    placeholder="Auto-calculated"
                    className="w-full rounded-lg border border-separator-border bg-fill-2 py-2 pl-7 pr-3 text-body-semibold text-text-secondary outline-none cursor-default"
                  />
                </div>
              </div>

              {/* Delete / confirm */}
              <div className="shrink-0">
                {isConfirming ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-caption-1-medium text-danger-text">Delete?</span>
                    <button
                      type="button"
                      title="Confirm"
                      onClick={() => handleDelete(tyreType)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-danger-surface-strong text-danger-text transition duration-200 hover:bg-danger-surface-strong"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Cancel"
                      onClick={() => setConfirmDelete(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-fill-2 text-text-secondary transition duration-200 hover:bg-fill-3"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    title="Delete tyre type"
                    onClick={() => setConfirmDelete(tyreType)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-danger-border bg-danger-surface text-danger-text transition duration-200 hover:border-danger-border-strong hover:bg-danger-surface-strong"
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

      {/* Edit History — every save/delete on Tyre Range Configuration ever
          logged, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by tyre type or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q || (ev.tyreType ?? "").toLowerCase().includes(q) || ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Tyre Type</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-text-primary">{ev.tyreType ?? <span className="text-text-tertiary">All types</span>}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    }}
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
