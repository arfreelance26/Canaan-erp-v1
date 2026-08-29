"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { TyreInventoryTable } from "@/components/tyre-inventory/TyreInventoryTable";
import { TyreInventoryFormDialog, DRAFT_KEY as TYRE_DRAFT_KEY } from "@/components/tyre-inventory/TyreInventoryFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { TyreHistoryDialog } from "@/components/tyre-inventory/TyreHistoryDialog";
import { tyreApi } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { Truck } from "@/types/truck";
import { trucksApi } from "@/lib/api";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

export default function TyreInventoryPage() {
  const [tyres, setTyres] = useState<TyreInventoryItem[]>([]);
  const [fitmentRecords, setFitmentRecords] = useState<TyreFitmentRecord[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTyre, setEditingTyre] = useState<TyreInventoryItem | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyTyre, setHistoryTyre] = useState<TyreInventoryItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

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
    const result = await confirmDelete("tyre");
    if (!result.isConfirmed) return;
    try {
      await tyreApi.deleteTyre(id);
      setTyres((prev) => prev.filter((tyre) => tyre.id !== id));
      showSuccess("Tyre deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete tyre.");
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

  const filteredTyres = tyres.filter((t) => {
    return (
      !searchQuery ||
      t.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tyreNumber.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const attachedIds = new Set(fitmentRecords.filter((f) => !f.removedDate).map((f) => f.tyreId));
  const totalCount = tyres.length;
  const availableCount = tyres.filter((t) => !attachedIds.has(t.id)).length;
  const attachedCount = tyres.filter((t) => attachedIds.has(t.id)).length;

  if (loading) return <PageSkeleton hasButton hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tyre Inventory</h1>
          <p className="mt-1 text-sm text-gray-500">Track all tyres purchased by the company</p>
        </div>
        <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={exportFrom}
            onChange={(e) => setExportFrom(e.target.value)}
            className="uppercase rounded-lg border border-gray-200 bg-white/50 px-3 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            title="Report from date (purchase date)"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={exportTo}
            onChange={(e) => setExportTo(e.target.value)}
            className="uppercase rounded-lg border border-gray-200 bg-white/50 px-3 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            title="Report to date (purchase date)"
          />
          <DownloadExcelButton
            path="/exports/tyre-inventory"
            filename="tyre_inventory.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
        >
          <Plus className="h-4 w-4" />
          Add Tyre
        </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tyres..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-1.5 rounded-full border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full sm:w-64 transition-all bg-white/50 backdrop-blur-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Tyres", value: totalCount, color: "bg-gray-50 border-gray-200 text-gray-700" },
          { label: "Available", value: availableCount, color: "bg-blue-50 border-blue-200 text-blue-700" },
          { label: "Attached", value: attachedCount, color: "bg-purple-50 border-purple-200 text-purple-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl border px-4 py-3 flex flex-col gap-0.5 ${color}`}>
            <span className="text-xs font-medium opacity-70">{label}</span>
            <span className="text-2xl font-bold">{value}</span>
          </div>
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
        />
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

    </div>
  );
}
