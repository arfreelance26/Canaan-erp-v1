"use client";

import { useEffect, useState } from "react";
import { RiFlagLine as Flag, RiArrowGoBackLine as Undo2, RiFileTextLine as FileText, RiFileList3Line as ClipboardList, RiPencilLine as Pencil, RiHistoryLine as HistoryIcon, RiCheckboxCircleLine as CheckCircle2, RiArrowGoBackLine as RotateCcw } from "@remixicon/react";
import { tripsApi, driversApi, trucksApi, customersApi, type TripRecheckEventRow } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripClosureData } from "@/types/trip-closure";
import type { TripSheetData } from "@/types/trip-sheet";
import { BookingSheetDialog } from "@/components/trips/BookingSheetDialog";
import { TripSheetDialog } from "@/components/trips/TripSheetDialog";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PillSearch } from "@/components/ui/PillSearch";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Dialog } from "@/components/ui/Dialog";
import { formatDate, formatDateTime, inDateRange } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { confirmAction, showSuccess, showError } from "@/lib/feedback";

import { EmptyState } from "@/components/ui/EmptyState";
type BookingDialogState = { trip: Trip; readOnly: boolean };
type SheetDialogState = { trip: Trip; readOnly: boolean };

const EVENT_ICON: Record<TripRecheckEventRow["event"], typeof Flag> = {
  Flagged: Flag,
  "Returned for Review": Undo2,
  Verified: CheckCircle2,
  "Verification Undone": RotateCcw,
  "Flagged for Re-Verification": RotateCcw,
};

