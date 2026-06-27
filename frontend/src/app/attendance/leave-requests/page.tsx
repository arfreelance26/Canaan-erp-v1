"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { LeaveApprovalTable } from "@/components/attendance/LeaveApprovalTable";
import { LeaveRequestFormDialog } from "@/components/attendance/LeaveRequestFormDialog";
import { attendanceApi } from "@/lib/api";
import { showSuccess, showError } from "@/lib/swal";
import type { LeaveRequest } from "@/types/leave-request";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

export default function LeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  async function loadRequests() {
    try {
      const data = await attendanceApi.listLeaveRequests();
      setRequests(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  useAutoRefresh(loadRequests, 5000);

  async function handleSave(payload: Omit<LeaveRequest, "id" | "status" | "appliedAt">) {
    await attendanceApi.createLeaveRequest(payload);
    showSuccess("Leave request submitted successfully.");
    loadRequests();
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

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="mt-1 text-sm text-gray-500">
            Submit and track leave requests for staff and drivers
          </p>
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

      <LeaveApprovalTable requests={requests} />

      <LeaveRequestFormDialog
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
