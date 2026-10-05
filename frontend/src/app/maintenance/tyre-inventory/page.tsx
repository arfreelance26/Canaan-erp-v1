"use client";

import { useEffect, useState } from "react";
import { Plus, Boxes, History, Pencil, Trash2, Undo2 } from "lucide-react";
import { TyreInventoryTable } from "@/components/tyre-inventory/TyreInventoryTable";
import { TyreInventoryFormDialog, DRAFT_KEY as TYRE_DRAFT_KEY } from "@/components/tyre-inventory/TyreInventoryFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { TyreHistoryDialog } from "@/components/tyre-inventory/TyreHistoryDialog";
import { TyreDataDialog } from "@/components/tyre-inventory/TyreDataDialog";
import { DiscardReasonDialog } from "@/components/tyre-inventory/DiscardReasonDialog";
import { tyreApi, deletionApprovalsApi, type TyreInventoryEditEventRow } from "@/lib/api";
import { confirmAction, showSuccess, showError } from "@/lib/swal";
import { useAuth } from "@/context/AuthContext";
import { EditRequestDialog } from "@/components/attendance/EditRequestDialog";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { Truck } from "@/types/truck";
import { trucksApi } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

const EDIT_EVENT_ICON: Record<TyreInventoryEditEventRow["event"], typeof Plus> = {
  "Tyre Created": Plus,
  "Tyre Edited": Pencil,
  "Tyre Deleted": Trash2,
  "Tyre Restored": Undo2,
};

const EDIT_EVENT_COLOR: Record<TyreInventoryEditEventRow["event"], string> = {
  "Tyre Created": "bg-blue-100 text-blue-700",
  "Tyre Edited": "bg-amber-100 text-amber-700",
  "Tyre Deleted": "bg-red-100 text-red-700",
  "Tyre Restored": "bg-emerald-100 text-emerald-700",
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

  async function handleSave(tyre: TyreInventoryItem) {
    try {
      const exists = tyres.some((existing) => existing.id === tyre.id);
      if (exists) {
        const updated = await tyreApi.updateTyre(tyre.id, tyre);
        setTyres((prev) => prev.map((existing) => (existing.id === tyre.id ? updated : existing)));
        showSuccess("Tyre updated successfully.");
      } else {
        const created = await tyreApi.createTyre(tyre);
        setTyres((prev) => [...prev, created]);
        clearFormDraft(TYRE_DRAFT_KEY);
        showSuccess("Tyre added successfully.");
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save tyre.");
    }
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
  const totalCount = tyres.length;
  const availableCount = tyres.filter((t) => !attachedIds.has(t.id)).length;
  const attachedCount = tyres.filter((t) => attachedIds.has(t.id)).length;

  const filteredTyres = tyres.filter((t) => {
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
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white text-teal-600 shadow-sm">
          <Boxes className="h-5 w-5" />
        </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Tyre Inventory</h1>
            <p className="mt-0.5 text-sm text-gray-500">Track all tyres purchased by the company</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
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
          <DownloadExcelButton
            path="/exports/tyre-inventory"
            filename="tyre_inventory.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { filter: "All" as const, label: "Total Tyres", value: totalCount, color: "bg-gray-50 border-gray-200 text-gray-700" },
          { filter: "Available" as const, label: "Available", value: availableCount, color: "bg-blue-50 border-blue-200 text-blue-700" },
          { filter: "Attached" as const, label: "Attached", value: attachedCount, color: "bg-purple-50 border-purple-200 text-purple-700" },
        ].map(({ filter, label, value, color }) => (
          <button
            key={label}
            type="button"
            onClick={() => setStatusFilter(filter)}
            aria-pressed={statusFilter === filter}
            className={cn(
              "rounded-xl border px-4 py-3 flex flex-col items-start gap-0.5 text-left transition-shadow hover:shadow-md",
              color,
              statusFilter === filter && "ring-2 ring-blue-400"
            )}
          >
            <span className="text-xs font-medium opacity-70">{label}</span>
            <span className="text-2xl font-bold">{value}</span>
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
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.tyreNumber.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.brand.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
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
                          <td className="px-3 py-2">
                            <p className="font-semibold text-gray-800">{ev.tyreNumber}</p>
                            <p className="text-[11px] text-gray-400">{ev.brand}</p>
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
