"use client";

import { useEffect, useState } from "react";
import { RiAddLine as Plus, RiStackLine as Boxes, RiHistoryLine as History, RiPencilLine as Pencil, RiDeleteBinLine as Trash2, RiArrowGoBackLine as Undo2 } from "@remixicon/react";
import { TyreInventoryTable } from "@/components/tyre-inventory/TyreInventoryTable";
import { TyreInventoryFormDialog, DRAFT_KEY as TYRE_DRAFT_KEY, type TyreProofChange } from "@/components/tyre-inventory/TyreInventoryFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { tyreApi, deletionApprovalsApi, type TyreInventoryEditEventRow } from "@/lib/api";
import { confirmAction, showSuccess, showError } from "@/lib/feedback";
import { useAuth } from "@/context/AuthContext";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { Truck } from "@/types/truck";
import { trucksApi } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime, inDateRange } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const TyreHistoryDialog = dynamic(() => import("@/components/tyre-inventory/TyreHistoryDialog").then((m) => m.TyreHistoryDialog));
const TyreDataDialog = dynamic(() => import("@/components/tyre-inventory/TyreDataDialog").then((m) => m.TyreDataDialog));
const DiscardReasonDialog = dynamic(() => import("@/components/tyre-inventory/DiscardReasonDialog").then((m) => m.DiscardReasonDialog));
const EditRequestDialog = dynamic(() => import("@/components/attendance/EditRequestDialog").then((m) => m.EditRequestDialog));
const EDIT_EVENT_ICON: Record<TyreInventoryEditEventRow["event"], typeof Plus> = {
  "Tyre Created": Plus,
  "Tyre Edited": Pencil,
  "Tyre Deleted": Trash2,
  "Tyre Restored": Undo2,
};

const EDIT_EVENT_COLOR: Record<TyreInventoryEditEventRow["event"], string> = {
  "Tyre Created": "bg-accent-surface-strong text-accent-text",
  "Tyre Edited": "bg-warning-surface-strong text-warning-text",
  "Tyre Deleted": "bg-danger-surface-strong text-danger-text",
  "Tyre Restored": "bg-success-surface-strong text-success-text",
};

