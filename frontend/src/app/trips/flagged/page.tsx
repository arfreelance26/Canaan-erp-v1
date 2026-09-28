"use client";

import { useEffect, useState } from "react";
import { Flag, Undo2, FileText, ClipboardList, Pencil } from "lucide-react";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import { mapLimit } from "@/lib/async-pool";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";
import { BookingSheetDialog } from "@/components/trips/BookingSheetDialog";
import { TripSheetDialog } from "@/components/trips/TripSheetDialog";
import { PillSearch } from "@/components/ui/PillSearch";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { formatDate } from "@/lib/format-date";
import { useAuth } from "@/context/AuthContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { confirmAction, showSuccess, showError } from "@/lib/swal";

type BookingDialogState = { trip: Trip; readOnly: boolean };
type SheetDialogState = { trip: Trip; readOnly: boolean };

export default function FlaggedTripsPage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";

  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [bookingDialog, setBookingDialog] = useState<BookingDialogState | null>(null);
  const [sheetDialog, setSheetDialog] = useState<SheetDialogState | null>(null);

  // allSettled — a source failing (e.g. Trucks/Customers, if ever role-gated
  // for a role this page gets opened up to) must not blank the whole page.
  useEffect(() => {
    Promise.allSettled([tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list()])
      .then(([t, d, tr, c]) => {
        if (t.status === "fulfilled") setTrips(t.value);
        if (d.status === "fulfilled") setDrivers(d.value);
        if (tr.status === "fulfilled") setTrucks(tr.value);
        if (c.status === "fulfilled") setCustomers(c.value);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey((k) => k + 1), 10000);
  useWebSocketEvent("trip_updated", () => setRefreshKey((k) => k + 1));

  const driverById = new Map(drivers.map((d) => [d.driverId, d]));
  const truckById = new Map(trucks.map((t) => [t.truckId, t]));

  const flaggedTrips = trips
    .filter((t) => t.flaggedForRecheck)
    .filter((t) =>
      !searchQuery ||
      t.tripId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.driverName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.flaggedRemark?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  // Closures/sheets for every flagged trip, in one small batch — this list is
  // never large enough (a handful of disputed trips at a time) to need the
  // lazy, ref-guarded fetching Driver Record uses for its full trip history.
  useEffect(() => {
    const toFetchClosures = flaggedTrips.filter((t) => t.hasClosure && !closures.has(t.id));
    const toFetchSheets = flaggedTrips.filter((t) => t.hasSheet && !sheets.has(t.id));
    if (toFetchClosures.length > 0) {
      mapLimit(toFetchClosures, 8, (t) => tripsApi.getClosure(t.id).then((cl) => ({ id: t.id, cl })).catch(() => null))
        .then((results) => {
          setClosures((prev) => {
            const next = new Map(prev);
            for (const r of results) if (r) next.set(r.id, r.cl);
            return next;
          });
        });
    }
    if (toFetchSheets.length > 0) {
      mapLimit(toFetchSheets, 8, (t) => tripsApi.getSheet(t.id).then((sh) => ({ id: t.id, sh })).catch(() => null))
        .then((results) => {
          setSheets((prev) => {
            const next = new Map(prev);
            for (const r of results) if (r?.sh) next.set(r.id, r.sh);
            return next;
          });
        });
    }
  }, [flaggedTrips.map((t) => t.id).join(",")]);

  // Send a corrected trip back to the Auditor for a fresh Verify/Flag
  // decision. The trip stays on this page (still flaggedForRecheck) until
  // the Auditor actually closes it out with Mark as Verified on Driver
  // Record — this button doesn't clear the flag, just its "blocked" state.
  async function handleReturn(trip: Trip) {
    const result = await confirmAction(
      `Return ${trip.tripId} for review?`,
      "The Auditor will be able to verify or re-flag it.",
      "Yes, return"
    );
    if (!result.isConfirmed) return;
    setReturningId(trip.id);
    try {
      const updated = await tripsApi.returnForReview(trip.id);
      setTrips((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      showSuccess(`${trip.tripId} returned for review.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to return this trip for review.");
    } finally {
      setReturningId(null);
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-white text-red-600 shadow-sm">
          <Flag className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Audit Flagged Trips</h1>
          <p className="mt-0.5 text-sm text-gray-500">Trips flagged for review</p>
        </div>
      </div>

      <PillSearch placeholder="Search by trip ID, driver, or reason…" value={searchQuery} onChange={setSearchQuery} />

      {flaggedTrips.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          {trips.some((t) => t.flaggedForRecheck) ? "No flagged trips match this search." : "No flagged trips yet."}
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Trip ID</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Driver</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Route</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Scheduled Date</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Reason</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Status</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Documents</th>
                <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {flaggedTrips.map((trip) => (
                <tr key={trip.id}>
                  <td className="px-4 py-2.5 font-semibold text-gray-900">{trip.tripId}</td>
                  <td className="px-4 py-2.5 text-gray-600">{trip.driverName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {trip.origin || "—"} <span className="text-gray-300">→</span> {trip.destination || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{formatDate(trip.scheduledDate)}</td>
                  <td className="px-4 py-2.5 max-w-[280px] whitespace-normal text-gray-700">{trip.flaggedRemark || "—"}</td>
                  <td className="px-4 py-2.5">
                    {trip.recheckReturned ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">
                        Returned — awaiting Auditor
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                        Under Review
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBookingDialog({ trip, readOnly: true })}
                        disabled={!trip.hasClosure}
                        title={trip.hasClosure ? undefined : "No booking sheet recorded for this trip"}
                        className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View Booking Sheet
                      </button>
                      <button
                        type="button"
                        onClick={() => setBookingDialog({ trip, readOnly: !isAdmin })}
                        disabled={!trip.hasClosure || !isAdmin}
                        title={!trip.hasClosure ? "No booking sheet recorded for this trip" : !isAdmin ? "Only Admin can edit" : undefined}
                        className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit Booking Sheet
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetDialog({ trip, readOnly: true })}
                        disabled={!trip.hasSheet}
                        title={trip.hasSheet ? undefined : "No trip sheet recorded for this trip"}
                        className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                        View Trip Sheet
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetDialog({ trip, readOnly: !isAdmin })}
                        disabled={!trip.hasSheet || !isAdmin}
                        title={!trip.hasSheet ? "No trip sheet recorded for this trip" : !isAdmin ? "Only Admin can edit" : undefined}
                        className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit Trip Sheet
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {trip.recheckReturned ? (
                      <span className="text-[11px] text-gray-400">Waiting on Auditor</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReturn(trip)}
                        disabled={returningId === trip.id}
                        className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        {returningId === trip.id ? "Returning..." : "Return for Review"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Booking Sheet — readOnly is decided per-open by which button was
          clicked: View always opens read-only; Edit opens editable only for
          Admin (same permission rule as Trip History — non-Admin has no path
          to edit these today, so Edit just falls back to read-only for them). */}
      <BookingSheetDialog
        open={bookingDialog !== null}
        trip={bookingDialog?.trip ?? null}
        closure={bookingDialog ? closures.get(bookingDialog.trip.id) : undefined}
        driver={bookingDialog ? driverById.get(bookingDialog.trip.driverId) : undefined}
        truck={bookingDialog ? truckById.get(bookingDialog.trip.vehicleId) : undefined}
        customers={customers}
        readOnly={bookingDialog?.readOnly ?? true}
        onClose={() => setBookingDialog(null)}
        onSubmit={async (data) => {
          if (!bookingDialog) return;
          try {
            const updated = await tripsApi.close(bookingDialog.trip.id, data);
            setClosures((prev) => new Map(prev).set(bookingDialog.trip.id, updated));
            setBookingDialog(null);
            showSuccess("Booking sheet updated.");
          } catch (err: unknown) {
            showError(err instanceof Error ? err.message : "Failed to update booking sheet.");
          }
        }}
      />

      {/* Trip Sheet — same View/Edit permission rule as Booking Sheet above. */}
      <TripSheetDialog
        open={sheetDialog !== null}
        trip={sheetDialog?.trip ?? null}
        closure={sheetDialog ? closures.get(sheetDialog.trip.id) : undefined}
        existingSheet={sheetDialog ? sheets.get(sheetDialog.trip.id) : undefined}
        readOnly={sheetDialog?.readOnly ?? true}
        drivers={drivers}
        trucks={trucks}
        onClose={() => setSheetDialog(null)}
        onSubmit={async (data) => {
          if (!sheetDialog) return;
          try {
            const updated = await tripsApi.upsertSheet(sheetDialog.trip.id, data);
            setSheets((prev) => new Map(prev).set(sheetDialog.trip.id, updated));
            setSheetDialog(null);
            showSuccess("Trip sheet updated.");
          } catch (err: unknown) {
            showError(err instanceof Error ? err.message : "Failed to update trip sheet.");
          }
        }}
      />
    </div>
  );
}
