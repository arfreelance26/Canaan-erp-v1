"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Hourglass } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { tripsApi, type PendingAuditTrip } from "@/lib/api";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { formatDate } from "@/lib/format-date";
import { showError } from "@/lib/swal";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";

const COLUMNS = ["Trip ID", "Driver", "Truck", "Route", "Date"];
const ALLOWED_ROLES = ["Admin", "Accounts", "Yard Supervisor", "Trip Sheet Register"];

/** View only: shows these roles which verified trips are still waiting on the Auditor. */
export default function PendingAuditPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = !user || ALLOWED_ROLES.includes(user.softwareDesignation);
  const [trips, setTrips] = useState<PendingAuditTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isAllowed) router.replace("/");
  }, [isAllowed, router]);

  useEffect(() => {
    if (!isAllowed) return;
    tripsApi.listPendingAudit()
      .then(setTrips)
      .catch(() => { if (refreshKey === 0) showError("Could not load the pending trips."); })
      .finally(() => setLoading(false));
  }, [refreshKey, isAllowed]);
  useAutoRefresh(() => setRefreshKey((k) => k + 1), 10000);
  useWebSocketEvent("trip_updated", () => setRefreshKey((k) => k + 1));

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return trips.filter((t) => {
      const d = t.scheduledDate?.slice(0, 10);
      if ((dateFrom || dateTo) && !d) return false;
      if (d && ((dateFrom && d < dateFrom) || (dateTo && d > dateTo))) return false;
      return !q || [t.tripId, t.driverName, t.vehicleId, t.truckRegistration]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [trips, searchQuery, dateFrom, dateTo]);

  if (!isAllowed) return null;
  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white text-amber-600 shadow-sm">
          <Hourglass className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Pending Audit</h1>
          <p className="mt-0.5 text-sm text-gray-500">Verified trips still waiting for the Auditor to verify or flag</p>
        </div>
      </div>

      {/* Toolbar: search on the left, date range (filters the list and the View export) + View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by trip ID, driver, or truck…" value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          <DownloadExcelButton
            path="/exports/pending-audit"
            filename="pending_audit_trips.xlsx"
            params={{
              ...(dateFrom ? { from_date: dateFrom } : {}),
              ...(dateTo ? { to_date: dateTo } : {}),
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
          {trips.length === 0 ? "No trips are waiting for the Auditor." : "No pending trips match these filters."}
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {COLUMNS.map((c) => (
                  <th key={c} className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((trip) => (
                <tr key={trip.tripDbId} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-semibold text-gray-900">{trip.tripId}</td>
                  <td className="px-4 py-2.5 text-gray-600">{trip.driverName ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{trip.truckRegistration ?? trip.vehicleId ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {trip.origin || "—"} <span className="text-gray-300">→</span> {trip.destination || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{formatDate(trip.scheduledDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
