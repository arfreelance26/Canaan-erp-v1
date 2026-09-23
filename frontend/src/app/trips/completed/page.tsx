"use client";

import { useEffect, useState } from "react";
import { TripTable } from "@/components/trips/TripTable";
import { CloseTripDialog } from "@/components/trips/CloseTripDialog";
import { EditRequestDialog } from "@/components/attendance/EditRequestDialog";
import { CheckCircle2 } from "lucide-react";
import { tripsApi, driversApi, trucksApi, customersApi, deletionApprovalsApi } from "@/lib/api";
import { tripMatchesSearch, useGlobalSearchQuery } from "@/lib/trip-search";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripClosureData } from "@/types/trip-closure";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { useAuth } from "@/context/AuthContext";

import { PillSearch } from "@/components/ui/PillSearch";
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
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white text-emerald-600 shadow-sm">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Completed Trips</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            All trips that have been successfully completed
          </p>
        </div>
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
    </div>
  );
}
