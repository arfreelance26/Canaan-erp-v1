"use client";

import { useEffect, useState } from "react";
import { TripTable } from "@/components/trips/TripTable";
import { CloseTripDialog } from "@/components/trips/CloseTripDialog";
import { EditRequestDialog } from "@/components/attendance/EditRequestDialog";
import { RiCheckboxCircleLine as CheckCircle2, RiHistoryLine as History, RiAddLine as Plus, RiPencilLine as Pencil, RiFileList3Line as ClipboardList, RiCloseCircleLine as XCircle, RiDeleteBinLine as Trash2, RiArrowGoBackLine as RotateCcw } from "@remixicon/react";
import { tripsApi, driversApi, trucksApi, customersApi, deletionApprovalsApi, type TripEditEventRow } from "@/lib/api";
import { tripMatchesSearch, useGlobalSearchQuery } from "@/lib/trip-search";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripClosureData } from "@/types/trip-closure";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/feedback";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { useAuth } from "@/context/AuthContext";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { PillSearch } from "@/components/ui/PillSearch";

import { EmptyState } from "@/components/ui/EmptyState";
const EDIT_EVENT_ICON: Record<TripEditEventRow["event"], typeof Plus> = {
  "Booking Created": Plus,
  "Booking Edited": Pencil,
  "Trip Sheet Saved": ClipboardList,
  "Trip Updated": Pencil,
  "Trip Closed": CheckCircle2,
  "Verification Confirmed": CheckCircle2,
  "Verification Rejected": XCircle,
  "Trip Deleted": Trash2,
  "Trip Restored": RotateCcw,
};

const EDIT_EVENT_COLOR: Record<TripEditEventRow["event"], string> = {
  "Booking Created": "bg-accent-surface-strong text-accent-text",
  "Booking Edited": "bg-warning-surface-strong text-warning-text",
  "Trip Sheet Saved": "bg-purple-surface-strong text-purple-text",
  "Trip Updated": "bg-warning-surface-strong text-warning-text",
  "Trip Closed": "bg-success-surface-strong text-success-text",
  "Verification Confirmed": "bg-success-surface-strong text-success-text",
  "Verification Rejected": "bg-danger-surface-strong text-danger-text",
  "Trip Deleted": "bg-danger-surface-strong text-danger-text",
  "Trip Restored": "bg-success-surface-strong text-success-text",
};

