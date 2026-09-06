"use client";

import { useState } from "react";
import { X, ShieldAlert } from "lucide-react";
import type { EditApprovalAction, EditApprovalResourceType } from "@/types/edit-approval";

type Props = {
  open: boolean;
  resourceType: EditApprovalResourceType;
  resourceName: string;
  action: EditApprovalAction;
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
  rejectionContext?: string;
  /** True when the caller (an Admin) performs the action immediately on submit —
   * no approval step involved. Swaps the copy from "requesting approval" to a
   * plain "you're about to do this, say why" confirmation. */
  directAction?: boolean;
};

export function EditRequestDialog({ open, resourceType, resourceName, action, onSubmit, onClose, rejectionContext, directAction }: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
      setReason("");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setReason("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/60 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${directAction ? "bg-red-100" : "bg-amber-100"}`}>
              <ShieldAlert className={`h-4 w-4 ${directAction ? "text-red-600" : "text-amber-600"}`} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900">
                {directAction ? `${action} ${resourceType}` : `Request ${action} Access`}
              </h2>
              <p className="text-[11px] text-gray-500">
                {directAction ? "This action cannot be undone" : rejectionContext ? "Kumar (Commercial Manager) approval required" : "Admin approval required"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          {rejectionContext && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3">
              <p className="text-[11px] font-bold text-rose-700 mb-1">Accounts Rejection Reason:</p>
              <p className="text-sm text-rose-700">{rejectionContext}</p>
            </div>
          )}
          <div className={`rounded-xl border px-4 py-3 text-sm ${directAction ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
            {directAction
              ? <>You are about to <span className="font-semibold">{action.toLowerCase()}</span>:{" "}
                  <span className="font-semibold">{resourceName}</span>
                  <span className="ml-1 opacity-80">({resourceType})</span></>
              : rejectionContext
              ? <>Requesting edit approval from <span className="font-semibold">Kumar (Commercial Manager)</span> for: <span className="font-semibold">{resourceName}</span></>
              : <>You are requesting <span className="font-semibold">{action}</span> access for:{" "}
                  <span className="font-semibold">{resourceName}</span>
                  <span className="ml-1 text-amber-600">({resourceType})</span></>
            }
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-gray-700">
              {directAction ? `Reason for ${action.toLowerCase()}?` : "Reason of the Edit Request?"} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={directAction ? "Describe why this is being deleted..." : "Describe why you need to make this change..."}
              rows={4}
              required
              className="w-full resize-none rounded-lg border border-gray-200 bg-white/50 px-3 py-2.5 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed ${directAction ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}
            >
              {submitting ? (directAction ? "Deleting..." : "Sending...") : (directAction ? `${action}` : "Send Request")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