const EVENT_COLOR: Record<TripRecheckEventRow["event"], string> = {
  Flagged: "bg-danger-surface-strong text-danger-text",
  "Returned for Review": "bg-accent-surface-strong text-accent-text",
  Verified: "bg-success-surface-strong text-success-text",
  "Verification Undone": "bg-fill-3 text-text-primary",
  "Flagged for Re-Verification": "bg-purple-surface-strong text-purple-text",
};

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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [bookingDialog, setBookingDialog] = useState<BookingDialogState | null>(null);
  const [sheetDialog, setSheetDialog] = useState<SheetDialogState | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<TripRecheckEventRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

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

  const search = searchQuery.trim();
  const q = search.toLowerCase();
  const allFlagged = trips.filter((t) => t.flaggedForRecheck);
  const flaggedTrips = allFlagged.filter((t) =>
    inDateRange(t.scheduledDate, dateFrom, dateTo) &&
    (!q || [t.tripId, t.driverName, t.flaggedRemark].some((v) => v?.toLowerCase().includes(q)))
  );

  // Closures/sheets for every flagged trip — one bulk request each. This list
  // is small (a handful of disputed trips at a time), so no per-page slicing.
  useEffect(() => {
    const closureIds = flaggedTrips.filter((t) => t.hasClosure && !closures.has(t.id)).map((t) => t.id);
    const sheetIds = flaggedTrips.filter((t) => t.hasSheet && !sheets.has(t.id)).map((t) => t.id);
    if (closureIds.length > 0) {
      tripsApi.getClosuresBulk(closureIds)
        .then((cls) => setClosures((prev) => new Map([...prev, ...cls])))
        .catch(() => {});
    }
    if (sheetIds.length > 0) {
      tripsApi.getSheetsBulk(sheetIds)
        .then((shs) => setSheets((prev) => new Map([...prev, ...shs])))
        .catch(() => {});
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

  // One page-wide log instead of a per-trip button — refetched fresh every
  // time it's opened, covering every trip ever flagged (not just the ones
  // currently open on this page), searchable in one place.
  function openHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    tripsApi.listRecheckEvents()
      .then(setHistoryEvents)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={5} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3.5">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-danger-border bg-danger-surface text-danger-text shadow-sm">
            <Flag className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Audit Flagged Trips</h1>
            <p className="mt-0.5 text-sm text-text-secondary">Trips flagged for review</p>
          </div>
        </div>
        {isAdmin && (
<button
          type="button"
          onClick={openHistory}
          className="flex items-center gap-1.5 rounded-lg border border-border-button-default bg-background-primary-default px-3.5 py-2 text-body-semibold text-text-primary shadow-sm hover:bg-fill-2 transition-colors"
        >
          <HistoryIcon className="h-4 w-4" />
          History
        </button>
)}
      </div>

      {/* Toolbar: search on the left, Scheduled Date range (filters the list and the View export) + View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by trip ID, driver, or reason…" value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          <DownloadExcelButton
            path="/exports/audit-flagged"
            filename="audit_flagged_trips.xlsx"
            params={{
              ...(dateFrom ? { from_date: dateFrom } : {}),
              ...(dateTo ? { to_date: dateTo } : {}),
              ...(search ? { search } : {}),
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm text-text-secondary">
        <span>Showing {flaggedTrips.length} of {allFlagged.length} trip{allFlagged.length !== 1 ? "s" : ""}</span>
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

      {flaggedTrips.length === 0 ? (
        <EmptyState size="compact" illustration={allFlagged.length > 0 ? "not-found" : "all-done"} title={allFlagged.length > 0 ? "No flagged trips match these filters" : "No flagged trips yet"} />
      ) : (
        <div className="overflow-auto rounded-xl border border-separator-border bg-background-primary-default">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-separator-border bg-fill-1">
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Trip ID</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Driver</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Route</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Scheduled Date</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Reason</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Status</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Documents</th>
                <th className="px-4 py-2.5 text-caption-2-semibold text-text-tertiary">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-separator-border">
              {flaggedTrips.map((trip) => (
                <tr key={trip.id}>
                  <td className="px-4 py-2.5 font-semibold text-text-primary">{trip.tripId}</td>
                  <td className="px-4 py-2.5 text-text-secondary">{trip.driverName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-text-secondary">
                    {trip.origin || "—"} <span className="text-text-tertiary">→</span> {trip.destination || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">{formatDate(trip.scheduledDate)}</td>
                  <td className="px-4 py-2.5 max-w-[280px] whitespace-normal text-text-primary">{trip.flaggedRemark || "—"}</td>
                  <td className="px-4 py-2.5">
                    {trip.recheckReturned ? (
                      <span className="inline-flex items-center rounded-full bg-accent-surface-strong px-2.5 py-1 text-caption-2-semibold text-accent-text">
                        Returned — awaiting Auditor
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-warning-surface-strong px-2.5 py-1 text-caption-2-semibold text-warning-text">
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
                        className="flex items-center gap-1.5 rounded-lg border border-accent-border-strong bg-accent-surface px-2.5 py-1.5 text-caption-2-semibold text-accent-text hover:bg-accent-surface-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View Booking Sheet
                      </button>
                      <button
                        type="button"
                        onClick={() => setBookingDialog({ trip, readOnly: !isAdmin })}
                        disabled={!trip.hasClosure || !isAdmin}
                        title={!trip.hasClosure ? "No booking sheet recorded for this trip" : !isAdmin ? "Only Admin can edit" : undefined}
                        className="flex items-center gap-1.5 rounded-lg border border-accent-border-strong bg-accent-surface px-2.5 py-1.5 text-caption-2-semibold text-accent-text hover:bg-accent-surface-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit Booking Sheet
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetDialog({ trip, readOnly: true })}
                        disabled={!trip.hasSheet}
                        title={trip.hasSheet ? undefined : "No trip sheet recorded for this trip"}
                        className="flex items-center gap-1.5 rounded-lg border border-purple-border-strong bg-purple-surface px-2.5 py-1.5 text-caption-2-semibold text-purple-text hover:bg-purple-surface-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ClipboardList className="h-3.5 w-3.5" />
                        View Trip Sheet
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetDialog({ trip, readOnly: !isAdmin })}
                        disabled={!trip.hasSheet || !isAdmin}
                        title={!trip.hasSheet ? "No trip sheet recorded for this trip" : !isAdmin ? "Only Admin can edit" : undefined}
                        className="flex items-center gap-1.5 rounded-lg border border-purple-border-strong bg-purple-surface px-2.5 py-1.5 text-caption-2-semibold text-purple-text hover:bg-purple-surface-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit Trip Sheet
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {trip.recheckReturned ? (
                      <span className="text-[11px] text-text-tertiary">Waiting on Auditor</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleReturn(trip)}
                        disabled={returningId === trip.id}
                        className="flex items-center gap-1.5 rounded-lg border border-accent-border-strong bg-accent-surface px-2.5 py-1.5 text-caption-2-semibold text-accent-text hover:bg-accent-surface-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

      {/* History — every Flag / Return for Review / Verify event ever logged,
          across every trip (not just the ones currently on this page), in
          one searchable log instead of having to open each trip individually. */}
      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Recheck History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by trip ID, driver, actor, or remark…" value={historySearch} onChange={setHistorySearch} />
          {historyLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = historyEvents.filter((ev) =>
              !historySearch ||
              ev.tripIdStr.toLowerCase().includes(historySearch.toLowerCase()) ||
              ev.driverName?.toLowerCase().includes(historySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(historySearch.toLowerCase()) ||
              ev.remark?.toLowerCase().includes(historySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={historyEvents.length === 0 ? "all-done" : "not-found"} title={historyEvents.length === 0 ? "No trips have ever been flagged" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Trip</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Event</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Remark</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-separator-border">
                    {filtered.map((ev) => {
                      const Icon = EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-text-primary">{ev.tripIdStr}</p>
                            {ev.driverName && <p className="text-[11px] text-text-tertiary">{ev.driverName}</p>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                          </td>
                          <td className="px-3 py-2 max-w-[220px] whitespace-normal text-text-secondary">{ev.remark || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
