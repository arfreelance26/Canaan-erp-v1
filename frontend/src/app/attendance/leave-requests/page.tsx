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

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

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
