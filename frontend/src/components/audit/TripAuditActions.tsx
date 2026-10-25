"use client";

import { useState } from "react";
import { CheckCircle2, Flag } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { tripsApi } from "@/lib/api";
import { confirmAction, showError, showSuccess } from "@/lib/swal";
import type { Trip } from "@/types/trip";

/**
 * The Auditor's decision buttons for one trip — "Flag For Rechecking" (with
 * its reason pop-up) and "Mark as Verified" — shared by Auditor Pages →
 * Driver Record and Vehicle Record, so a trip behaves the same from either.
 *
 *  - Under review (flagged, not yet returned): both are blocked until someone
 *    corrects the data and clicks Return for Review on Flagged Trips.
 *  - Verified: a closed state — both stay disabled until it's flagged again.
 *
 * `onUpdated` gets the trip back from the server so the page can patch its
 * list instantly (its live refresh will also pick it up).
 */
export function TripAuditActions({ trip, onUpdated }: { trip: Trip; onUpdated: (t: Trip) => void }) {
  const [flagOpen, setFlagOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);

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

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-l border-gray-200 pl-3">
        <button
          type="button"
          onClick={() => { setFlagOpen(true); setReason(""); }}
          disabled={blocked || closed}
          title={blocked ? "Under review — return for review before re-flagging" : closed ? "Already verified by Audit" : undefined}
          className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Flag className="h-3.5 w-3.5" />
          {blocked ? "Flagged" : "Flag For Rechecking"}
        </button>
        <button
          type="button"
          onClick={verify}
          disabled={blocked || closed || verifying}
          title={blocked ? "Under review — return for review before verifying" : closed ? "Already verified by Audit" : undefined}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {closed ? "Verified" : verifying ? "Verifying..." : "Mark as Verified"}
        </button>
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
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            This trip will be moved to <span className="font-semibold">Audit Flagged Trips</span> for review.
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-gray-700">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe what needs to be rechecked on this trip..."
              rows={4}
              required
              autoFocus
              className="w-full resize-none rounded-lg border border-gray-200 bg-white/50 px-3 py-2.5 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-500/10"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setFlagOpen(false); setReason(""); }}
              disabled={submitting}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Flagging..." : "Flag Trip"}
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
  const base = "ml-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider align-middle";
  if (trip.auditVerified) {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-700`} title="Verified by Audit — flag it again only if something new comes up">
        <CheckCircle2 className="h-2.5 w-2.5" /> Verified
      </span>
    );
  }
  if (trip.flaggedForRecheck && !trip.recheckReturned) {
    return (
      <span
        className={`${base} cursor-help bg-amber-100 text-amber-700`}
        title={`Under review${trip.flaggedRemark ? `: ${trip.flaggedRemark}` : ""} — Flag / Verify unlock once the data is corrected and "Return for Review" is clicked on Audit Flagged Trips.`}
      >
        <Flag className="h-2.5 w-2.5" /> Under Review
      </span>
    );
  }
  if (trip.flaggedForRecheck && trip.recheckReturned) {
    return (
      <span className={`${base} bg-blue-100 text-blue-700`} title="Corrected and returned — ready for the Auditor to Verify or Flag again">
        <Flag className="h-2.5 w-2.5" /> Returned
      </span>
    );
  }
  return null;
}
