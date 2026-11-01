"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { BadgeCheck, ChevronDown, ShieldAlert, Flag, Undo2, CheckCircle2, RotateCcw } from "lucide-react";
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
import { showError, showSuccess } from "@/lib/swal";

const EVENT_ICON: Record<TripRecheckEvent["event"], typeof Flag> = {
  Flagged: Flag,
  "Returned for Review": Undo2,
  Verified: CheckCircle2,
  "Verification Undone": RotateCcw,
  "Flagged for Re-Verification": RotateCcw,
};

const EVENT_COLOR: Record<TripRecheckEvent["event"], string> = {
  Flagged: "bg-red-100 text-red-700",
  "Returned for Review": "bg-blue-100 text-blue-700",
  Verified: "bg-emerald-100 text-emerald-700",
  "Verification Undone": "bg-gray-200 text-gray-700",
  "Flagged for Re-Verification": "bg-violet-100 text-violet-700",
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
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white text-emerald-600 shadow-sm">
          <BadgeCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Audit Verified Trips</h1>
          <p className="mt-0.5 text-sm text-gray-500">Trips Audit has reviewed and signed off on</p>
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

      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span>Showing {filtered.length} of {trips.length} trip{trips.length !== 1 ? "s" : ""}</span>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="font-medium text-blue-600 hover:text-blue-700"
          >
            Clear dates
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          {trips.length === 0 ? "No trips have been verified yet." : "No verified trips match these filters."}
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Trip ID</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Driver</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Route</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Date</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Verified By</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Verified On</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((trip) => {
                const isExpanded = expandedId === trip.tripDbId;
                const events = history.get(trip.tripDbId) ?? [];
                return (
                  <Fragment key={trip.tripDbId}>
                    <tr
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleExpanded(trip)}
                    >
                      <td className="px-4 py-2.5 font-semibold text-gray-900">
                        {trip.tripId}
                        {trip.wasDisputed && (
                          <span
                            title="This trip was flagged and disputed before being verified"
                            className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700"
                          >
                            <ShieldAlert className="h-2.5 w-2.5" /> Was Disputed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{trip.driverName ?? "—"}</td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {trip.origin || "—"} <span className="text-gray-300">→</span> {trip.destination || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{formatDate(trip.scheduledDate)}</td>
                      <td className="px-4 py-2.5 text-gray-700">
                        {trip.verifiedBy}
                        {trip.verifiedRole && <span className="ml-1 text-[11px] text-gray-400">({trip.verifiedRole})</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{formatDateTime(trip.verifiedAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {canRequest && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setReverifyTrip(trip); setReason(""); }}
                              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Flag for Re-Verification
                            </button>
                          )}
                          <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", isExpanded && "rotate-180")} />
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
                          {trip.verifiedRemark && (
                            <p className="mb-3 text-xs text-gray-600">
                              <span className="font-semibold text-gray-700">Verification note:</span> {trip.verifiedRemark}
                            </p>
                          )}
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">Full Review History</p>
                          {historyLoading === trip.tripDbId ? (
                            <p className="text-xs text-gray-400">Loading history…</p>
                          ) : events.length === 0 ? (
                            <p className="text-xs text-gray-400">No history found.</p>
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
                                      <p className="text-xs font-semibold text-gray-800">
                                        {ev.event} <span className="font-normal text-gray-400">by {ev.actorName}{ev.actorRole ? ` (${ev.actorRole})` : ""} · {formatDateTime(ev.createdAt)}</span>
                                      </p>
                                      {ev.remark && <p className="mt-0.5 text-xs text-gray-500">{ev.remark}</p>}
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
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
            This trip will lose its verification and go back to the <span className="font-semibold">Auditor</span> to be checked again.
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-gray-700">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe what the Auditor should check again..."
              rows={4}
              required
              autoFocus
              className="w-full resize-none rounded-lg border border-gray-200 bg-white/50 px-3 py-2.5 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-500/10"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={closeReverify}
              disabled={submitting}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send to Auditor"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
