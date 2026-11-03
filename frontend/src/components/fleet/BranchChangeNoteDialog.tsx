"use client";

import { useState, type FormEvent } from "react";
import { RiCloseLine as X, RiGitBranchLine as GitBranch } from "@remixicon/react";

type Props = {
  open: boolean;
  truckLabel: string;
  fromBranch: string;
  toBranch: string;
  onSubmit: (note: string) => Promise<void>;
  onClose: () => void;
};

export function BranchChangeNoteDialog({ open, truckLabel, fromBranch, toBranch, onSubmit, onClose }: Props) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(note.trim());
      setNote("");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    setNote("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-scrim/40" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-separator-border bg-background-primary-default shadow-2xl">
        <div className="flex items-center justify-between border-b border-separator-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-surface-strong">
              <GitBranch className="h-4 w-4 text-accent-text" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">Change Branch</h2>
              <p className="text-[11px] text-text-secondary">{truckLabel}</p>
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <div className="flex items-center justify-center gap-2 rounded-xl border border-separator-border bg-fill-1 px-4 py-3 text-sm">
            <span className="font-semibold text-text-secondary">{fromBranch || "Unassigned"}</span>
            <span className="text-text-tertiary">→</span>
            <span className="font-semibold text-accent-text">{toBranch}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-body-2-medium text-text-primary">
              Note for this change <span className="text-danger-text">*</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why is this truck moving branches?"
              rows={4}
              required
              autoFocus
              className="w-full resize-none rounded-lg border border-separator-border bg-background-primary-default px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-placeholder focus:border-accent-solid focus:bg-background-primary-default focus:ring-4 focus:ring-accent-solid/10"
            />
            <span className="text-xs text-text-tertiary">
              This is just a record of the change — no approval is needed.
            </span>
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
              disabled={submitting || !note.trim()}
              className="flex items-center gap-2 rounded-lg bg-accent-solid px-4 py-2 text-body-medium text-on-solid hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Confirm Change"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
