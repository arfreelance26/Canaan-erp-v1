"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { RiVerifiedBadgeLine as BadgeCheck, RiArrowDownSLine as ChevronDown, RiShieldFlashLine as ShieldAlert, RiFlagLine as Flag, RiArrowGoBackLine as Undo2, RiCheckboxCircleLine as CheckCircle2, RiArrowGoBackLine as RotateCcw } from "@remixicon/react";
import { tripsApi, type AuditVerifiedTrip, type TripRecheckEvent } from "@/lib/api";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { formatDate, formatDateTime, inDateRange } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAuth } from "@/context/AuthContext";
import { Dialog } from "@/components/ui/Dialog";
import { showError, showSuccess } from "@/lib/feedback";

import { EmptyState } from "@/components/ui/EmptyState";
const EVENT_ICON: Record<TripRecheckEvent["event"], typeof Flag> = {
  Flagged: Flag,
  "Returned for Review": Undo2,
  Verified: CheckCircle2,
  "Verification Undone": RotateCcw,
  "Flagged for Re-Verification": RotateCcw,
};

const EVENT_COLOR: Record<TripRecheckEvent["event"], string> = {
  Flagged: "bg-danger-surface-strong text-danger-text",
  "Returned for Review": "bg-accent-surface-strong text-accent-text",
  Verified: "bg-success-surface-strong text-success-text",
  "Verification Undone": "bg-fill-3 text-text-primary",
  "Flagged for Re-Verification": "bg-purple-surface-strong text-purple-text",
};

/** Who can send a verified trip back to the Auditor (backend: request_reverification). */
const REVERIFICATION_ROLES = ["Admin", "Accounts", "Trip Sheet Register"];

