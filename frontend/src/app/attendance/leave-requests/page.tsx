"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LeaveApprovalTable } from "@/components/attendance/LeaveApprovalTable";
import { LeaveRequestFormDialog } from "@/components/attendance/LeaveRequestFormDialog";
import { attendanceApi } from "@/lib/api";
import { showSuccess, showError } from "@/lib/swal";
import type { LeaveRequest } from "@/types/leave-request";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

import { PillSearch } from "@/components/ui/PillSearch";
import { Segmented } from "@/components/ui/Segmented";
import { DateRangePill } from "@/components/ui/DateRangePill";
export default function LeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Pending" | "Approved" | "Rejected">("all");
  // Last seen status of each of my requests, so a decision made in Leave Approvals can announce itself.
  const lastStatus = useRef<Map<string, string> | null>(null);

  async function loadRequests() {
    try {
      // Only the requests I filed — the server enforces this too.
      const data = await attendanceApi.listLeaveRequests(undefined, "mine");
      if (lastStatus.current) {
        for (const r of data) {
          const before = lastStatus.current.get(r.id);
          if (before === "Pending" && r.status === "Approved") showSuccess("Your leave request was approved.");
          if (before === "Pending" && r.status === "Rejected") showError("Your leave request was rejected.");
        }
      }
      lastStatus.current = new Map(data.map((r) => [r.id, r.status]));
      setRequests(data);
    } catch {
      // silent — UI stays on previous data
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("leave_request_created", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("leave_request_updated", () => setRefreshKey(k => k + 1));

  async function handleSave(payload: Omit<LeaveRequest, "id" | "status" | "appliedAt">) {
    try {
      await attendanceApi.createLeaveRequest(payload);
      showSuccess("Leave request submitted successfully.");
      setIsFormOpen(false);
      loadRequests();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to submit leave request.");
    }
  }

  if (loading) return (
    <div className="flex flex-col gap-6 animate-pulse p-2">
      <div className="flex justify-between">
        <div className="space-y-3">
          <div className="h-8 w-48 rounded-lg bg-slate-200"></div>
          <div className="h-4 w-72 rounded bg-slate-100"></div>
        </div>
        <div className="h-10 w-40 rounded-lg bg-slate-200"></div>
      </div>
      <div className="rounded-xl border border-white/80 bg-white/40 shadow-sm backdrop-blur-sm h-[400px]">
        <div className="h-12 border-b border-white/50 bg-slate-50/50"></div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-slate-100/50">
            <div className="h-5 w-32 rounded bg-slate-200/60"></div>
            <div className="h-5 w-24 rounded bg-slate-100"></div>
            <div className="h-5 w-24 rounded bg-slate-100"></div>
            <div className="h-5 w-48 rounded bg-slate-100"></div>
          </div>
        ))}
      </div>
    </div>
  );

  const counts = {
    all: requests.length,
    Pending: requests.filter((r) => r.status === "Pending").length,
    Approved: requests.filter((r) => r.status === "Approved").length,
    Rejected: requests.filter((r) => r.status === "Rejected").length,
  };
  const filteredRequests = requests.filter(
    (r) =>
      (statusFilter === "all" || r.status === statusFilter) &&
      (!searchQuery ||
        r.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.status.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.applicantName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.category?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="mt-1 text-sm text-gray-500">
            Submit your leave requests and track whether they have been approved
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsFormOpen(true)}
          className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
        >
          <Plus className="h-4 w-4" />
          Submit Leave Request
        </button>
      </div>

      {/* Toolbar: search on the left, export range + View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search requests..." value={searchQuery} onChange={setSearchQuery} />
        <Segmented
          size="md"
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "Pending", label: "Pending", count: counts.Pending },
            { value: "Approved", label: "Approved", count: counts.Approved },
            { value: "Rejected", label: "Rejected", count: counts.Rejected },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/exports/leave-requests"
            filename="leave_requests.xlsx"
            params={{
              scope: "mine",
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      <LeaveApprovalTable requests={filteredRequests} />

      <LeaveRequestFormDialog
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
