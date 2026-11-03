"use client";

import { useEffect, useMemo, useState } from "react";
import { RiBuilding3Line as Factory, RiAddLine as Plus, RiPencilLine as Pencil, RiDeleteBinLine as Trash2, RiLoader4Line as Loader2, RiHistoryLine as History, RiDropLine as Droplets, RiMoneyRupeeCircleLine as IndianRupee } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { adblueApi, type AdBlueManufacturer, type AdBlueEditEventRow } from "@/lib/api";
import { confirmDelete, showError, showSuccess } from "@/lib/feedback";
import { Dialog } from "@/components/ui/Dialog";
import { PillSearch } from "@/components/ui/PillSearch";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";
import type { Truck } from "@/types/truck";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
const EDIT_EVENT_ICON: Record<AdBlueEditEventRow["event"], typeof Plus> = {
  "Manufacturer Created": Plus,
  "Manufacturer Edited": Pencil,
  "Manufacturer Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<AdBlueEditEventRow["event"], string> = {
  "Manufacturer Created": "bg-accent-surface-strong text-accent-text",
  "Manufacturer Edited": "bg-warning-surface-strong text-warning-text",
  "Manufacturer Deleted": "bg-danger-surface-strong text-danger-text",
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Active trucks — for the "N trucks" count on each manufacturer. */
  trucks: Truck[];
  /** After a manufacturer is added / edited / deleted. */
  onChanged?: () => void;
};

/** "Not set" for an empty / zero rate. */
export function manufacturerRate(m: Pick<AdBlueManufacturer, "defaultPricePerLitre"> | null | undefined): number | null {
  const n = parseFloat(m?.defaultPricePerLitre ?? "");
  return Number.isNaN(n) || n <= 0 ? null : n;
}

/**
 * Truck's Adblue History → Manufacturers: the list behind the Manufacturer
 * dropdown on the Add/Edit Truck form, and each manufacturer's AdBlue cost
 * per litre — the starting price when an AdBlue fill is logged for its trucks.
 */
