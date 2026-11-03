"use client";

import { useState } from "react";
import { RiCheckboxCircleLine as CheckCircle2, RiFlagLine as Flag, RiArrowGoBackLine as RotateCcw } from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { useAuth } from "@/context/AuthContext";
import { tripsApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";
import { confirmAction, showError, showSuccess } from "@/lib/feedback";
import type { Trip } from "@/types/trip";

/**
 * The Auditor's decision buttons for one trip — "Flag For Rechecking" (with
 * its reason pop-up) and "Mark as Verified" — shared by Auditor Pages →
 * Driver Record and Vehicle Record, so a trip behaves the same from either.
 *
 *  - Under review (flagged, not yet returned): both are blocked until someone
 *    corrects the data and clicks Return for Review on Flagged Trips.
 *  - Verified: a closed state — both stay disabled. The Auditor can take it
 *    back with Undo Verification, or a user can send it back from Audit
 *    Verified Trips (Flag for Re-Verification); either unlocks both.
 *
 * `onUpdated` gets the trip back from the server so the page can patch its
 * list instantly (its live refresh will also pick it up).
 */
export function TripAuditActions({ trip, onUpdated }: { trip: Trip; onUpdated: (t: Trip) => void }) {
  const [flagOpen, setFlagOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const { user } = useAuth();
  const canUndo = user?.softwareDesignation === "Auditor" || user?.softwareDesignation === "Admin";
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoReason, setUndoReason] = useState("");
  const [undoing, setUndoing] = useState(false);

  const blocked = trip.flaggedForRecheck && !trip.recheckReturned;
  const closed = trip.auditVerified;

  async function submitFlag(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      const updated = await tripsApi.flagForRecheck(trip.id, reason.trim());
      onUpdated(updated);
      showSuccess(`${trip.tripId} moved to Audit Flagged Trips.`, "Flagged for rechecking");
      setFlagOpen(false);
      setReason("");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to flag this trip.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verify() {
    const result = await confirmAction(
      `Mark ${trip.tripId} as verified?`,
      trip.flaggedForRecheck ? "This closes out its recheck — it will come off Audit Flagged Trips." : undefined,
      "Yes, verify",
    );
    if (!result.isConfirmed) return;
    setVerifying(true);
    try {
      const updated = await tripsApi.verifyRecheck(trip.id);
      onUpdated(updated);
      showSuccess(`${trip.tripId} marked as verified.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to verify this trip.");
    } finally {
      setVerifying(false);
    }
  }

  async function submitUndo(e: React.FormEvent) {
    e.preventDefault();
    if (!undoReason.trim()) return;
    setUndoing(true);
    try {
      const updated = await tripsApi.undoVerification(trip.id, undoReason.trim());
      onUpdated(updated);
      showSuccess(`${trip.tripId} is back in Pending Audit.`, "Verification undone");
      setUndoOpen(false);
      setUndoReason("");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to undo this verification.");
    } finally {
      setUndoing(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-l border-separator-border pl-3">
        <button
          type="button"
          onClick={() => { setFlagOpen(true); setReason(""); }}
          disabled={blocked || closed}
          title={blocked ? "Under review — return for review before re-flagging" : closed ? "Already verified by Audit" : undefined}
          className="flex items-center gap-1.5 rounded-lg border border-danger-border-strong bg-danger-surface px-2.5 py-1.5 text-caption-2-semibold text-danger-text hover:bg-danger-surface-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Flag className="h-3.5 w-3.5" />
          {blocked ? "Flagged" : "Flag For Rechecking"}
        </button>
        <button
          type="button"
          onClick={verify}
          disabled={blocked || closed || verifying}
          title={blocked ? "Under review — return for review before verifying" : closed ? "Already verified by Audit" : undefined}
          className="flex items-center gap-1.5 rounded-lg border border-success-border-strong bg-success-surface px-2.5 py-1.5 text-caption-2-semibold text-success-text hover:bg-success-surface-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {closed ? "Verified" : verifying ? "Verifying..." : "Mark as Verified"}
        </button>
        {closed && canUndo && (
          <button
            type="button"
            onClick={() => { setUndoOpen(true); setUndoReason(""); }}
            className="flex items-center gap-1.5 rounded-lg border border-border-button-default bg-background-primary-default px-2.5 py-1.5 text-caption-2-semibold text-text-primary transition-colors hover:bg-fill-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Undo Verification
          </button>
        )}
        {trip.reverificationRemark && (
          <p className="basis-full whitespace-normal text-[11px] text-purple-text">
            <span className="font-semibold">Came for Re-Verification:</span> {trip.reverificationRemark}
            <span className="text-purple-text"> — {trip.reverificationBy}, {formatDateTime(trip.reverificationAt)}</span>
          </p>
        )}
      </div>

      {/* Flag For Rechecking — reason is required; submitting moves the trip
          onto the Flagged Trips page (filtered by flaggedForRecheck there). */}
      <Dialog
        open={flagOpen}
        onClose={() => { if (!submitting) { setFlagOpen(false); setReason(""); } }}
        title={`Flag ${trip.tripId} For Rechecking`}
        className="sm:max-w-md"
      >
        <form onSubmit={submitFlag} className="flex flex-col gap-4">
          <div className="rounded-xl border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-text-strong">
            This trip will be moved to <span className="font-semibold">Audit Flagged Trips</span> for review.
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-body-2-medium text-text-primary">
              Reason <span className="text-danger-text">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe what needs to be rechecked on this trip..."
              rows={4}
              required
              autoFocus
              className="w-full resize-none rounded-lg border border-separator-border bg-background-primary-default px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-placeholder focus:border-danger-border-strong focus:bg-background-primary-default focus:ring-4 focus:ring-danger-solid/10"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setFlagOpen(false); setReason(""); }}
              disabled={submitting}
              className="rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-secondary hover:bg-fill-2 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className="flex items-center gap-2 rounded-lg bg-danger-solid px-4 py-2 text-body-medium text-on-solid hover:bg-danger-solid-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Flagging..." : "Flag Trip"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Undo Verification — takes back a Verify made by mistake; reason required. */}
      <Dialog
        open={undoOpen}
        onClose={() => { if (!undoing) { setUndoOpen(false); setUndoReason(""); } }}
        title={`Undo Verification of ${trip.tripId}`}
        className="sm:max-w-md"
      >
        <form onSubmit={submitUndo} className="flex flex-col gap-4">
          <div className="rounded-xl border border-warning-border bg-warning-surface px-4 py-3 text-sm text-warning-text-strong">
            This trip will leave <span className="font-semibold">Audit Verified Trips</span> and go back to Pending Audit for a fresh decision.
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-body-2-medium text-text-primary">
              Reason <span className="text-danger-text">*</span>
            </label>
            <textarea
              value={undoReason}
              onChange={(e) => setUndoReason(e.target.value)}
              placeholder="Why is this verification being undone?"
              rows={4}
              required
              autoFocus
              className="w-full resize-none rounded-lg border border-separator-border bg-background-primary-default px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-placeholder focus:border-warning-border-strong focus:bg-background-primary-default focus:ring-4 focus:ring-warning-solid/10"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setUndoOpen(false); setUndoReason(""); }}
              disabled={undoing}
              className="rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-secondary hover:bg-fill-2 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={undoing || !undoReason.trim()}
              className="rounded-lg bg-accent-solid px-4 py-2 text-body-medium text-on-solid hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {undoing ? "Undoing..." : "Undo Verification"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/**
 * The trip's audit status next to its Trip ID, so it's obvious why the
 * buttons are locked: "Under Review" (flagged, waiting for the data to be
 * corrected and returned), "Returned" (back with the Auditor to decide), or
 * "Verified" (closed).
 */
export function TripAuditBadge({ trip }: { trip: Trip }) {
  const base = "ml-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold align-middle";
  if (trip.reverificationRemark) {
    return (
      <span
        className={`${base} cursor-help bg-purple-surface-strong text-purple-text`}
        title={`Came for Re-Verification: ${trip.reverificationRemark} — ${trip.reverificationBy}, ${formatDateTime(trip.reverificationAt)}`}
      >
        <RotateCcw className="h-2.5 w-2.5" /> Re-Verification
      </span>
    );
  }
  if (trip.auditVerified) {
    return (
      <span className={`${base} bg-success-surface-strong text-success-text`} title="Verified by Audit — flag it again only if something new comes up">
        <CheckCircle2 className="h-2.5 w-2.5" /> Verified
      </span>
    );
  }
  if (trip.flaggedForRecheck && !trip.recheckReturned) {
    return (
      <span
        className={`${base} cursor-help bg-warning-surface-strong text-warning-text`}
        title={`Under review${trip.flaggedRemark ? `: ${trip.flaggedRemark}` : ""} — Flag / Verify unlock once the data is corrected and "Return for Review" is clicked on Audit Flagged Trips.`}
      >
        <Flag className="h-2.5 w-2.5" /> Under Review
      </span>
    );
  }
  if (trip.flaggedForRecheck && trip.recheckReturned) {
    return (
      <span className={`${base} bg-accent-surface-strong text-accent-text`} title="Corrected and returned — ready for the Auditor to Verify or Flag again">
        <Flag className="h-2.5 w-2.5" /> Returned
      </span>
    );
  }
  return null;
}
