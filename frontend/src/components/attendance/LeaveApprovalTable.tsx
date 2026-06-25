"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeaveRequest } from "@/types/leave-request";

type LeaveApprovalTableProps = {
  requests: LeaveRequest[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

const columns = ["Applicant", "Category", "From", "To", "Reason", "Applied On", "Status", "Actions"];

const statusStyles: Record<string, string> = {
  Pending: "bg-yellow-50 text-yellow-700",
  Approved: "bg-green-50 text-green-700",
  Rejected: "bg-red-50 text-red-700",
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LeaveApprovalTable({ requests, onApprove, onReject }: LeaveApprovalTableProps) {
  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
        No leave requests.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((column) => (
              <th
                key={column}
                className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {requests.map((request) => (
            <tr key={request.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">{request.applicantName}</div>
                <div className="text-xs text-gray-500">{request.applicantCode}</div>
              </td>
              <td className="px-4 py-3 text-gray-600">{request.category}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(request.fromDate)}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(request.toDate)}</td>
              <td className="px-4 py-3 text-gray-600">{request.reason}</td>
              <td className="px-4 py-3 text-gray-600">{formatDateTime(request.appliedAt)}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    statusStyles[request.status] ?? "bg-gray-100 text-gray-600"
                  )}
                >
                  {request.status}
                </span>
              </td>
              <td className="px-4 py-3">
                {request.status === "Pending" ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onApprove(request.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onReject(request.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