export function TruckManufacturersDialog({ open, onClose, trucks, onChanged }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";

  const [manufacturers, setManufacturers] = useState<AdBlueManufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdBlueManufacturer | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<AdBlueEditEventRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setLoading(true);
    adblueApi.listManufacturers()
      .then(setManufacturers)
      .catch(() => showError("Could not load manufacturers."))
      .finally(() => setLoading(false));
  }, [open]);

  // How many active trucks use each manufacturer (trucks store the name).
  const truckCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of trucks) {
      const key = (t.manufacturer ?? "").trim().toLowerCase();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [trucks]);

  const q = search.trim().toLowerCase();
  const visible = manufacturers.filter((m) => !q || m.name.toLowerCase().includes(q));

  function openAdd() {
    setEditing(null);
    setName("");
    setPrice("");
    setDialogOpen(true);
  }

  function openEdit(m: AdBlueManufacturer) {
    setEditing(m);
    setName(m.name);
    setPrice(manufacturerRate(m) != null ? String(manufacturerRate(m)) : "");
    setDialogOpen(true);
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { showError("Manufacturer name is required."); return; }
    const rate = price.trim() === "" ? null : Number(price);
    if (rate != null && (Number.isNaN(rate) || rate < 0)) { showError("Enter a valid cost per litre."); return; }
    setSaving(true);
    try {
      if (editing) await adblueApi.updateManufacturer(editing.id, trimmed, rate);
      else await adblueApi.createManufacturer(trimmed, rate);
      setManufacturers(await adblueApi.listManufacturers());
      onChanged?.();
      setDialogOpen(false);
      showSuccess(editing ? "Manufacturer updated." : "Manufacturer added.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save manufacturer.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(m: AdBlueManufacturer) {
    const ok = await confirmDelete(`"${m.name}"`);
    if (!ok.isConfirmed) return;
    setDeletingId(m.id);
    try {
      await adblueApi.deleteManufacturer(m.id);
      setManufacturers((prev) => prev.filter((x) => x.id !== m.id));
      onChanged?.();
      showSuccess("Manufacturer deleted.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete manufacturer.");
    } finally {
      setDeletingId(null);
    }
  }

  function openHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    adblueApi.listEditEvents()
      .then(setHistoryEvents)
      .catch(() => setHistoryEvents([]))
      .finally(() => setHistoryLoading(false));
  }

  return (
    <>
    <Dialog open={open} onClose={onClose} title="Manufacturers" className="max-w-3xl">
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        The Manufacturer list used when adding or editing a truck, and each one&apos;s AdBlue cost per litre —
        the price an AdBlue fill starts with for its trucks, and the price behind their AdBlue cost per km
        (Running Cost Calculator and Profitability).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search manufacturers..." value={search} onChange={setSearch} />
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={openHistory}
              className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition-colors hover:bg-fill-2"
            >
              <History className="h-4 w-4" />
              Edit History
            </button>
          )}
          <button
            type="button"
            onClick={openAdd}
            className="flex h-9 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-4 text-body-medium text-on-solid shadow-sm transition-colors hover:bg-accent-solid-hover"
          >
            <Plus className="h-4 w-4" />
            Add Manufacturer
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-text-tertiary" /></div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-10 text-center text-sm text-text-tertiary">
          {manufacturers.length === 0
            ? <>No manufacturers yet. Click &ldquo;Add Manufacturer&rdquo; to create one.</>
            : <>No manufacturers match &ldquo;{search}&rdquo;.</>}
        </div>
      ) : (
        <div className="grid max-h-[55vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
          {visible.map((m) => {
            const count = truckCount.get(m.name.trim().toLowerCase()) ?? 0;
            const rate = manufacturerRate(m);
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-separator-border bg-background-primary-default px-4 py-3.5 shadow-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fill-2 text-text-secondary">
                  <Factory className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-semibold text-text-primary">{m.name}</p>
                  <p className="text-xs text-text-tertiary">{count} truck{count === 1 ? "" : "s"}</p>
                </div>
                <span
                  title="AdBlue cost per litre"
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-caption-2-semibold",
                    rate != null ? "bg-accent-surface text-accent-text ring-1 ring-accent-border" : "bg-fill-2 text-text-tertiary",
                  )}
                >
                  <Droplets className="h-3 w-3" />
                  {rate != null ? `₹${rate.toFixed(2)} / L` : "Rate not set"}
                </span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(m)}
                    aria-label={`Edit ${m.name}`}
                    className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-accent-surface-strong hover:text-accent-text"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(m)}
                    disabled={deletingId === m.id}
                    aria-label={`Delete ${m.name}`}
                    className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-danger-surface-strong hover:text-danger-text disabled:opacity-40"
                  >
                    {deletingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
    </Dialog>

      {/* Add / Edit */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editing ? "Edit Manufacturer" : "Add Manufacturer"} className="max-w-md">
        <form
          onSubmit={(e) => { e.preventDefault(); void handleSave(); }}
          className="flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-body-medium text-text-primary">Manufacturer Name <span className="text-danger-text">*</span></span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. TATA"
              className="h-10 rounded-xl border border-separator-border px-3 text-sm text-text-primary outline-none focus:border-accent-border-strong focus:ring-2 focus:ring-accent-border"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-body-medium text-text-primary">AdBlue Cost per Litre (₹)</span>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-tertiary">
                <IndianRupee className="h-4 w-4" />
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 92.00"
                className="h-10 w-full rounded-xl border border-separator-border pl-8 pr-3 text-sm text-text-primary outline-none [appearance:textfield] focus:border-accent-border-strong focus:ring-2 focus:ring-accent-border [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <span className="text-xs text-text-tertiary">
              Optional. Pre-fills Cost Per Litre when an AdBlue fill is logged for this manufacturer&apos;s trucks.
              Changing it never changes fills already saved.
            </span>
          </label>
          {editing && (
            <p className="text-xs text-text-tertiary">
              Trucks already saved with &ldquo;{editing.name}&rdquo; keep that name until they&rsquo;re edited.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-primary hover:bg-fill-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-lg bg-accent-solid px-4 py-2 text-body-semibold text-on-solid hover:bg-accent-solid-hover disabled:opacity-50"
            >
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Manufacturer"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Edit History */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="Edit History" className="sm:max-w-3xl">
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by manufacturer or actor…" value={historySearch} onChange={setHistorySearch} />
          {historyLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const hq = historySearch.toLowerCase();
            const filtered = historyEvents.filter((ev) =>
              !hq || ev.label.toLowerCase().includes(hq) || ev.actorName.toLowerCase().includes(hq)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={historyEvents.length === 0 ? "no-data" : "not-found"} title={historyEvents.length === 0 ? "No edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      {["Manufacturer", "Action", "By", "When"].map((h) => (
                        <th key={h} className="px-3 py-2 text-caption-2-semibold text-text-tertiary">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event] ?? Pencil;
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-text-primary">{ev.label}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{formatDateTime(ev.createdAt)}</td>
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
    </>
  );
}
