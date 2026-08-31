"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ShieldAlert, ShieldCheck, ShieldX, Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { editApprovalsApi } from "@/lib/api";
import type { EditApprovalRequest } from "@/types/edit-approval";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Dialog } from "@/components/ui/Dialog";
import { showSuccess, showError, confirmDelete } from "@/lib/swal";
import { Trash2 } from "lucide-react";

type FilterValue = "Pending" | "Approved" | "Rejected";

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
  const [requests, setRequests] = useState<EditApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("Pending");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewing, setViewing] = useState<EditApprovalRequest | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteApproveReq, setDeleteApproveReq] = useState<EditApprovalRequest | null>(null);
  const [deleteApproveNote, setDeleteApproveNote] = useState("");

  async function loadData() {
    try {
      const data = await editApprovalsApi.list();
      setRequests(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey(k => k + 1), 3000);
  useWebSocketEvent("edit_approval_created", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("edit_approval_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("edit_approval_deleted", () => setRefreshKey(k => k + 1));

  const summary = useMemo(() => {
    return requests.reduce(
      (acc, r) => { acc[r.status] += 1; return acc; },
      { Pending: 0, Approved: 0, Rejected: 0 } as Record<string, number>
    );
  }, [requests]);

  const filtered = useMemo(() => {
    let result = requests.filter((r) => r.status === filter);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((r) =>
      r.staffName.toLowerCase().includes(q) ||
      r.resourceName.toLowerCase().includes(q)
    );
    return result;
  }, [requests, filter, search]);

  async function handleApprove(id: string, adminNote?: string) {
    try {
      const updated = await editApprovalsApi.approve(id, adminNote);
      setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
      if (updated.action === "Delete" && updated.resourceType === "Trip") {
        showSuccess(`Trip "${updated.resourceName}" has been deleted.`);
      } else if (updated.action === "Edit" && updated.resourceType === "FuelLog") {
        showSuccess("Fuel log updated — changes applied immediately.");
      } else {
        showSuccess("Edit access approved — Staff has 5 hours to make changes.");
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

  const FILTERS: FilterValue[] = ["Pending", "Approved", "Rejected"];

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Approvals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and approve Staff requests to edit or delete customer and vendor records
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 sm:max-w-md">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Pending</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600">{summary.Pending}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Approved</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{summary.Approved}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Rejected</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{summary.Rejected}</p>
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
              "relative rounded-full px-4 py-2 text-sm font-medium shadow-sm transition-all",
              filter === f
                ? "bg-blue-600 text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            )}
          >
            {f}
            {f === "Pending" && summary.Pending > 0 && (
              <span className={cn(
                "absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ring-2",
                filter === f ? "bg-amber-400 text-amber-900 ring-blue-600" : "bg-red-500 text-white ring-white"
              )}>
                {summary.Pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by staff name or resource"
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Bulk delete bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="text-sm font-medium text-red-800">
            {selected.size} request{selected.size > 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "Deleting…" : `Delete ${selected.size}`}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/40 shadow-sm backdrop-blur-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <ShieldAlert className="h-8 w-8 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">No edit approval requests</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[58vh]">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                      className="h-4 w-4 rounded border-gray-300 accent-red-600"
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
              <tbody className="divide-y divide-gray-50">
                {filtered.map((req) => {
                  const isExpired = req.expiresAt
                    ? new Date(req.expiresAt.endsWith("Z") ? req.expiresAt : req.expiresAt + "Z") < new Date()
                    : false;
                  return (
                    <tr key={req.id} className={cn("transition-colors", selected.has(req.id) ? "bg-red-50/60" : "hover:bg-white/60")}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(req.id)}
                          onChange={() => toggleRow(req.id)}
                          className="h-4 w-4 rounded border-gray-300 accent-red-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
                            <User className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{req.staffName}</p>
                            {req.staffCode && <p className="text-[11px] text-gray-400">{req.staffCode}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{req.resourceName}</p>
                        <p className="text-[11px] text-gray-400">{req.resourceType}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          req.action === "Edit"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-red-100 text-red-700"
                        )}>
                          {req.action}
                        </span>
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setViewing(req)}
                          className="block max-w-[220px] truncate text-left text-blue-600 hover:text-blue-800 hover:underline"
                          title="Click to view full request"
                        >
                          {req.reason}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(req.createdAt)}</td>
                      <td className="px-4 py-3">
                        {req.status === "Pending" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                        {req.status === "Approved" && (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                              <ShieldCheck className="h-3 w-3" /> Approved
                            </span>
                            {req.expiresAt && (
                              <p className={cn(
                                "mt-0.5 text-[11px]",
                                isExpired ? "text-red-500 font-medium" : "text-gray-400"
                              )}>
                                {isExpired ? "Expired" : timeLeft(req.expiresAt)}
                              </p>
                            )}
                          </div>
                        )}
                        {req.status === "Rejected" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                            <ShieldX className="h-3 w-3" /> Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setViewing(req)}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
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
                                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReject(req.id)}
                                className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
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
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
              <p className="font-semibold">This will permanently delete trip:</p>
              <p className="mt-0.5 font-bold">{deleteApproveReq.resourceName}</p>
              <p className="mt-1 text-xs text-red-600">All related data (booking sheet, trip sheet, invoice) will be deleted. This cannot be undone.</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Commercial Manager&apos;s Reason</p>
              <p className="mt-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-gray-700">
                {deleteApproveReq.reason}
              </p>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Admin Note <span className="text-red-500">*</span>
              </label>
              <textarea
                value={deleteApproveNote}
                onChange={(e) => setDeleteApproveNote(e.target.value)}
                placeholder="Enter the reason for approving this deletion…"
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-2">
              <button
                type="button"
                onClick={() => { setDeleteApproveReq(null); setDeleteApproveNote(""); }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!deleteApproveNote.trim()}
                onClick={handleApproveDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
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
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Requested By</p>
                <p className="mt-0.5 font-medium text-gray-900">{viewing.staffName}</p>
                {viewing.staffCode && <p className="text-[11px] text-gray-400">{viewing.staffCode}</p>}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Requested At</p>
                <p className="mt-0.5 text-gray-700">{formatDate(viewing.createdAt)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Resource</p>
                <p className="mt-0.5 font-medium text-gray-900">{viewing.resourceName}</p>
                <p className="text-[11px] text-gray-400">{viewing.resourceType}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Action</p>
                <span className={cn(
                  "mt-0.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  viewing.action === "Edit" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                )}>
                  {viewing.action}
                </span>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Reason</p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-gray-700">
                {viewing.reason || "—"}
              </p>
            </div>

            {viewing.proposedChanges && viewing.resourceType === "FuelLog" && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Proposed Changes</p>
                <div className="mt-1 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  {Object.entries(viewing.proposedChanges).map(([k, v]) => (
                    <div key={k} className="flex gap-1.5">
                      <span className="text-blue-400 capitalize min-w-[90px]">{k.replace(/_/g, " ")}:</span>
                      <span className="font-semibold text-blue-900">{String(v ?? "—")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewing.adminNote && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Admin Note</p>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-amber-800">
                  {viewing.adminNote}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                viewing.status === "Pending" ? "bg-yellow-100 text-yellow-700"
                  : viewing.status === "Approved" ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              )}>
                {viewing.status}
              </span>
              {viewing.status === "Pending" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { handleReject(viewing.id); setViewing(null); }}
                    className="rounded-lg bg-red-100 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-200 transition-colors"
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
                    className="rounded-lg bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-700 transition-colors"
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
