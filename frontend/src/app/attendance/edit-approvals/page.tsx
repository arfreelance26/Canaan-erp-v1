"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { RiShieldFlashLine as ShieldAlert, RiShieldCheckLine as ShieldCheck, RiShieldCrossLine as ShieldX, RiTimeLine as Clock, RiUserLine as User, RiHistoryLine as History, RiCheckLine as Check, RiCloseLine as X } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { editApprovalsApi, type EditApprovalEditEventRow } from "@/lib/api";
import type { EditApprovalRequest } from "@/types/edit-approval";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PillSearch } from "@/components/ui/PillSearch";
import { Dialog } from "@/components/ui/Dialog";
import { showSuccess, showError, confirmDelete, confirmAction } from "@/lib/feedback";
import { RiDeleteBinLine as Trash2 } from "@remixicon/react";
import { formatDateTime, inDateRange } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
const EDIT_EVENT_ICON: Record<EditApprovalEditEventRow["event"], typeof Check> = {
  "Edit Request Approved": Check,
  "Edit Request Rejected": X,
};

const EDIT_EVENT_COLOR: Record<EditApprovalEditEventRow["event"], string> = {
  "Edit Request Approved": "bg-success-surface-strong text-success-text",
  "Edit Request Rejected": "bg-danger-surface-strong text-danger-text",
};

type FilterValue = "Pending" | "Approved" | "Completed" | "Rejected";

// An Approved request whose 8-hour edit window has run out — the task is
// done, so it moves out of "Approved" (still-active window) into "Completed".
function isRequestExpired(req: EditApprovalRequest): boolean {
  if (req.status !== "Approved" || !req.expiresAt) return false;
  const s = req.expiresAt.endsWith("Z") || req.expiresAt.includes("+") ? req.expiresAt : req.expiresAt + "Z";
  return new Date(s) < new Date();
}

