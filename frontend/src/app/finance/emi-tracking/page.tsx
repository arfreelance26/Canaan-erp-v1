"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { EmiTrackingTable } from "@/components/finance/EmiTrackingTable";
import { EmiFormDialog } from "@/components/finance/EmiFormDialog";
import { financeApi } from "@/lib/api";
import type { EmiRecord } from "@/types/finance";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function EmiTrackingPage() {
  const [records, setRecords] = useState<EmiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EmiRecord | null>(null);

  useEffect(() => {
    financeApi.listEmi().then(setRecords).finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const today = todayIso();
    let dueSoon = 0;
    let overdue = 0;
    let monthlyTotal = 0;
    for (const record of records) {
      monthlyTotal += Number(record.emiAmount) || 0;
      if (record.emiPaymentDate < today) {
        overdue += 1;
      } else {
        dueSoon += 1;
      }
    }
    return { total: records.length, dueSoon, overdue, monthlyTotal };
  }, [records]);

  function handleAdd() {
    setEditingRecord(null);
    setDialogOpen(true);
  }

  function handleEdit(record: EmiRecord) {
    setEditingRecord(record);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this EMI entry?")) return;
    await financeApi.deleteEmi(id);
    setRecords((prev) => prev.filter((record) => record.id !== id));
  }

  async function handleSave(record: EmiRecord) {
    const exists = records.some((existing) => existing.id === record.id);
    if (exists) {
      const updated = await financeApi.updateEmi(record.id, record);
      setRecords((prev) => prev.map((existing) => (existing.id === record.id ? updated : existing)));
    } else {
      const created = await financeApi.createEmi(record);
      setRecords((prev) => [...prev, created]);
    }
    setDialogOpen(false);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">EMI Tracking</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track loan EMIs for trucks and other financed assets
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add EMI Entry
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total EMIs</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Upcoming</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600">{summary.dueSoon}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Overdue</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{summary.overdue}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Monthly EMI</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(summary.monthlyTotal)}</p>
        </div>
      </div>

      <EmiTrackingTable records={records} onEdit={handleEdit} onDelete={handleDelete} />

      <EmiFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingRecord}
      />
    </div>
  );
}
