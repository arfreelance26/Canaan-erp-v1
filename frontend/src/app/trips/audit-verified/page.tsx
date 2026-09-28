"use client";

import { Fragment, useEffect, useState } from "react";
import { BadgeCheck, ChevronDown, ShieldAlert, Flag, Undo2, CheckCircle2 } from "lucide-react";
import { tripsApi, type AuditVerifiedTrip, type TripRecheckEvent } from "@/lib/api";
import { PillSearch } from "@/components/ui/PillSearch";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";

const EVENT_ICON: Record<TripRecheckEvent["event"], typeof Flag> = {
  Flagged: Flag,
  "Returned for Review": Undo2,
  Verified: CheckCircle2,
};

const EVENT_COLOR: Record<TripRecheckEvent["event"], string> = {
  Flagged: "bg-red-100 text-red-700",
  "Returned for Review": "bg-blue-100 text-blue-700",
  Verified: "bg-emerald-100 text-emerald-700",
};

export default function AuditVerifiedTripsPage() {
  const [trips, setTrips] = useState<AuditVerifiedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
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

  const filtered = trips.filter((t) =>
    !searchQuery ||
    t.tripId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.driverName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.verifiedBy.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

      <PillSearch placeholder="Search by trip ID, driver, or verifier…" value={searchQuery} onChange={setSearchQuery} />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          {trips.length === 0 ? "No trips have been verified yet." : "No verified trips match this search."}
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
                        <ChevronDown className={cn("ml-auto h-4 w-4 text-gray-400 transition-transform", isExpanded && "rotate-180")} />
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
    </div>
  );
}