function timeLeft(expiresAt: string | null): string {
  if (!expiresAt) return "";
  const s = expiresAt.endsWith("Z") || expiresAt.includes("+") ? expiresAt : expiresAt + "Z";
  const diff = Math.floor((new Date(s).getTime() - Date.now()) / 1000);
  if (diff <= 0) return "Expired";
  if (diff < 60) return `${diff}s left`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m left`;
  return `${Math.floor(diff / 3600)}h left`;
}

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

export default function EditApprovalsPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [requests, setRequests] = useState<EditApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("Pending");
  const [search, setSearch] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewing, setViewing] = useState<EditApprovalRequest | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteApproveReq, setDeleteApproveReq] = useState<EditApprovalRequest | null>(null);
  const [deleteApproveNote, setDeleteApproveNote] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<EditApprovalEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    editApprovalsApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  async function loadData() {
    try {
      const data = await editApprovalsApi.list();
      setRequests(data);
    } catch (err: unknown) {
      // Keep showing the last-known-good list instead of silently blanking it —
      // a transient failure (e.g. right after relogin) shouldn't look like "no requests".
      showError(err instanceof Error ? err.message : "Couldn't refresh edit approvals — showing last known list.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey(k => k + 1), 3000);
  useWebSocketEvent("edit_approval_created", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("edit_approval_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("edit_approval_deleted", () => setRefreshKey(k => k + 1));

  const datedRequests = useMemo(
    () => requests.filter((r) => inDateRange(r.createdAt, exportFrom, exportTo)),
    [requests, exportFrom, exportTo],
  );

  const summary = useMemo(() => {
    const acc = { Pending: 0, Approved: 0, Completed: 0, Rejected: 0 };
    for (const r of datedRequests) {
      if (r.status === "Approved") {
        if (isRequestExpired(r)) acc.Completed++;
        else acc.Approved++;
      } else if (r.status === "Pending") {
        acc.Pending++;
      } else if (r.status === "Rejected") {
        acc.Rejected++;
      }
    }
    return acc;
  }, [datedRequests]);

  const filtered = useMemo(() => {
    let result = datedRequests.filter((r) =>
      filter === "Completed" ? isRequestExpired(r)
        : filter === "Approved" ? r.status === "Approved" && !isRequestExpired(r)
        : r.status === filter
    );
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((r) =>
      r.staffName.toLowerCase().includes(q) ||
      r.resourceName.toLowerCase().includes(q)
    );
    return result;
  }, [datedRequests, filter, search]);

  async function handleApprove(id: string, adminNote?: string) {
    try {
      const updated = await editApprovalsApi.approve(id, adminNote);
      setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
      if (updated.action === "Delete" && updated.resourceType === "Trip") {
        showSuccess(`Trip "${updated.resourceName}" has been deleted.`);
      } else if (updated.action === "Edit" && updated.resourceType === "FuelLog") {
        showSuccess("Fuel log updated — changes applied immediately.");
      } else if (updated.action === "Edit" && updated.resourceType === "MaintenanceRecord") {
        showSuccess("Maintenance record updated — changes applied immediately.");
      } else if (updated.action === "Edit" && updated.resourceType === "AdBlueLog") {
        showSuccess("AdBlue log updated — changes applied immediately.");
      } else {
        showSuccess("Edit access approved — Staff has 8 hours to make changes.");
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to approve request.");
    }
  }

  async function handleApproveDelete() {
    if (!deleteApproveReq) return;
    await handleApprove(deleteApproveReq.id, deleteApproveNote.trim());
    setDeleteApproveReq(null);
    setDeleteApproveNote("");
    setViewing(null);
  }

  async function handleReject(id: string) {
    try {
      const updated = await editApprovalsApi.reject(id);
      setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
      showSuccess("Request rejected.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to reject request.");
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selected.size === 0 || deleting) return;

    // Deleting a request row is permanent — there's no archive/audit trail for
    // this table (unlike resource deletions, which go through Deletion Approvals
    // and stay visible on Archive). A still-Pending request hasn't been reviewed
    // yet, so wiping it also erases the fact that it was ever requested — extra
    // friction here on top of the normal delete confirmation.
    const pendingCount = [...selected].filter((id) => requests.find((r) => r.id === id)?.status === "Pending").length;
    if (pendingCount > 0) {
      const warn = await confirmAction(
        `${pendingCount} of these ${pendingCount > 1 ? "are" : "is"} still Pending`,
        `${pendingCount} selected request${pendingCount > 1 ? "s haven't" : " hasn't"} been reviewed yet. Deleting removes it permanently with no record — it won't show up anywhere else. Continue?`,
        "Yes, I understand"
      );
      if (!warn.isConfirmed) return;
    }

    const res = await confirmDelete(`${selected.size} edit request${selected.size > 1 ? "s" : ""}`);
    if (!res.isConfirmed) return;
    setDeleting(true);
    const ids = [...selected];
    const failed: string[] = [];
    await Promise.all(
      ids.map((id) => editApprovalsApi.remove(id).catch(() => { failed.push(id); }))
    );
    setRequests((prev) => prev.filter((r) => !selected.has(r.id) || failed.includes(r.id)));
    setSelected(new Set());
    setDeleting(false);
    if (failed.length === 0) {
      showSuccess(`${ids.length} request${ids.length > 1 ? "s" : ""} deleted.`);
    } else {
      showError(`${ids.length - failed.length} deleted, ${failed.length} failed.`);
      loadData();
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch statCards={3} columns={5} />;

  const FILTERS: FilterValue[] = ["Pending", "Approved", "Completed", "Rejected"];

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-border bg-purple-surface text-purple-text shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Edit Approvals</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Review and approve non-Admin requests to edit or delete customer, vendor, driver, and truck records
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:max-w-2xl">
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Pending</p>
          <p className="mt-1 text-title-1-semibold text-warning-text">{summary.Pending}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Approved</p>
          <p className="mt-1 text-title-1-semibold text-success-text">{summary.Approved}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Completed</p>
          <p className="mt-1 text-title-1-semibold text-text-secondary">{summary.Completed}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Rejected</p>
          <p className="mt-1 text-title-1-semibold text-danger-text">{summary.Rejected}</p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "relative rounded-full px-4 py-2 text-body-medium shadow-sm transition",
              filter === f
                ? "bg-accent-solid text-on-solid"
                : "border border-separator-border bg-background-primary-default text-text-secondary hover:bg-fill-2"
            )}
          >
            {f}
            {f === "Pending" && summary.Pending > 0 && (
              <span className={cn(
                "absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-caption-2-semibold ring-2",
                filter === f ? "bg-warning-solid text-warning-text-strong ring-accent-solid" : "bg-danger-solid text-on-solid ring-background-primary-default"
              )}>
                {summary.Pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Toolbar: search on the left, export range + View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch value={search} onChange={setSearch} placeholder="Search by staff name or resource" />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill
            from={exportFrom}
            to={exportTo}
            onFromChange={(v) => { setExportFrom(v); setSelected(new Set()); }}
            onToChange={(v) => { setExportTo(v); setSelected(new Set()); }}
          />
          <DownloadExcelButton
            path="/edit-approvals/export"
            filename="edit_approvals.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      {/* Bulk delete bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-danger-border bg-danger-surface px-4 py-3">
          <span className="text-body-medium text-danger-text-strong">
            {selected.size} request{selected.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-border-button-default bg-background-primary-default px-3 py-1.5 text-caption-1-semibold text-text-secondary hover:bg-fill-2"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 rounded-lg bg-danger-solid px-3 py-1.5 text-caption-1-semibold text-on-solid hover:bg-danger-solid-hover disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "Deleting…" : `Delete ${selected.size}`}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-separator-border bg-background-primary-default shadow-sm">
        {filtered.length === 0 ? (
          <EmptyState size="compact" illustration="all-done" title="No edit approval requests" />
        ) : (
          <div className="overflow-auto max-h-[58vh]">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-separator-border bg-fill-1 text-left text-caption-1-semibold text-text-secondary">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                      onChange={() =>
                        setSelected(
                          filtered.every((r) => selected.has(r.id))
                            ? new Set()
                            : new Set(filtered.map((r) => r.id))
                        )
                      }
                      className="h-4 w-4 rounded border-border-button-default accent-danger-solid"
                      title="Select all"
                    />
                  </th>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Resource</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Requested At</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                {(req) => {
                  const isExpired = isRequestExpired(req);
                  return (
                    <tr key={req.id} className={cn("transition-colors", selected.has(req.id) ? "bg-danger-surface/60" : "hover:bg-fill-2")}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(req.id)}
                          onChange={() => toggleRow(req.id)}
                          className="h-4 w-4 rounded border-border-button-default accent-danger-solid"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-surface-strong">
                            <User className="h-3.5 w-3.5 text-accent-text" />
                          </div>
                          <div>
                            <p className="font-medium text-text-primary">{req.staffName}</p>
                            {req.staffCode && <p className="text-[11px] text-text-tertiary">{req.staffCode}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-text-primary">{req.resourceName}</p>
                        <p className="text-[11px] text-text-tertiary">{req.resourceType}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-caption-1-semibold",
                          req.action === "Edit"
                            ? "bg-accent-surface-strong text-accent-text"
                            : "bg-danger-surface-strong text-danger-text"
                        )}>
                          {req.action}
                        </span>
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setViewing(req)}
                          className="block max-w-[220px] truncate text-left text-accent-text hover:text-accent-text-strong hover:underline"
                          title="Click to view full request"
                        >
                          {req.reason}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{formatDate(req.createdAt)}</td>
                      <td className="px-4 py-3">
                        {req.status === "Pending" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-2.5 py-0.5 text-caption-1-semibold text-warning-text">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                        {req.status === "Approved" && (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-surface-strong px-2.5 py-0.5 text-caption-1-semibold text-success-text">
                              <ShieldCheck className="h-3 w-3" /> Approved
                            </span>
                            {req.expiresAt && (
                              <p className={cn(
                                "mt-0.5 text-[11px]",
                                isExpired ? "text-danger-text font-medium" : "text-text-tertiary"
                              )}>
                                {isExpired ? "Expired" : timeLeft(req.expiresAt)}
                              </p>
                            )}
                          </div>
                        )}
                        {req.status === "Rejected" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-danger-surface-strong px-2.5 py-0.5 text-caption-1-semibold text-danger-text">
                            <ShieldX className="h-3 w-3" /> Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setViewing(req)}
                            className="rounded-lg border border-border-button-default px-3 py-1.5 text-caption-1-medium text-text-primary hover:bg-fill-2 transition-colors"
                          >
                            View
                          </button>
                          {req.status === "Pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (req.action === "Delete" && req.resourceType === "Trip") {
                                    setDeleteApproveNote("");
                                    setDeleteApproveReq(req);
                                  } else {
                                    handleApprove(req.id);
                                  }
                                }}
                                className="rounded-lg bg-success-solid px-3 py-1.5 text-caption-1-medium text-on-solid hover:bg-success-solid-hover transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReject(req.id)}
                                className="rounded-lg bg-danger-surface-strong px-3 py-1.5 text-caption-1-medium text-danger-text hover:bg-danger-surface-strong transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }}
              </PagedTbody>
            </table>
          </div>
        )}
      </div>

      {/* Approve Trip Delete confirmation — admin must enter a note */}
      <Dialog
        open={deleteApproveReq !== null}
        onClose={() => { setDeleteApproveReq(null); setDeleteApproveNote(""); }}
        title="Confirm Trip Deletion"
        className="max-w-md"
      >
        {deleteApproveReq && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="rounded-lg border border-danger-border bg-danger-surface px-4 py-3 text-danger-text-strong">
              <p className="font-semibold">This will permanently delete trip:</p>
              <p className="mt-0.5 font-semibold">{deleteApproveReq.resourceName}</p>
              <p className="mt-1 text-xs text-danger-text">All related data (booking sheet, trip sheet, invoice) will be deleted. This cannot be undone.</p>
            </div>
            <div>
              <p className="text-caption-2-semibold text-text-tertiary">Commercial Manager&apos;s Reason</p>
              <p className="mt-1 rounded-lg border border-separator-border bg-fill-1 px-3 py-2 text-text-primary">
                {deleteApproveReq.reason}
              </p>
            </div>
            <div>
              <label className="text-caption-2-semibold text-text-tertiary">
                Admin Note <span className="text-danger-text">*</span>
              </label>
              <textarea
                value={deleteApproveNote}
                onChange={(e) => setDeleteApproveNote(e.target.value)}
                placeholder="Enter the reason for approving this deletion…"
                rows={3}
                className="mt-1 w-full rounded-lg border border-separator-border px-3 py-2 text-sm text-text-primary outline-none focus:border-danger-border-strong focus:ring-2 focus:ring-danger-border"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-separator-border pt-2">
              <button
                type="button"
                onClick={() => { setDeleteApproveReq(null); setDeleteApproveNote(""); }}
                className="rounded-lg border border-border-button-default bg-background-primary-default px-4 py-2 text-caption-1-medium text-text-secondary hover:bg-fill-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!deleteApproveNote.trim()}
                onClick={handleApproveDelete}
                className="rounded-lg bg-danger-solid px-4 py-2 text-caption-1-medium text-on-solid hover:bg-danger-solid-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Request detail modal */}
      <Dialog open={viewing !== null} onClose={() => setViewing(null)} title="Edit Request Details" className="max-w-2xl">
        {viewing && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-caption-2-semibold text-text-tertiary">Requested By</p>
                <p className="mt-0.5 font-medium text-text-primary">{viewing.staffName}</p>
                {viewing.staffCode && <p className="text-[11px] text-text-tertiary">{viewing.staffCode}</p>}
              </div>
              <div>
                <p className="text-caption-2-semibold text-text-tertiary">Requested At</p>
                <p className="mt-0.5 text-text-primary">{formatDate(viewing.createdAt)}</p>
              </div>
              <div>
                <p className="text-caption-2-semibold text-text-tertiary">Resource</p>
                <p className="mt-0.5 font-medium text-text-primary">{viewing.resourceName}</p>
                <p className="text-[11px] text-text-tertiary">{viewing.resourceType}</p>
              </div>
              <div>
                <p className="text-caption-2-semibold text-text-tertiary">Action</p>
                <span className={cn(
                  "mt-0.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-caption-1-semibold",
                  viewing.action === "Edit" ? "bg-accent-surface-strong text-accent-text" : "bg-danger-surface-strong text-danger-text"
                )}>
                  {viewing.action}
                </span>
              </div>
            </div>

            <div>
              <p className="text-caption-2-semibold text-text-tertiary">Reason</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg border border-separator-border bg-fill-1 px-3 py-2 text-text-primary">
                {viewing.reason || "—"}
              </p>
            </div>

            {viewing.proposedChanges && (viewing.resourceType === "FuelLog" || viewing.resourceType === "MaintenanceRecord" || viewing.resourceType === "AdBlueLog") && (
              <div>
                <p className="text-caption-2-semibold text-text-tertiary">Proposed Changes</p>
                <div className="mt-1 rounded-lg border border-accent-border bg-accent-surface px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  {/* vendor_id is an internal link — maintenance_by already shows the vendor's name. */}
                  {Object.entries(viewing.proposedChanges).filter(([k]) => k !== "vendor_id").map(([k, v]) => (
                    <div key={k} className="flex gap-1.5">
                      <span className="text-accent-text capitalize min-w-[90px]">{viewing.resourceType === "AdBlueLog" && k === "supplier" ? "filling location" : k.replace(/_/g, " ")}:</span>
                      <span className="font-semibold text-accent-text-strong">{String(v ?? "—")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewing.adminNote && (
              <div>
                <p className="text-caption-2-semibold text-text-tertiary">Admin Note</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-warning-text-strong">
                  {viewing.adminNote}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-separator-border pt-4">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption-1-semibold",
                viewing.status === "Pending" ? "bg-warning-surface-strong text-warning-text"
                  : viewing.status === "Approved" ? "bg-success-surface-strong text-success-text"
                  : "bg-danger-surface-strong text-danger-text"
              )}>
                {viewing.status}
              </span>
              {viewing.status === "Pending" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { handleReject(viewing.id); setViewing(null); }}
                    className="rounded-lg bg-danger-surface-strong px-4 py-2 text-caption-1-medium text-danger-text hover:bg-danger-surface-strong transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (viewing.action === "Delete" && viewing.resourceType === "Trip") {
                        setDeleteApproveNote("");
                        setDeleteApproveReq(viewing);
                      } else {
                        handleApprove(viewing.id);
                        setViewing(null);
                      }
                    }}
                    className="rounded-lg bg-success-solid px-4 py-2 text-caption-1-medium text-on-solid hover:bg-success-solid-hover transition-colors"
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/* Edit History — every Approved/Rejected decision ever logged, across
          every edit approval request, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by staff, resource, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q ||
              ev.staffName.toLowerCase().includes(q) ||
              ev.resourceName.toLowerCase().includes(q) ||
              ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No decisions have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Staff</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Resource</th>
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
                          <td className="px-3 py-2 font-semibold text-text-primary">{ev.staffName}</td>
                          <td className="px-3 py-2 text-text-secondary">
                            {ev.resourceName} <span className="text-[11px] text-text-tertiary">({ev.resourceType})</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{ev.actorName}</td>
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
