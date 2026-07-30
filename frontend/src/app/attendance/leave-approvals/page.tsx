"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { LeaveApprovalTable } from "@/components/attendance/LeaveApprovalTable";
import { attendanceApi } from "@/lib/api";
import { LEAVE_CATEGORIES } from "@/lib/leave-request-data";
import type { LeaveApplicantCategory, LeaveRequest } from "@/types/leave-request";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

const categoryLabels: Record<LeaveApplicantCategory, string> = {
  Driver: "Drivers",
  "Commercial Manager": "Commercial Managers",
  "Assistant Commercial Manager": "Asst. Commercial Managers",
  Accounts: "Accounts",
  Maintenance: "Maintenance",
  "Trip Sheet Register": "Trip Sheet Registers",
  "Yard Supervisor": "Yard Supervisors",
};

type FilterValue = "All" | LeaveApplicantCategory;

export default function LeaveApprovalsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("All");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  useEffect(() => {
        attendanceApi.listLeaveRequests().then(setRequests).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("leave_request_created", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("leave_request_updated", () => setRefreshKey(k => k + 1));


  const summary = useMemo(() => {
    const counts = { Pending: 0, Approved: 0, Rejected: 0 };
    for (const request of requests) {
      counts[request.status] += 1;
    }
    return counts;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    let result = requests;
    if (filter !== "All") {
      result = result.filter((request) => request.category === filter);
    }
    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter((request) => request.applicantName.toLowerCase().includes(query));
    }
    return result;
  }, [requests, filter, search]);

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
    };
    for (const request of requests) {
      if (request.status !== "Pending") continue;
      counts[request.category] += 1;
      counts.All += 1;
    }
    return counts;
  }, [requests]);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Approvals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and respond to leave requests from drivers, commercial managers, accounts, maintenance, and staff
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={exportFrom}
            onChange={(e) => setExportFrom(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white/50 px-3 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            title="Report from date"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={exportTo}
            onChange={(e) => setExportTo(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white/50 px-3 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            title="Report to date"
          />
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

      <div className="grid grid-cols-3 gap-4 sm:max-w-md">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Pending</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600">{summary.Pending}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Approved</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{summary.Approved}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Rejected</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{summary.Rejected}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => setFilter("All")}
          className={cn(
            "relative rounded-full px-4 py-2 text-sm font-medium shadow-sm transition-all",
            filter === "All"
              ? "bg-blue-600 text-white shadow-blue-200"
              : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
          )}
        >
          All
          {pendingCounts.All > 0 && (
            <span
              className={cn(
                "absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ring-2",
                filter === "All"
                  ? "bg-amber-400 text-amber-900 ring-blue-600"
                  : "bg-red-500 text-white ring-white"
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
              "relative rounded-full px-4 py-2 text-sm font-medium shadow-sm transition-all",
              filter === category
                ? "bg-blue-600 text-white shadow-blue-200"
                : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
            )}
          >
            {categoryLabels[category]}
            {pendingCounts[category] > 0 && (
              <span
                className={cn(
                  "absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ring-2",
                  filter === category
                    ? "bg-amber-400 text-amber-900 ring-blue-600"
                    : "bg-red-500 text-white ring-white"
                )}
              >
                {pendingCounts[category]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by applicant name"
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <LeaveApprovalTable requests={filteredRequests} onApprove={handleApprove} onReject={handleReject} />
    </div>
  );
}
