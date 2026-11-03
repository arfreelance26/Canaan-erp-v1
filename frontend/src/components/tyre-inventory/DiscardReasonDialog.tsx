"use client";

import { useEffect, useState } from "react";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import { Dialog } from "@/components/ui/Dialog";
import { showError } from "@/lib/feedback";

type Props = {
  tyre: TyreInventoryItem | null;
  onClose: () => void;
  // Resolves once the tyre has been discarded; the dialog closes on success.
  onConfirm: (tyre: TyreInventoryItem, reason: string) => Promise<void>;
};

// Asks for the reason a tyre is being written off. The reason is required and
// is kept on the tyre's Discarded Tyres record.
export function DiscardReasonDialog({ tyre, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tyre) setReason("");
  }, [tyre]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tyre) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      showError("Enter a reason for discarding this tyre.");
      return;
    }
    setSaving(true);
    try {
      await onConfirm(tyre, trimmed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={tyre !== null}
      onClose={() => !saving && onClose()}
      title={tyre ? `Flag ${tyre.tyreNumber} as Discarded` : "Flag as Discarded"}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-1">
        <p className="text-sm text-text-secondary">
          The tyre will move to the Discarded Tyres page. You can move it back to Tyre Inventory later.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-text-primary">Reason</span>
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Worn out beyond retreading, sidewall damage"
            className="rounded-lg border border-border-button-default px-3 py-2"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border-button-default px-4 py-2 text-body-medium text-text-primary hover:bg-fill-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-danger-solid px-4 py-2 text-body-medium text-on-solid hover:bg-danger-solid-hover disabled:opacity-50"
          >
            {saving ? "Discarding…" : "Flag as Discarded"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
