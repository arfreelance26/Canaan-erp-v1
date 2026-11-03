"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { RiArchiveLine as ArchiveIcon, RiArrowGoBackLine as RotateCcw, RiDeleteBinLine as Trash2, RiUserLine as User, RiShieldCheckLine as ShieldCheck, RiHistoryLine as History, RiAddLine as Plus, RiPencilLine as Pencil } from "@remixicon/react";
import { deletionApprovalsApi, tyreApi, type DeletionApprovalRequest, type TyreInventoryEditEventRow } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { confirmDelete, showSuccess, showError } from "@/lib/feedback";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
const EDIT_EVENT_ICON: Record<TyreInventoryEditEventRow["event"], typeof Plus> = {
  "Tyre Created": Plus,
  "Tyre Edited": Pencil,
  "Tyre Deleted": Trash2,
  "Tyre Restored": RotateCcw,
};

const EDIT_EVENT_COLOR: Record<TyreInventoryEditEventRow["event"], string> = {
  "Tyre Created": "bg-accent-surface-strong text-accent-text",
  "Tyre Edited": "bg-warning-surface-strong text-warning-text",
  "Tyre Deleted": "bg-danger-surface-strong text-danger-text",
  "Tyre Restored": "bg-success-surface-strong text-success-text",
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
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <ArchiveIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Tyre Archive</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Tyres removed from Tyre Inventory — restore them or permanently delete
            </p>
          </div>
        </div>
        {isAdmin && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by tyre, requester, or approver" value={search} onChange={setSearch} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-separator-border bg-background-primary-default shadow-sm">
        {filtered.length === 0 ? (
          <EmptyState size="compact" illustration="not-found" title={rows.length === 0 ? "The Tyre Archive is empty" : "No archived tyres match this search"} />
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-separator-border bg-fill-1 text-left text-caption-1-semibold text-text-secondary">
                  <th className="px-4 py-3">Tyre</th>
                  <th className="px-4 py-3">Deleted By</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Approved By</th>
                  <th className="px-4 py-3">Deletion Date</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-separator-border">
                {filtered.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-fill-2">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary">{row.resourceName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-surface-strong">
                          <User className="h-3.5 w-3.5 text-accent-text" />
                        </div>
                        <p className="font-medium text-text-primary">{row.requestedByName}</p>
                      </div>
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setViewing(row)}
                        className="block max-w-[260px] truncate text-left text-accent-text hover:text-accent-text-strong hover:underline"
                        title="Click to view full details"
                      >
                        {row.reason}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-success-text" />
                        <span className="font-medium text-text-primary">{row.approvedByName ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.approvedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => handleRestore(row)}
                          className="flex items-center gap-1 rounded-lg border border-success-border bg-success-surface px-2.5 py-1 text-caption-1-semibold text-success-text hover:bg-success-surface-strong transition-colors disabled:opacity-50"
                          title="Put this tyre back in Tyre Inventory"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => handlePermanentDelete(row)}
                          className="flex items-center gap-1 rounded-lg border border-danger-border bg-danger-surface px-2.5 py-1 text-caption-1-semibold text-danger-text hover:bg-danger-surface-strong transition-colors disabled:opacity-50"
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
          <div className="absolute inset-0 bg-scrim/40" />
          <div className="relative w-full max-w-md rounded-2xl border border-separator-border bg-background-primary-default p-6 shadow-2xl">
            <p className="text-caption-2-semibold text-text-tertiary">Archived Tyre</p>
            <p className="mt-0.5 text-title-3-semibold text-text-primary">{viewing.resourceName}</p>

            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div>
                <p className="text-caption-2-semibold text-text-tertiary">Deleted By</p>
                <p className="mt-0.5 font-medium text-text-primary">{viewing.requestedByName}</p>
              </div>
              <div>
                <p className="text-caption-2-semibold text-text-tertiary">Reason for Deletion</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-separator-border bg-fill-1 px-3 py-2 text-text-primary">
                  {viewing.reason || "—"}
                </p>
              </div>
              {viewing.adminNote && (
                <div>
                  <p className="text-caption-2-semibold text-text-tertiary">Admin Note</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-warning-text-strong">
                    {viewing.adminNote}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-separator-border pt-3">
                <div>
                  <p className="text-caption-2-semibold text-text-tertiary">Approved By</p>
                  <p className="mt-0.5 font-medium text-text-primary">{viewing.approvedByName ?? "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-caption-2-semibold text-text-tertiary">Deletion Date</p>
                  <p className="mt-0.5 text-text-primary">{formatDate(viewing.approvedAt)}</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setViewing(null)}
              className="mt-5 w-full rounded-lg border border-separator-border bg-background-primary-default px-4 py-2 text-body-semibold text-text-secondary hover:bg-fill-2"
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
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q ||
              ev.tyreNumber.toLowerCase().includes(q) ||
              ev.brand.toLowerCase().includes(q) ||
              ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "logistics" : "not-found"} title={editHistoryEvents.length === 0 ? "No tyre edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Tyre</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-separator-border">
                    {filtered.map((ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-text-primary">
                            {ev.tyreNumber} <span className="text-caption-2-regular text-text-tertiary">({ev.brand})</span>
                          </td>
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
