"use client";

import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { LeaveApprovalTable } from "@/components/attendance/LeaveApprovalTable";
import { LeaveRequestFormDialog } from "@/components/attendance/LeaveRequestFormDialog";
import { attendanceApi } from "@/lib/api";
import { showSuccess, showError } from "@/lib/swal";
import type { LeaveRequest } from "@/types/leave-request";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

export default function LeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  async function loadRequests() {
    try {
      const data = await attendanceApi.listLeaveRequests();
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

  const filteredRequests = requests.filter((r) => !searchQuery || r.applicantName?.toLowerCase().includes(searchQuery.toLowerCase()) || r.category?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="mt-1 text-sm text-gray-500">
            Submit and track leave requests for staff and drivers
          </p>
        </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
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
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Submit Leave Request
          </button>
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
