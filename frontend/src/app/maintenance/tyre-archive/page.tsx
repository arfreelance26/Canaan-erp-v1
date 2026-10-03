"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { Archive as ArchiveIcon, RotateCcw, Trash2, User, ShieldCheck, History, Plus, Pencil } from "lucide-react";
import { deletionApprovalsApi, tyreApi, type DeletionApprovalRequest, type TyreInventoryEditEventRow } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

const EDIT_EVENT_ICON: Record<TyreInventoryEditEventRow["event"], typeof Plus> = {
  "Tyre Created": Plus,
  "Tyre Edited": Pencil,
  "Tyre Deleted": Trash2,
  "Tyre Restored": RotateCcw,
};

const EDIT_EVENT_COLOR: Record<TyreInventoryEditEventRow["event"], string> = {
  "Tyre Created": "bg-blue-100 text-blue-700",
  "Tyre Edited": "bg-amber-100 text-amber-700",
  "Tyre Deleted": "bg-red-100 text-red-700",
  "Tyre Restored": "bg-emerald-100 text-emerald-700",
};

type ArchiveRow = DeletionApprovalRequest;

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const s = raw.endsWith("Z") || raw.includes("+") ? raw : raw + "Z";
  return new Date(s).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).replace(/\//g, "-") + " IST";
}

// Read-only-list-turned-actionable archive of soft-deleted tyres. Same pattern
// as resources/archive/page.tsx (the multi-resource Archive) but scoped to a
// single kind, and accessible to Admin + Maintenance (see Sidebar.tsx
// ROLE_HREFS) rather than Admin only.
export default function TyreArchivePage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewing, setViewing] = useState<ArchiveRow | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<TyreInventoryEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    tyreApi.listInventoryEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  async function loadData() {
    try {
      // deletion_approval_requests is a historical audit log that never changes
      // on restore, so "currently archived" is verified against the tyre's own
      // live deleted_at (via /tyre-inventory/deleted-ids). Keep only the most
      // recent Approved row per tyre id, in case it was archived, restored,
      // then archived again.
      const [reqs, deletedIds] = await Promise.all([
        deletionApprovalsApi.list("Approved", "TyreInventory"),
        tyreApi.listDeletedIds(),
      ]);
      const stillDeleted = new Set(deletedIds);
      const latest = new Map<number, ArchiveRow>();
      for (const r of reqs) {
        if (!stillDeleted.has(r.resourceId)) continue;
        const existing = latest.get(r.resourceId);
        if (!existing || (r.approvedAt ?? "") > (existing.approvedAt ?? "")) {
          latest.set(r.resourceId, r);
        }
      }
      setRows([...latest.values()]);
    } catch {
      showError("Couldn't refresh the Tyre Archive — showing last known list.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey((k) => k + 1), 10000);
  useWebSocketEvent("tyre_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("deletion_approval_updated", () => setRefreshKey((k) => k + 1));

  async function handleRestore(row: ArchiveRow) {
    setActingId(row.id);
    try {
      await tyreApi.restore(String(row.resourceId));
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showSuccess(`Tyre ${row.resourceName} restored — it's back in Tyre Inventory.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to restore tyre.");
    } finally {
      setActingId(null);
    }
  }

  async function handlePermanentDelete(row: ArchiveRow) {
    const res = await confirmDelete(
      `Tyre ${row.resourceName} and ALL its fitment history will be permanently and irreversibly deleted. This cannot be undone.`
    );
    if (!res.isConfirmed) return;
    setActingId(row.id);
    try {
      await tyreApi.removePermanent(String(row.resourceId));
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showSuccess(`Tyre ${row.resourceName} permanently deleted.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to permanently delete tyre.");
    } finally {
      setActingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.requestedByName.toLowerCase().includes(q) ||
        r.resourceName.toLowerCase().includes(q) ||
        (r.approvedByName ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
            <ArchiveIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Tyre Archive</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Tyres removed from Tyre Inventory — restore them or permanently delete
            </p>
          </div>
        </div>
        {isAdmin && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-50"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by tyre, requester, or approver" value={search} onChange={setSearch} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/40 shadow-sm backdrop-blur-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <ArchiveIcon className="h-8 w-8 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">
              {rows.length === 0 ? "The Tyre Archive is empty." : "No archived tyres match this search."}
            </p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Tyre</th>
                  <th className="px-4 py-3">Deleted By</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Approved By</th>
                  <th className="px-4 py-3">Deletion Date</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-white/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{row.resourceName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
                          <User className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <p className="font-medium text-gray-900">{row.requestedByName}</p>
                      </div>
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setViewing(row)}
                        className="block max-w-[260px] truncate text-left text-blue-600 hover:text-blue-800 hover:underline"
                        title="Click to view full details"
                      >
                        {row.reason}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="font-medium text-gray-700">{row.approvedByName ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(row.approvedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => handleRestore(row)}
                          className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                          title="Put this tyre back in Tyre Inventory"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => handlePermanentDelete(row)}
                          className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                          title="Permanently and irreversibly delete this tyre"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete Permanently
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setViewing(null); }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-2xl border border-white/60 bg-white p-6 shadow-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Archived Tyre</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900">{viewing.resourceName}</p>

            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Deleted By</p>
                <p className="mt-0.5 font-medium text-gray-900">{viewing.requestedByName}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Reason for Deletion</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-gray-700">
                  {viewing.reason || "—"}
                </p>
              </div>
              {viewing.adminNote && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Admin Note</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-amber-800">
                    {viewing.adminNote}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Approved By</p>
                  <p className="mt-0.5 font-medium text-gray-900">{viewing.approvedByName ?? "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Deletion Date</p>
                  <p className="mt-0.5 text-gray-700">{formatDate(viewing.approvedAt)}</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setViewing(null)}
              className="mt-5 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Edit History — every Create/Edit/Delete/Restore ever logged, across
          every tyre stock record (the same log shown on Tyre Inventory), in
          one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by tyre number, brand, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q ||
              ev.tyreNumber.toLowerCase().includes(q) ||
              ev.brand.toLowerCase().includes(q) ||
              ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No tyre edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Tyre</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Action</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">By</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-gray-800">
                            {ev.tyreNumber} <span className="text-[11px] font-normal text-gray-400">({ev.brand})</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-gray-400"> ({ev.actorRole})</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    })}
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
