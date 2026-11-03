"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RiLockLine as Lock, RiLockUnlockLine as LockOpen, RiLoader4Line as Loader2 } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { staffApi } from "@/lib/api";
import { showError, showSuccess } from "@/lib/feedback";
import type { Staff } from "@/types/staff";

const inputClass =
  "mt-1 block w-full rounded-lg border border-border-button-default bg-background-primary-default px-3 py-2 text-sm text-text-primary placeholder-text-placeholder focus:border-accent-solid focus:outline-none focus:ring-1 focus:ring-accent-solid transition-colors";

/**
 * Freeze / Unfreeze Account (Our Staff). Both need a reason and the owner
 * password — the same one as Canaan Chat's Owner View — so only the owner
 * can do it. Freezing ends every session the staff member has right away.
 */
export function FreezeAccountDialog({
  staff,
  onClose,
  onDone,
}: {
  staff: Staff | null;
  onClose: () => void;
  onDone: (updated: Staff) => void;
}) {
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const freezing = !staff?.frozenAt;

  useEffect(() => {
    setReason("");
    setPassword("");
  }, [staff?.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!staff || !reason.trim() || !password || saving) return;
    setSaving(true);
    try {
      const updated = freezing
        ? await staffApi.freeze(staff.id, reason.trim(), password)
        : await staffApi.unfreeze(staff.id, reason.trim(), password);
      showSuccess(freezing
        ? `${staff.name}'s account is frozen. They've been logged out.`
        : `${staff.name}'s account is unfrozen. They can log in again.`);
      onDone(updated);
    } catch (err: unknown) {
      setPassword("");
      showError(err instanceof Error && err.message ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!staff) return null;
  return (
    <Dialog open={!!staff} onClose={onClose} title={freezing ? "Freeze Account" : "Unfreeze Account"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className={`flex items-start gap-3 rounded-lg border p-3 ${freezing ? "border-danger-border bg-danger-surface" : "border-success-border bg-success-surface"}`}>
          {freezing ? <Lock className="mt-0.5 h-5 w-5 shrink-0 text-danger-text" /> : <LockOpen className="mt-0.5 h-5 w-5 shrink-0 text-success-text" />}
          <p className="text-sm text-text-primary">
            {freezing ? (
              <><b>{staff.name}</b> ({staff.staffId}) will be logged out everywhere right now and won&apos;t be able to log in until the account is unfrozen. Nothing else about the account changes.</>
            ) : (
              <><b>{staff.name}</b> ({staff.staffId}) will be able to log in again with the same password.</>
            )}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-body-medium text-text-primary">
            Reason <span className="text-danger-text">*</span>
          </label>
          <textarea
            required
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
            placeholder={freezing ? "Why is this account being frozen?" : "Why is this account being unfrozen?"}
          />
        </div>

        <div>
          <label className="mb-1 block text-body-medium text-text-primary">
            Owner password <span className="text-danger-text">*</span>
          </label>
          <input
            type="password"
            required
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="The owner password (same as Chat Owner View)"
          />
          <p className="mt-1 text-xs text-text-tertiary">5 wrong tries lock this out for 15 minutes. Every attempt is recorded.</p>
        </div>

        <div className="flex justify-end gap-3 border-t border-separator-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border-button-default bg-background-primary-default px-4 py-2 text-body-medium text-text-primary hover:bg-fill-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!reason.trim() || !password || saving}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-body-medium text-on-solid shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
              freezing ? "bg-danger-solid hover:bg-danger-solid-hover" : "bg-success-solid hover:bg-success-solid-hover"
            }`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : freezing ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            {freezing ? "Freeze Account" : "Unfreeze Account"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
