"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, CheckCircle2, Search } from "lucide-react";
import { EmiTrackingTable } from "@/components/finance/EmiTrackingTable";
import { EmiFormDialog } from "@/components/finance/EmiFormDialog";
import { financeApi } from "@/lib/api";
import type { EmiRecord } from "@/types/finance";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { todayIst } from "@/lib/format-date";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function EmiTrackingPage() {
  const [records, setRecords] = useState<EmiRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EmiRecord | null>(null);

  useEffect(() => {
    financeApi.listEmi().then(setRecords).finally(() => setLoading(false));
  }, []);
  useAutoRefresh(() => {
    financeApi.listEmi().then(setRecords).finally(() => setLoading(false));
  }, 5000);

  const today = todayIst();

  const filteredBySearch = useMemo(() => {
    const query = searchQuery.toLowerCase();
    if (!query) return records;
    return records.filter(
      (r) =>
        r.emiName?.toLowerCase().includes(query) ||
        r.truckRegistration?.toLowerCase().includes(query) ||
        r.bankName?.toLowerCase().includes(query) ||
        r.loanNumber?.toLowerCase().includes(query)
    );
  }, [records, searchQuery]);

  const activeRecords = useMemo(
    () => filteredBySearch.filter((r) => r.emiEndDate >= today),
    [filteredBySearch, today]
  );

  const completedRecords = useMemo(
    () => filteredBySearch.filter((r) => r.emiEndDate < today),
    [filteredBySearch, today]
  );

  const summary = useMemo(() => {
    let dueSoon = 0;
    let overdue = 0;
    let monthlyTotal = 0;
    
    const unfilteredActiveRecords = records.filter((r) => r.emiEndDate >= today);
    
    for (const record of unfilteredActiveRecords) {
      monthlyTotal += Number(record.emiAmount) || 0;
      if (record.emiPaymentDate <= today) {
        overdue += 1;
      } else {
        dueSoon += 1;
      }
    }
    return { active: unfilteredActiveRecords.length, dueSoon, overdue, monthlyTotal };
  }, [records, today]);

  function handleAdd() {
    setEditingRecord(null);
    setDialogOpen(true);
  }

  function handleEdit(record: EmiRecord) {
    setEditingRecord(record);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    const result = await confirmDelete("EMI entry");
    if (!result.isConfirmed) return;
    try {
      await financeApi.deleteEmi(id);
      setRecords((prev) => prev.filter((record) => record.id !== id));
      showSuccess("EMI entry deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete EMI entry.");
    }
  }

  async function handleSave(record: EmiRecord) {
    try {
      const exists = records.some((existing) => existing.id === record.id);
      if (exists) {
        const updated = await financeApi.updateEmi(record.id, record);
        setRecords((prev) => prev.map((existing) => (existing.id === record.id ? updated : existing)));
        showSuccess("EMI entry updated successfully.");
      } else {
        const created = await financeApi.createEmi(record);
        setRecords((prev) => [...prev, created]);
        showSuccess("EMI entry created successfully.");
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save EMI entry.");
    }
  }

  if (loading) return <PageSkeleton hasButton hasSearch statCards={4} columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">EMI Tracking</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track loan EMIs for trucks and other financed assets
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search EMIs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
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
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Active EMIs</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{summary.active}</p>
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

      <EmiTrackingTable records={activeRecords} onEdit={handleEdit} onDelete={handleDelete} />

      {/* Completed EMI section */}
      {completedRecords.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold text-gray-900">Completed EMI</h2>
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
              {completedRecords.length} loan{completedRecords.length !== 1 ? "s" : ""} repaid
            </span>
          </div>
          <EmiTrackingTable records={completedRecords} readOnly />
        </div>
      )}

      <EmiFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingRecord}
      />
    </div>
  );
}