export default function CompletedTripsPage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [closedTripIds, setClosedTripIds] = useState<Set<string>>(new Set());
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteRequestTrip, setDeleteRequestTrip] = useState<Trip | null>(null);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<TripEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    tripsApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  useEffect(() => {
        // allSettled, not all — a single failed source (e.g. right after relogin)
        // must not blank the whole table; each keeps its last-known-good state
        // and a toast names what didn't refresh.
        Promise.allSettled([
          tripsApi.list("Completed"),
          driversApi.list(),
          trucksApi.list(),
          customersApi.list(),
        ])
          .then(([t, d, tr, c]) => {
            const failed: string[] = [];
            if (t.status === "fulfilled") {
              setTrips(t.value);
              // Pre-populate closed IDs from trips that already have a closure
              const closed = new Set<string>(
                t.value.filter((trip) => (trip as any).hasClosure === true).map((trip) => trip.id)
              );
              setClosedTripIds(closed);
            } else failed.push("Trips");
            if (d.status === "fulfilled") setDrivers(d.value); else failed.push("Drivers");
            if (tr.status === "fulfilled") setTrucks(tr.value); else failed.push("Trucks");
            if (c.status === "fulfilled") setCustomers(c.value); else failed.push("Customers");
            if (failed.length > 0) {
              showError(`Couldn't refresh ${failed.join(", ")} — showing last known data.`);
            }
          })
          .finally(() => setLoading(false));
      }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_closed", () => setRefreshKey(k => k + 1));

  const driverById = new Map(drivers.map((d) => [d.driverId, d]));
  const truckById = new Map(trucks.map((t) => [t.truckId, t]));

  async function handleSubmitClosure(data: TripClosureData) {
    if (!selectedTrip) return;
    try {
      await tripsApi.close(selectedTrip.id, data);
      setClosedTripIds((prev) => new Set([...prev, selectedTrip.id]));
      setSelectedTrip(null);
      showSuccess("Trip closed successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to close trip.");
    }
  }

  async function handleDeleteSubmit(trip: Trip, reason: string) {
    try {
      if (isAdmin) {
        await tripsApi.remove(trip.id, reason);
        setTrips((prev) => prev.filter((t) => t.id !== trip.id));
        showSuccess(`Trip ${trip.tripId} deleted.`);
      } else {
        await deletionApprovalsApi.create({
          resourceType: "Trip",
          resourceId: parseInt(trip.id),
          resourceName: trip.bookingReferenceNo || trip.tripId,
          reason,
        });
        showSuccess("Delete request sent to Admin — you'll see it approved or rejected on the Deletion Approvals page.");
      }
      setDeleteRequestTrip(null);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete trip.");
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  const filteredTrips = trips.filter((t) => tripMatchesSearch(t, searchQuery, trucks, drivers));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-success-border bg-success-surface text-success-text shadow-sm">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Completed Trips</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              All trips that have been successfully completed
            </p>
          </div>
        </div>
        {isAdmin && (
<button
          type="button"
          onClick={openEditHistory}
          className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
        >
          <History className="h-4 w-4" />
          Edit History
        </button>
)}
      </div>

      {/* Toolbar: search on the left, View on the right (same place as on the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by truck no., driver, trip ID…" value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* Only completed trips still waiting to be closed — the same ones the table below lists */}
          <DownloadExcelButton
            path="/exports/trips"
            filename="completed_trips.xlsx"
            params={{ status: "Completed", has_closure: "false" }}
          />
        </div>
      </div>

      <TripTable
        trips={filteredTrips.filter((trip) => !(trip as any).hasClosure && !closedTripIds.has(trip.id))}
        drivers={drivers}
        trucks={trucks}
        customers={customers}
        onCloseTrip={(trip) => setSelectedTrip(trip)}
        closedTripIds={closedTripIds}
        onDelete={isAdmin ? (trip) => setDeleteRequestTrip(trip) : undefined}
        onDeleteRequest={!isAdmin ? (trip) => setDeleteRequestTrip(trip) : undefined}
        emptyStateMessage="No completed trips found."
      />

      {deleteRequestTrip && (
        <EditRequestDialog
          open={deleteRequestTrip !== null}
          resourceType="Trip"
          resourceName={deleteRequestTrip.bookingReferenceNo || deleteRequestTrip.tripId}
          action="Delete"
          directAction={isAdmin}
          onSubmit={(reason) => handleDeleteSubmit(deleteRequestTrip, reason)}
          onClose={() => setDeleteRequestTrip(null)}
        />
      )}

      <CloseTripDialog
        open={selectedTrip !== null}
        trip={selectedTrip}
        driver={selectedTrip ? driverById.get(selectedTrip.driverId) : undefined}
        truck={selectedTrip ? truckById.get(selectedTrip.vehicleId) : undefined}
        onClose={() => setSelectedTrip(null)}
        onSubmit={handleSubmitClosure}
      />

      {/* Edit History — every Create/Edit/Sheet/Close/Verify/Delete/Restore
          ever logged, across every trip, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by trip ID, driver, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q ||
              ev.tripIdStr.toLowerCase().includes(q) ||
              (ev.driverName ?? "").toLowerCase().includes(q) ||
              ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "logistics" : "not-found"} title={editHistoryEvents.length === 0 ? "No trip edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Trip</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-separator-border">
                    {filtered.map((ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-text-primary">
                            {ev.tripIdStr}
                            {ev.driverName && <span className="text-caption-2-regular text-text-tertiary"> ({ev.driverName})</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                          </td>
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