export default function AuditVerifiedTripsPage() {
  const { user } = useAuth();
  const canRequest = REVERIFICATION_ROLES.includes(user?.softwareDesignation ?? "");
  const [reverifyTrip, setReverifyTrip] = useState<AuditVerifiedTrip | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [trips, setTrips] = useState<AuditVerifiedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<Map<string, TripRecheckEvent[]>>(new Map());
  const [historyLoading, setHistoryLoading] = useState<string | null>(null);

  useEffect(() => {
    tripsApi.listAuditVerified().then(setTrips).catch(() => {}).finally(() => setLoading(false));
  }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey((k) => k + 1), 10000);
  useWebSocketEvent("trip_updated", () => setRefreshKey((k) => k + 1));

  function toggleExpanded(trip: AuditVerifiedTrip) {
    const isOpen = expandedId === trip.tripDbId;
    setExpandedId(isOpen ? null : trip.tripDbId);
    if (!isOpen && !history.has(trip.tripDbId)) {
      setHistoryLoading(trip.tripDbId);
      tripsApi.getRecheckHistory(trip.tripDbId)
        .then((events) => setHistory((prev) => new Map(prev).set(trip.tripDbId, events)))
        .catch(() => {})
        .finally(() => setHistoryLoading(null));
    }
  }

  function closeReverify() {
    if (submitting) return;
    setReverifyTrip(null);
    setReason("");
  }

  async function submitReverify(e: React.FormEvent) {
    e.preventDefault();
    if (!reverifyTrip || !reason.trim()) return;
    setSubmitting(true);
    try {
      await tripsApi.requestReverification(reverifyTrip.tripDbId, reason.trim());
      setTrips((prev) => prev.filter((t) => t.tripDbId !== reverifyTrip.tripDbId));
      showSuccess(`${reverifyTrip.tripId} sent back to the Auditor.`, "Flagged for Re-Verification");
      setReverifyTrip(null);
      setReason("");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to flag this trip.");
    } finally {
      setSubmitting(false);
    }
  }

  const search = searchQuery.trim();
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return trips.filter((t) =>
      inDateRange(t.verifiedAt, dateFrom, dateTo) &&
      (!q || [t.tripId, t.driverName, t.verifiedBy].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [trips, search, dateFrom, dateTo]);

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-success-border bg-success-surface text-success-text shadow-sm">
          <BadgeCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">Audit Verified Trips</h1>
          <p className="mt-0.5 text-sm text-text-secondary">Trips Audit has reviewed and signed off on</p>
        </div>
      </div>

      {/* Toolbar: search on the left, Verified On range (filters the list and the View export) + View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by trip ID, driver, or verifier…" value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          <DownloadExcelButton
            path="/exports/audit-verified"
            filename="audit_verified_trips.xlsx"
            params={{
              ...(dateFrom ? { from_date: dateFrom } : {}),
              ...(dateTo ? { to_date: dateTo } : {}),
              ...(search ? { search } : {}),
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm text-text-secondary">
        <span>Showing {filtered.length} of {trips.length} trip{trips.length !== 1 ? "s" : ""}</span>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="font-medium text-accent-text hover:text-accent-text"
          >
            Clear dates
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState size="compact" illustration={trips.length === 0 ? "logistics" : "not-found"} title={trips.length === 0 ? "No trips have been verified yet" : "No verified trips match these filters"} />
      ) : (
        <div className="overflow-auto rounded-xl border border-separator-border bg-background-primary-default">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-separator-border bg-fill-1">
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Trip ID</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Driver</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Route</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Date</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Verified By</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Verified On</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary" />
              </tr>
            </thead>
            <tbody className="divide-y divide-separator-border">
              {filtered.map((trip) => {
                const isExpanded = expandedId === trip.tripDbId;
                const events = history.get(trip.tripDbId) ?? [];
                return (
                  <Fragment key={trip.tripDbId}>
                    <tr
                      className="cursor-pointer hover:bg-fill-2"
                      onClick={() => toggleExpanded(trip)}
                    >
                      <td className="px-4 py-2.5 font-semibold text-text-primary">
                        {trip.tripId}
                        {trip.wasDisputed && (
                          <span
                            title="This trip was flagged and disputed before being verified"
                            className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-warning-surface-strong px-1.5 py-0.5 text-[9px] font-semibold text-warning-text"
                          >
                            <ShieldAlert className="h-2.5 w-2.5" /> Was Disputed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{trip.driverName ?? "—"}</td>
                      <td className="px-4 py-2.5 text-text-secondary">
                        {trip.origin || "—"} <span className="text-text-tertiary">→</span> {trip.destination || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{formatDate(trip.scheduledDate)}</td>
                      <td className="px-4 py-2.5 text-text-primary">
                        {trip.verifiedBy}
                        {trip.verifiedRole && <span className="ml-1 text-[11px] text-text-tertiary">({trip.verifiedRole})</span>}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{formatDateTime(trip.verifiedAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {canRequest && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setReverifyTrip(trip); setReason(""); }}
                              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-purple-border-strong bg-purple-surface px-2.5 py-1.5 text-caption-2-semibold text-purple-text transition-colors hover:bg-purple-surface-strong"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Flag for Re-Verification
                            </button>
                          )}
                          <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-tertiary transition-transform", isExpanded && "rotate-180")} />
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="border-t border-separator-border bg-fill-1 px-4 py-3">
                          {trip.verifiedRemark && (
                            <p className="mb-3 text-xs text-text-secondary">
                              <span className="font-semibold text-text-primary">Verification note:</span> {trip.verifiedRemark}
                            </p>
                          )}
                          <p className="mb-2 text-caption-2-semibold text-text-tertiary">Full Review History</p>
                          {historyLoading === trip.tripDbId ? (
                            <p className="text-xs text-text-tertiary">Loading history…</p>
                          ) : events.length === 0 ? (
                            <p className="text-xs text-text-tertiary">No history found.</p>
                          ) : (
                            <ol className="flex flex-col gap-2">
                              {events.map((ev) => {
                                const Icon = EVENT_ICON[ev.event];
                                return (
                                  <li key={ev.id} className="flex items-start gap-2.5">
                                    <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", EVENT_COLOR[ev.event])}>
                                      <Icon className="h-3.5 w-3.5" />
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-caption-1-semibold text-text-primary">
                                        {ev.event} <span className="font-normal text-text-tertiary">by {ev.actorName}{ev.actorRole ? ` (${ev.actorRole})` : ""} · {formatDateTime(ev.createdAt)}</span>
                                      </p>
                                      {ev.remark && <p className="mt-0.5 text-xs text-text-secondary">{ev.remark}</p>}
                                    </div>
                                  </li>
                                );
                              })}
                            </ol>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={reverifyTrip !== null}
        onClose={closeReverify}
        title={`Flag ${reverifyTrip?.tripId ?? ""} for Re-Verification`}
        className="sm:max-w-md"
      >
        <form onSubmit={submitReverify} className="flex flex-col gap-4">
          <div className="rounded-xl border border-purple-border bg-purple-surface px-4 py-3 text-sm text-purple-text-strong">
            This trip will lose its verification and go back to the <span className="font-semibold">Auditor</span> to be checked again.
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-body-2-medium text-text-primary">
              Reason <span className="text-danger-text">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe what the Auditor should check again..."
              rows={4}
              required
              autoFocus
              className="w-full resize-none rounded-lg border border-separator-border bg-background-primary-default px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-placeholder focus:border-purple-border-strong focus:bg-background-primary-default focus:ring-4 focus:ring-purple-solid/10"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={closeReverify}
              disabled={submitting}
              className="rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-secondary hover:bg-fill-2 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className="rounded-lg bg-purple-solid px-4 py-2 text-body-medium text-on-solid hover:bg-purple-solid-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send to Auditor"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