export default function TyreInventoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [tyres, setTyres] = useState<TyreInventoryItem[]>([]);
  const [fitmentRecords, setFitmentRecords] = useState<TyreFitmentRecord[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTyre, setEditingTyre] = useState<TyreInventoryItem | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyTyre, setHistoryTyre] = useState<TyreInventoryItem | null>(null);
  const [deleteRequestTyre, setDeleteRequestTyre] = useState<TyreInventoryItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<TyreInventoryEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every tyre edit ever
  // logged — searching by tyre number here doubles as that tyre's own
  // history.
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    tyreApi.listInventoryEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
    Promise.all([tyreApi.listInventory(), tyreApi.listFitments(), trucksApi.list()])
      .then(([t, f, tr]) => {
        setTyres(t);
        setFitmentRecords(f);
        setTrucks(tr);
      })
      .catch(() => {}).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("tyre_updated", () => setRefreshKey(k => k + 1));

  function handleAdd() {
    setEditingTyre(null);
    setDialogOpen(true);
  }

  function handleEdit(tyre: TyreInventoryItem) {
    setEditingTyre(tyre);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    if (!isAdmin) {
      const tyre = tyres.find((t) => t.id === id);
      if (tyre) setDeleteRequestTyre(tyre);
      return;
    }
    const result = await confirmAction(
      "Delete this tyre?",
      "It will be removed from Tyre Inventory, but can be restored from the Tyre Archive page.",
      "Yes, delete"
    );
    if (!result.isConfirmed) return;
    try {
      await tyreApi.deleteTyre(id);
      setTyres((prev) => prev.filter((tyre) => tyre.id !== id));
      showSuccess("Tyre deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete tyre.");
    }
  }

  async function handleFlagForRetread(tyre: TyreInventoryItem) {
    const result = await confirmAction(
      "Flag this tyre for retreading?",
      `${tyre.tyreNumber} (${tyre.brand}) will move from Tyre Inventory to the Retread Queue page.`,
      "Yes, flag it"
    );
    if (!result.isConfirmed) return;
    try {
      await tyreApi.flagForRetread(tyre.id);
      setTyres((prev) => prev.filter((t) => t.id !== tyre.id));
      showSuccess("Tyre moved to the Retread Queue.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to flag tyre for retreading.");
    }
  }

  async function handleDiscardConfirm(tyre: TyreInventoryItem, reason: string) {
    try {
      await tyreApi.flagForDiscard(tyre.id, reason);
      setTyres((prev) => prev.filter((t) => t.id !== tyre.id));
      setDiscardTarget(null);
      showSuccess("Tyre moved to Discarded Tyres.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to discard tyre.");
    }
  }

  async function handleDeleteRequestSubmit(reason: string) {
    if (!deleteRequestTyre) return;
    try {
      await deletionApprovalsApi.create({
        resourceType: "TyreInventory",
        resourceId: parseInt(deleteRequestTyre.id, 10),
        resourceName: `${deleteRequestTyre.tyreNumber} (${deleteRequestTyre.brand})`,
        reason,
      });
      showSuccess("Delete request sent to Admin — you'll see it approved or rejected on the Deletion Approvals page.");
      setDeleteRequestTyre(null);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to send delete request.");
    }
  }

  async function handleSave(tyre: TyreInventoryItem, proof: TyreProofChange) {
    let saved: TyreInventoryItem;
    const exists = tyres.some((existing) => existing.id === tyre.id);
    try {
      saved = exists ? await tyreApi.updateTyre(tyre.id, tyre) : await tyreApi.createTyre(tyre);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save tyre.");
      return;
    }
    if (!exists) clearFormDraft(TYRE_DRAFT_KEY);
    // The tyre is saved either way; a failed upload is reported on its own so
    // the user can retry it from Edit without re-entering everything.
    let proofFailed = "";
    try {
      if (proof.file) saved = await tyreApi.uploadProof(saved.id, proof.file);
      else if (proof.remove) saved = await tyreApi.deleteProof(saved.id);
    } catch (err: unknown) {
      proofFailed = err instanceof Error ? err.message : "Upload failed.";
    }
    setTyres((prev) => (exists ? prev.map((t) => (t.id === saved.id ? saved : t)) : [...prev, saved]));
    setDialogOpen(false);
    if (proofFailed) showError(`Tyre ${exists ? "updated" : "added"}, but the Proof of Payment/Invoice wasn't saved: ${proofFailed}`);
    else showSuccess(exists ? "Tyre updated successfully." : "Tyre added successfully.");
  }

  function handleViewHistory(tyre: TyreInventoryItem) {
    setHistoryTyre(tyre);
    setHistoryDialogOpen(true);
  }

  const [searchQuery, setSearchQuery] = useState("");
  // Set by clicking the summary cards: All shows every tyre, Available / Attached narrow the table.
  const [statusFilter, setStatusFilter] = useState<"All" | "Available" | "Attached">("All");
  const [dataTyreId, setDataTyreId] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<TyreInventoryItem | null>(null);

  const attachedIds = new Set(fitmentRecords.filter((f) => !f.removedDate).map((f) => f.tyreId));
  const datedTyres = tyres.filter((t) => inDateRange(t.purchaseDate, exportFrom, exportTo));
  const totalCount = datedTyres.length;
  const availableCount = datedTyres.filter((t) => !attachedIds.has(t.id)).length;
  const attachedCount = datedTyres.filter((t) => attachedIds.has(t.id)).length;

  const filteredTyres = datedTyres.filter((t) => {
    if (statusFilter === "Available" && attachedIds.has(t.id)) return false;
    if (statusFilter === "Attached" && !attachedIds.has(t.id)) return false;
    return (
      !searchQuery ||
      t.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tyreNumber.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  if (loading) return <PageSkeleton hasButton hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal-border bg-teal-surface text-teal-text shadow-sm">
          <Boxes className="h-5 w-5" />
        </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Tyre Inventory</h1>
            <p className="mt-0.5 text-sm text-text-secondary">Track all tyres purchased by the company</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
            onClick={handleAdd}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add Tyre
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search tyres..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          {/* The designed report (tyre_reports.py). */}
          <ReportViewButton
            path="/exports/resource-report"
            filename="Tyre_Inventory.xlsx"
            title={`Tyre Inventory Report — ${exportFrom || exportTo ? `${exportFrom ? exportFrom.split("-").reverse().join("-") : "start"} to ${exportTo ? exportTo.split("-").reverse().join("-") : "today"}` : "all time"}${statusFilter !== "All" ? ` — ${statusFilter === "Attached" ? "Fitted" : "In stock"}` : ""}${searchQuery.trim() ? ` — "${searchQuery.trim()}"` : ""}`}
            params={{ kind: "tyre_inventory", ...(statusFilter !== "All" ? { stage: statusFilter === "Attached" ? "Fitted" : "In stock" } : {}), ...(exportFrom ? { from_date: exportFrom } : {}), ...(exportTo ? { to_date: exportTo } : {}), ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}) }}
            pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { filter: "All" as const, label: "Total Tyres", value: totalCount, color: "bg-fill-1 border-separator-border text-text-primary" },
          { filter: "Available" as const, label: "Available", value: availableCount, color: "bg-accent-surface border-accent-border text-accent-text" },
          { filter: "Attached" as const, label: "Attached", value: attachedCount, color: "bg-purple-surface border-purple-border text-purple-text" },
        ].map(({ filter, label, value, color }) => (
          <button
            key={label}
            type="button"
            onClick={() => setStatusFilter(filter)}
            aria-pressed={statusFilter === filter}
            className={cn(
              "rounded-xl border px-4 py-3 flex flex-col items-start gap-0.5 text-left transition-shadow hover:shadow-md",
              color,
              statusFilter === filter && "ring-2 ring-accent-border-strong"
            )}
          >
            <span className="text-caption-1-medium opacity-70">{label}</span>
            <span className="text-title-1-semibold">{value}</span>
          </button>
        ))}
      </div>

      <div>
        <TyreInventoryTable
          tyres={filteredTyres}
          fitments={fitmentRecords}
          trucks={trucks}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onViewHistory={handleViewHistory}
          onFlagForRetread={handleFlagForRetread}
          onViewData={(tyre) => setDataTyreId(tyre.id)}
          onFlagDiscarded={(tyre) => setDiscardTarget(tyre)}
        />
        <TyreDataDialog tyreId={dataTyreId} onClose={() => setDataTyreId(null)} />
        <DiscardReasonDialog tyre={discardTarget} onClose={() => setDiscardTarget(null)} onConfirm={handleDiscardConfirm} />
      </div>

      <TyreInventoryFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingTyre}
        existingTyres={tyres}
      />

      <TyreHistoryDialog
        open={historyDialogOpen}
        onClose={() => setHistoryDialogOpen(false)}
        tyre={historyTyre}
        records={fitmentRecords}
        trucks={trucks}
      />

      {deleteRequestTyre && (
        <EditRequestDialog
          open={deleteRequestTyre !== null}
          resourceType="TyreInventory"
          resourceName={`${deleteRequestTyre.tyreNumber} (${deleteRequestTyre.brand})`}
          action="Delete"
          onSubmit={handleDeleteRequestSubmit}
          onClose={() => setDeleteRequestTyre(null)}
        />
      )}

      {/* Edit History — every Create/Edit/Delete/Restore ever logged, across
          every tyre (not just the ones currently on this page), in one
          searchable log instead of having to open each tyre individually.
          Searching by a specific tyre number doubles as that tyre's own
          history. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by tyre number, brand, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.tyreNumber.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.brand.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
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
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-text-primary">{ev.tyreNumber}</p>
                            <p className="text-[11px] text-text-tertiary">{ev.brand}</p>
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
