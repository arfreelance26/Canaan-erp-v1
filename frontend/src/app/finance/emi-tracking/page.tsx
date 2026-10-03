"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { Plus, CheckCircle2, AlertTriangle, Landmark, History, Pencil, Trash2 } from "lucide-react";
import { EmiTrackingTable } from "@/components/finance/EmiTrackingTable";
import { EmiFormDialog, DRAFT_KEY as EMI_DRAFT_KEY } from "@/components/finance/EmiFormDialog";
import { ViewEmiRecordDialog } from "@/components/finance/ViewEmiRecordDialog";
import { EmiInsightsDialog } from "@/components/finance/EmiInsightsDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { financeApi, type EmiRecordEditEventRow } from "@/lib/api";
import type { EmiRecord } from "@/types/finance";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { isEmiCompleted, isEmiOverdue } from "@/lib/emi-schedule";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";

const EDIT_EVENT_ICON: Record<EmiRecordEditEventRow["event"], typeof Plus> = {
  "EMI Created": Plus,
  "EMI Edited": Pencil,
  "EMI Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<EmiRecordEditEventRow["event"], string> = {
  "EMI Created": "bg-blue-100 text-blue-700",
  "EMI Edited": "bg-amber-100 text-amber-700",
  "EMI Deleted": "bg-red-100 text-red-700",
};
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function EmiTrackingPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [records, setRecords] = useState<EmiRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EmiRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewingRecord, setViewingRecord] = useState<EmiRecord | null>(null);
  const [viewingInsightsRecord, setViewingInsightsRecord] = useState<EmiRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<"Active" | "Completed" | "Overdue">("Active");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<EmiRecordEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every EMI edit ever
  // logged — searching by EMI name/truck registration doubles as that
  // record's own history. A deleted EMI's row still shows (it's a
  // snapshot, not a live join).
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    financeApi.listEmiEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
    financeApi.listEmi().then(setRecords).catch(() => {}).finally(() => setLoading(false));
  }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("finance_updated", () => setRefreshKey(k => k + 1));

  const filteredBySearch = useMemo(() => {
    const query = searchQuery.toLowerCase();
    if (!query) return records;
    return records.filter(
      (r) =>
        r.emiName?.toLowerCase().includes(query) ||
        r.truckRegistration?.toLowerCase().includes(query) ||
        r.bankName?.toLowerCase().includes(query)
    );
  }, [records, searchQuery]);

  // An EMI is "Completed" once Amount Paid has caught up to Total EMI
  // Payable (EMI Amount × Tenure) — not based on the EMI End Date field.
  const activeRecords = useMemo(
    () => filteredBySearch.filter((r) => !isEmiCompleted(r)),
    [filteredBySearch]
  );

  const completedRecords = useMemo(
    () => filteredBySearch.filter((r) => isEmiCompleted(r)),
    [filteredBySearch]
  );

  // Overdue is a flagged subset of Active — the loan's EMI End Date has
  // already passed but our tracked installments haven't caught up to the
  // tenure, meaning something about this record needs attention (see
  // isEmiOverdue's doc comment). It is NOT "this month's due date has
  // passed" — every active EMI would trip that every month.
  const overdueRecords = useMemo(
    () => filteredBySearch.filter((r) => isEmiOverdue(r)),
    [filteredBySearch]
  );

  const summary = useMemo(() => {
    const unfilteredActive = records.filter((r) => !isEmiCompleted(r));
    const unfilteredCompleted = records.filter((r) => isEmiCompleted(r));
    const unfilteredOverdue = records.filter((r) => isEmiOverdue(r));
    const monthlyTotal = unfilteredActive.reduce((sum, r) => sum + (Number(r.emiAmount) || 0), 0);
    return { active: unfilteredActive.length, completed: unfilteredCompleted.length, overdue: unfilteredOverdue.length, monthlyTotal };
  }, [records]);

  function handleAdd() {
    setEditingRecord(null);
    setDialogOpen(true);
  }

  function handleEdit(record: EmiRecord) {
    setEditingRecord(record);
    setDialogOpen(true);
  }

  function handleView(record: EmiRecord) {
    setViewingRecord(record);
  }

  function handleViewInsights(record: EmiRecord) {
    setViewingInsightsRecord(record);
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
        clearFormDraft(EMI_DRAFT_KEY);
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
          <Landmark className="h-5 w-5" />
        </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">EMI Tracking</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Track loan EMIs for trucks and other financed assets
            </p>
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
            Add EMI Entry
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search EMIs..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/exports/emi"
            filename="emi_records.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setStatusFilter("Active")}
          className={`rounded-xl border bg-white p-4 text-left transition-all ${
            statusFilter === "Active" ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-200 hover:border-blue-200"
          }`}
        >
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Active EMIs</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{summary.active}</p>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("Overdue")}
          className={`rounded-xl border bg-white p-4 text-left transition-all ${
            statusFilter === "Overdue" ? "border-red-500 ring-2 ring-red-100" : "border-gray-200 hover:border-red-200"
          }`}
        >
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Overdue</p>
          <p className={`mt-1 text-2xl font-bold ${summary.overdue > 0 ? "text-red-600" : "text-gray-900"}`}>{summary.overdue}</p>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("Completed")}
          className={`rounded-xl border bg-white p-4 text-left transition-all ${
            statusFilter === "Completed" ? "border-emerald-500 ring-2 ring-emerald-100" : "border-gray-200 hover:border-emerald-200"
          }`}
        >
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Completed EMI Records</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{summary.completed}</p>
        </button>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Monthly EMI</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(summary.monthlyTotal)}</p>
        </div>
      </div>

      {statusFilter === "Active" ? (
        <EmiTrackingTable records={activeRecords} onView={handleView} onViewInsights={handleViewInsights} onEdit={handleEdit} onDelete={handleDelete} />
      ) : statusFilter === "Overdue" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold text-gray-900">Overdue EMI</h2>
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              {overdueRecords.length} record{overdueRecords.length !== 1 ? "s" : ""} past End Date, not yet Completed
            </span>
          </div>
          {overdueRecords.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
              No overdue EMI records.
            </div>
          ) : (
            <EmiTrackingTable records={overdueRecords} onView={handleView} onViewInsights={handleViewInsights} onEdit={handleEdit} onDelete={handleDelete} />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold text-gray-900">Completed EMI</h2>
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
              {completedRecords.length} loan{completedRecords.length !== 1 ? "s" : ""} repaid
            </span>
          </div>
          <EmiTrackingTable records={completedRecords} onView={handleView} onViewInsights={handleViewInsights} readOnly />
        </div>
      )}

      <EmiFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingRecord}
      />

      <ViewEmiRecordDialog
        open={viewingRecord !== null}
        onClose={() => setViewingRecord(null)}
        record={viewingRecord}
      />

      <EmiInsightsDialog
        open={viewingInsightsRecord !== null}
        onClose={() => setViewingInsightsRecord(null)}
        record={viewingInsightsRecord}
      />

      {/* Edit History — every Create/Edit/Delete ever logged, across every
          EMI record (not just the ones currently on this page), in one
          searchable log instead of having to open each record individually.
          A deleted EMI's row still shows since it's logged as a snapshot,
          not a live join. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by EMI name, truck registration, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.emiName.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              (ev.truckRegistration ?? "").toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No EMI edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">EMI</th>
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
                            <p className="font-semibold text-gray-800">{ev.emiName}</p>
                            {ev.truckRegistration && <p className="text-[11px] text-gray-400">{ev.truckRegistration}</p>}
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
