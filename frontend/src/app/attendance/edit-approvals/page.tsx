"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ShieldAlert, ShieldCheck, ShieldX, Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { editApprovalsApi } from "@/lib/api";
import type { EditApprovalRequest } from "@/types/edit-approval";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";

type FilterValue = "All" | "Pending" | "Approved" | "Rejected";

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
  return new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function EditApprovalsPage() {
  const [requests, setRequests] = useState<EditApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("All");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  async function loadData() {
    try {
      const data = await editApprovalsApi.list();
      setRequests(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [refreshKey]);
  useAutoRefresh(loadData, 5000);
  useWebSocketEvent("edit_approval_created", loadData);
  useWebSocketEvent("edit_approval_updated", loadData);

  const summary = useMemo(() => {
    return requests.reduce(
      (acc, r) => { acc[r.status] += 1; return acc; },
      { Pending: 0, Approved: 0, Rejected: 0 } as Record<string, number>
    );
  }, [requests]);

  const filtered = useMemo(() => {
    let result = requests;
    if (filter !== "All") result = result.filter((r) => r.status === filter);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((r) =>
      r.staffName.toLowerCase().includes(q) ||
      r.resourceName.toLowerCase().includes(q)
    );
    return result;
  }, [requests, filter, search]);

  async function handleApprove(id: string) {
    try {
      const updated = await editApprovalsApi.approve(id);
      setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
      showSuccess("Edit access approved — Staff has 1 hour to make changes.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to approve request.");
    }
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

  if (loading) return <PageSkeleton hasButton={false} hasSearch statCards={3} columns={5} />;

  const FILTERS: FilterValue[] = ["All", "Pending", "Approved", "Rejected"];

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

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/80 bg-white/40 shadow-sm backdrop-blur-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <ShieldAlert className="h-8 w-8 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">No edit approval requests</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                    <tr key={req.id} className="transition-colors hover:bg-white/60">
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
                      <td className="max-w-[200px] px-4 py-3">
                        <p className="truncate text-gray-600" title={req.reason}>{req.reason}</p>
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
                        {req.status === "Pending" && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleApprove(req.id)}
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
                          </div>
                        )}
                        {req.status !== "Pending" && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
