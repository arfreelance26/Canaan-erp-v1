"use client";

import { useState } from "react";
import { RiCloseLine as X, RiShieldFlashLine as ShieldAlert } from "@remixicon/react";
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
      <div className="absolute inset-0 bg-scrim/40" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-separator-border bg-background-primary-default shadow-2xl">
        <div className="flex items-center justify-between border-b border-separator-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${directAction ? "bg-danger-surface-strong" : "bg-warning-surface-strong"}`}>
              <ShieldAlert className={`h-4 w-4 ${directAction ? "text-danger-text" : "text-warning-text"}`} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">
                {directAction ? `${action} ${resourceType}` : `Request ${action} Access`}
              </h2>
              <p className="text-[11px] text-text-secondary">
                {directAction ? "This action cannot be undone" : rejectionContext ? "Kumar (Commercial Manager) approval required" : "Admin approval required"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary hover:bg-fill-3 hover:text-text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          {rejectionContext && (
            <div className="rounded-xl bg-danger-surface border border-danger-border px-4 py-3">
              <p className="text-caption-2-semibold text-danger-text mb-1">Accounts Rejection Reason:</p>
              <p className="text-sm text-danger-text">{rejectionContext}</p>
            </div>
          )}
          <div className={`rounded-xl border px-4 py-3 text-sm ${directAction ? "bg-danger-surface border-danger-border text-danger-text-strong" : "bg-warning-surface border-warning-border text-warning-text-strong"}`}>
            {directAction
              ? <>You are about to <span className="font-semibold">{action.toLowerCase()}</span>:{" "}
                  <span className="font-semibold">{resourceName}</span>
                  <span className="ml-1 opacity-80">({resourceType})</span></>
              : rejectionContext
              ? <>Requesting edit approval from <span className="font-semibold">Kumar (Commercial Manager)</span> for: <span className="font-semibold">{resourceName}</span></>
              : <>You are requesting <span className="font-semibold">{action}</span> access for:{" "}
                  <span className="font-semibold">{resourceName}</span>
                  <span className="ml-1 text-warning-text">({resourceType})</span></>
            }
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-body-2-medium text-text-primary">
              {directAction ? `Reason for ${action.toLowerCase()}?` : "Reason of the Edit Request?"} <span className="text-danger-text">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={directAction ? "Describe why this is being deleted..." : "Describe why you need to make this change..."}
              rows={4}
              required
              className="w-full resize-none rounded-lg border border-separator-border bg-background-primary-default px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-placeholder focus:border-accent-solid focus:bg-background-primary-default focus:ring-4 focus:ring-accent-solid/10"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-secondary hover:bg-fill-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-body-medium text-on-solid disabled:opacity-50 disabled:cursor-not-allowed ${directAction ? "bg-danger-solid hover:bg-danger-solid-hover" : "bg-warning-solid hover:bg-warning-solid-hover"}`}
            >
              {submitting ? (directAction ? "Deleting..." : "Sending...") : (directAction ? `${action}` : "Send Request")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
