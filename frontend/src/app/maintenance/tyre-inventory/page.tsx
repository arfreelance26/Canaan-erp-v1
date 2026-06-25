"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { TyreInventoryTable } from "@/components/tyre-inventory/TyreInventoryTable";
import { TyreInventoryFormDialog } from "@/components/tyre-inventory/TyreInventoryFormDialog";
import { TyreHistoryDialog } from "@/components/tyre-inventory/TyreHistoryDialog";
import { tyreApi } from "@/lib/api";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";

export default function TyreInventoryPage() {
  const [tyres, setTyres] = useState<TyreInventoryItem[]>([]);
  const [fitmentRecords, setFitmentRecords] = useState<TyreFitmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTyre, setEditingTyre] = useState<TyreInventoryItem | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyTyre, setHistoryTyre] = useState<TyreInventoryItem | null>(null);

  useEffect(() => {
    Promise.all([tyreApi.listInventory(), tyreApi.listFitments()])
      .then(([t, f]) => {
        setTyres(t);
        setFitmentRecords(f);
      })
      .finally(() => setLoading(false));
  }, []);

  function handleAdd() {
    setEditingTyre(null);
    setDialogOpen(true);
  }

  function handleEdit(tyre: TyreInventoryItem) {
    setEditingTyre(tyre);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tyre?")) return;
    await tyreApi.deleteTyre(id);
    setTyres((prev) => prev.filter((tyre) => tyre.id !== id));
  }

  async function handleSave(tyre: TyreInventoryItem) {
    const exists = tyres.some((existing) => existing.id === tyre.id);
    if (exists) {
      const updated = await tyreApi.updateTyre(tyre.id, tyre);
      setTyres((prev) => prev.map((existing) => (existing.id === tyre.id ? updated : existing)));
    } else {
      const created = await tyreApi.createTyre(tyre);
      setTyres((prev) => [...prev, created]);
    }
    setDialogOpen(false);
  }

  function handleViewHistory(tyre: TyreInventoryItem) {
    setHistoryTyre(tyre);
    setHistoryDialogOpen(true);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tyre Inventory</h1>
          <p className="mt-1 text-sm text-gray-500">Track all tyres purchased by the company</p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
         
         
        >
          <Plus className="h-4 w-4" />
          Add Tyre
        </button>
      </div>

      <div>
        <TyreInventoryTable
          tyres={tyres}
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
      />

    </div>
  );
}
