"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { RiAddLine as Plus, RiCheckboxCircleLine as CheckCircle2, RiAlertLine as AlertTriangle, RiBankLine as Landmark, RiHistoryLine as History, RiPencilLine as Pencil, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import { EmiTrackingTable } from "@/components/finance/EmiTrackingTable";
import { EmiFormDialog, DRAFT_KEY as EMI_DRAFT_KEY } from "@/components/finance/EmiFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { financeApi, type EmiRecordEditEventRow } from "@/lib/api";
import type { EmiRecord } from "@/types/finance";
import { confirmDelete, showSuccess, showError } from "@/lib/feedback";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { isEmiCompleted, isEmiOverdue } from "@/lib/emi-schedule";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime, overlapsDateRange } from "@/lib/format-date";

import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { useNotifications } from "@/context/NotificationContext";
import { ReminderAlertBanner } from "@/components/ui/ReminderAlertBanner";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const ViewEmiRecordDialog = dynamic(() => import("@/components/finance/ViewEmiRecordDialog").then((m) => m.ViewEmiRecordDialog));
const EmiInsightsDialog = dynamic(() => import("@/components/finance/EmiInsightsDialog").then((m) => m.EmiInsightsDialog));
const EDIT_EVENT_ICON: Record<EmiRecordEditEventRow["event"], typeof Plus> = {
  "EMI Created": Plus,
  "EMI Edited": Pencil,
  "EMI Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<EmiRecordEditEventRow["event"], string> = {
  "EMI Created": "bg-accent-surface-strong text-accent-text",
  "EMI Edited": "bg-warning-surface-strong text-warning-text",
  "EMI Deleted": "bg-danger-surface-strong text-danger-text",
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
  // Recurring-payment reminders used to only surface as "Renewals &
  // Payments" in the Topbar bell — lives here now, same reasoning as the
  // other relocated reminder categories.
  const { reminders } = useNotifications();
  const recurringReminders = reminders.filter((r) => r.kind === "recurring");
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

  const datedRecords = useMemo(
    () => records.filter((r) => overlapsDateRange(r.emiStartDate, r.emiEndDate, exportFrom, exportTo)),
    [records, exportFrom, exportTo],
  );

  const filteredBySearch = useMemo(() => {
    const query = searchQuery.toLowerCase();
    if (!query) return datedRecords;
    return datedRecords.filter(
      (r) =>
        r.emiName?.toLowerCase().includes(query) ||
        r.truckRegistration?.toLowerCase().includes(query) ||
        r.bankName?.toLowerCase().includes(query)
    );
  }, [datedRecords, searchQuery]);

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
    const unfilteredActive = datedRecords.filter((r) => !isEmiCompleted(r));
    const unfilteredCompleted = datedRecords.filter((r) => isEmiCompleted(r));
    const unfilteredOverdue = datedRecords.filter((r) => isEmiOverdue(r));
    const monthlyTotal = unfilteredActive.reduce((sum, r) => sum + (Number(r.emiAmount) || 0), 0);
    return { active: unfilteredActive.length, completed: unfilteredCompleted.length, overdue: unfilteredOverdue.length, monthlyTotal };
  }, [datedRecords]);

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
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
          <Landmark className="h-5 w-5" />
        </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">EMI Tracking</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Track loan EMIs for trucks and other financed assets
            </p>
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
            Add EMI Entry
          </button>
        </div>
      </div>

      <ReminderAlertBanner items={recurringReminders} />

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
          className={`rounded-xl border bg-background-primary-default p-4 text-left transition ${
            statusFilter === "Active" ? "border-accent-solid ring-2 ring-accent-border" : "border-separator-border hover:border-accent-border"
          }`}
        >
          <p className="text-caption-1-medium text-text-secondary">Active EMIs</p>
          <p className="mt-1 text-title-1-semibold text-text-primary">{summary.active}</p>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("Overdue")}
          className={`rounded-xl border bg-background-primary-default p-4 text-left transition ${
            statusFilter === "Overdue" ? "border-danger-solid ring-2 ring-danger-border" : "border-separator-border hover:border-danger-border"
          }`}
        >
          <p className="text-caption-1-medium text-text-secondary">Overdue</p>
          <p className={`mt-1 text-title-1-semibold ${summary.overdue > 0 ? "text-danger-text" : "text-text-primary"}`}>{summary.overdue}</p>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("Completed")}
          className={`rounded-xl border bg-background-primary-default p-4 text-left transition ${
            statusFilter === "Completed" ? "border-success-solid ring-2 ring-success-border" : "border-separator-border hover:border-success-border"
          }`}
        >
          <p className="text-caption-1-medium text-text-secondary">Completed EMI Records</p>
          <p className="mt-1 text-title-1-semibold text-text-primary">{summary.completed}</p>
        </button>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Total Monthly EMI</p>
          <p className="mt-1 text-title-1-semibold text-text-primary">{formatCurrency(summary.monthlyTotal)}</p>
        </div>
      </div>

      {statusFilter === "Active" ? (
        <EmiTrackingTable records={activeRecords} onView={handleView} onViewInsights={handleViewInsights} onEdit={handleEdit} onDelete={handleDelete} />
      ) : statusFilter === "Overdue" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-danger-text" />
            <h2 className="text-title-3-semibold text-text-primary">Overdue EMI</h2>
            <span className="rounded-full bg-danger-surface-strong px-2.5 py-0.5 text-caption-1-semibold text-danger-text">
              {overdueRecords.length} record{overdueRecords.length !== 1 ? "s" : ""} past End Date, not yet Completed
            </span>
          </div>
          {overdueRecords.length === 0 ? (
            <EmptyState size="compact" illustration="no-data" title="No overdue EMI records" />
          ) : (
            <EmiTrackingTable records={overdueRecords} onView={handleView} onViewInsights={handleViewInsights} onEdit={handleEdit} onDelete={handleDelete} />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success-text" />
            <h2 className="text-title-3-semibold text-text-primary">Completed EMI</h2>
            <span className="rounded-full bg-success-surface-strong px-2.5 py-0.5 text-caption-1-semibold text-success-text">
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
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.emiName.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              (ev.truckRegistration ?? "").toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No EMI edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">EMI</th>
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
                            <p className="font-semibold text-text-primary">{ev.emiName}</p>
                            {ev.truckRegistration && <p className="text-[11px] text-text-tertiary">{ev.truckRegistration}</p>}
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
