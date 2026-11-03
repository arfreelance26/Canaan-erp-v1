"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { LeaveApprovalTable } from "@/components/attendance/LeaveApprovalTable";
import { attendanceApi, type LeaveRequestEditEventRow } from "@/lib/api";
import { LEAVE_CATEGORIES } from "@/lib/leave-request-data";
import type { LeaveApplicantCategory, LeaveRequest } from "@/types/leave-request";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/feedback";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { PillSearch } from "@/components/ui/PillSearch";
import { RiCheckboxCircleLine as CheckCircle2, RiHistoryLine as History, RiSendPlaneLine as Send, RiCheckLine as Check, RiCloseLine as X } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { formatDateTime, inDateRange } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
const EDIT_EVENT_ICON: Record<LeaveRequestEditEventRow["event"], typeof Send> = {
  "Leave Requested": Send,
  "Leave Approved": Check,
  "Leave Rejected": X,
};

const EDIT_EVENT_COLOR: Record<LeaveRequestEditEventRow["event"], string> = {
  "Leave Requested": "bg-accent-surface-strong text-accent-text",
  "Leave Approved": "bg-success-surface-strong text-success-text",
  "Leave Rejected": "bg-danger-surface-strong text-danger-text",
};

const categoryLabels: Record<LeaveApplicantCategory, string> = {
  Driver: "Drivers",
  "Commercial Manager": "Commercial Managers",
  "Assistant Commercial Manager": "Asst. Commercial Managers",
  Accounts: "Accounts",
  Maintenance: "Maintenance",
  "Trip Sheet Register": "Trip Sheet Registers",
  "Yard Supervisor": "Yard Supervisors",
  Auditor: "Auditors",
};

type FilterValue = "All" | LeaveApplicantCategory;

export default function LeaveApprovalsPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("All");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<LeaveRequestEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    attendanceApi.listLeaveRequestEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
        attendanceApi.listLeaveRequests().then(setRequests).catch(() => {}).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("leave_request_created", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("leave_request_updated", () => setRefreshKey(k => k + 1));


  const datedRequests = useMemo(
    () => requests.filter((r) => inDateRange(r.fromDate, exportFrom, exportTo)),
    [requests, exportFrom, exportTo],
  );

  const summary = useMemo(() => {
    const counts = { Pending: 0, Approved: 0, Rejected: 0 };
    for (const request of datedRequests) {
      counts[request.status] += 1;
    }
    return counts;
  }, [datedRequests]);

  const filteredRequests = useMemo(() => {
    let result = datedRequests;
    if (filter !== "All") {
      result = result.filter((request) => request.category === filter);
    }
    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((request) => request.applicantName.toLowerCase().includes(query));
    }
    return result;
  }, [datedRequests, filter, search]);

  const pendingCounts = useMemo(() => {
    const counts: Record<FilterValue, number> = {
      All: 0,
      Driver: 0,
      "Commercial Manager": 0,
      "Assistant Commercial Manager": 0,
      Accounts: 0,
      Maintenance: 0,
      "Trip Sheet Register": 0,
      "Yard Supervisor": 0,
      Auditor: 0,
    };
    for (const request of datedRequests) {
      if (request.status !== "Pending") continue;
      counts[request.category] += 1;
      counts.All += 1;
    }
    return counts;
  }, [datedRequests]);

  async function handleApprove(id: string) {
    try {
      const updated = await attendanceApi.approveLeave(id);
      setRequests((prev) =>
        prev.map((request) => (request.id === id ? updated : request))
      );
      showSuccess("Leave request approved.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to approve leave request.");
    }
  }

  async function handleReject(id: string) {
    try {
      const updated = await attendanceApi.rejectLeave(id);
      setRequests((prev) =>
        prev.map((request) => (request.id === id ? updated : request))
      );
      showSuccess("Leave request rejected.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to reject leave request.");
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch statCards={3} columns={5} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-warning-border bg-warning-surface text-warning-text shadow-sm">
              <CheckCircle2 className="h-5 w-5" />
            </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Leave Approvals</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Review and respond to leave requests from drivers, commercial managers, accounts, maintenance, and staff
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

      <div className="grid grid-cols-3 gap-4 sm:max-w-md">
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Pending</p>
          <p className="mt-1 text-title-1-semibold text-warning-text">{summary.Pending}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Approved</p>
          <p className="mt-1 text-title-1-semibold text-success-text">{summary.Approved}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Rejected</p>
          <p className="mt-1 text-title-1-semibold text-danger-text">{summary.Rejected}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => setFilter("All")}
          className={cn(
            "relative rounded-full px-4 py-2 text-body-medium shadow-sm transition",
            filter === "All"
              ? "bg-accent-solid text-on-solid"
              : "border border-separator-border bg-background-primary-default text-text-secondary hover:border-border-button-default hover:bg-fill-2"
          )}
        >
          All
          {pendingCounts.All > 0 && (
            <span
              className={cn(
                "absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-caption-2-semibold ring-2",
                filter === "All"
                  ? "bg-warning-solid text-warning-text-strong ring-accent-solid"
                  : "bg-danger-solid text-on-solid ring-background-primary-default"
              )}
            >
              {pendingCounts.All}
            </span>
          )}
        </button>
        {LEAVE_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setFilter(category)}
            className={cn(
              "relative rounded-full px-4 py-2 text-body-medium shadow-sm transition",
              filter === category
                ? "bg-accent-solid text-on-solid"
                : "border border-separator-border bg-background-primary-default text-text-secondary hover:border-border-button-default hover:bg-fill-2"
            )}
          >
            {categoryLabels[category]}
            {pendingCounts[category] > 0 && (
              <span
                className={cn(
                  "absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-caption-2-semibold ring-2",
                  filter === category
                    ? "bg-warning-solid text-warning-text-strong ring-accent-solid"
                    : "bg-danger-solid text-on-solid ring-background-primary-default"
                )}
              >
                {pendingCounts[category]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Toolbar: search on the left, export range + View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch value={search} onChange={setSearch} placeholder="Search by applicant name" />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/exports/leave-requests"
            filename="leave_requests.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      <LeaveApprovalTable requests={filteredRequests} onApprove={handleApprove} onReject={handleReject} />

      {/* Edit History — every Requested/Approved/Rejected event ever logged,
          across every leave request, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by applicant or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q || ev.applicantName.toLowerCase().includes(q) || ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "all-done" : "not-found"} title={editHistoryEvents.length === 0 ? "No leave requests have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Applicant</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-separator-border">
                    {filtered.map((ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={`${ev.id}-${ev.event}`}>
                          <td className="px-3 py-2 font-semibold text-text-primary">
                            {ev.applicantName} <span className="text-caption-2-regular text-text-tertiary">({ev.category})</span>
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
