"use client";

import { useState, type FormEvent } from "react";
import { X, GitBranch } from "lucide-react";

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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/60 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
              <GitBranch className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900">Change Branch</h2>
              <p className="text-[11px] text-gray-500">{truckLabel}</p>
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
            <span className="font-semibold text-gray-500">{fromBranch || "Unassigned"}</span>
            <span className="text-gray-300">→</span>
            <span className="font-semibold text-blue-700">{toBranch}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-gray-700">
              Note for this change <span className="text-red-500">*</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why is this truck moving branches?"
              rows={4}
              required
              autoFocus
              className="w-full resize-none rounded-lg border border-gray-200 bg-white/50 px-3 py-2.5 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
            <span className="text-xs text-gray-400">
              This is just a record of the change — no approval is needed.
            </span>
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
              disabled={submitting || !note.trim()}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Confirm Change"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
