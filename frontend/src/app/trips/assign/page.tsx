"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Send } from "lucide-react";
import { TripTable } from "@/components/trips/TripTable";
import { TripFormDialog, clearTripDraft } from "@/components/trips/TripFormDialog";
import { EditRequestDialog } from "@/components/attendance/EditRequestDialog";
import { tripsApi, driversApi, trucksApi, customersApi, assignmentsApi, deletionApprovalsApi } from "@/lib/api";
import { tripMatchesSearch, useGlobalSearchQuery } from "@/lib/trip-search";
import { useAuth } from "@/context/AuthContext";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import { confirmAction, showError, showSuccess } from "@/lib/swal";
import type { Customer } from "@/types/customer";
import type { DriverAssignment } from "@/types/driver-assignment";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

import { PillSearch } from "@/components/ui/PillSearch";
export default function AssignTripsPage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assignments, setAssignments] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteRequestTrip, setDeleteRequestTrip] = useState<Trip | null>(null);

  useEffect(() => {
        // allSettled, not all — a single failed source (e.g. right after relogin)
        // must not blank the whole table; each keeps its last-known-good state
        // and a toast names what didn't refresh.
        Promise.allSettled([
          tripsApi.list(),
          driversApi.list(),
          trucksApi.list(),
          customersApi.list(),
          assignmentsApi.list(),
        ])
          .then(([t, d, tr, c, a]) => {
            const failed: string[] = [];
            if (t.status === "fulfilled") setTrips(t.value); else failed.push("Trips");
            if (d.status === "fulfilled") setDrivers(d.value); else failed.push("Drivers");
            if (tr.status === "fulfilled") setTrucks(tr.value); else failed.push("Trucks");
            if (c.status === "fulfilled") setCustomers(c.value); else failed.push("Customers");
            if (a.status === "fulfilled") setAssignments(a.value); else failed.push("Assignments");
            if (failed.length > 0) {
              showError(`Couldn't refresh ${failed.join(", ")} — showing last known data.`);
            }
          })
          .finally(() => setLoading(false));
      }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("trip_created", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("driver_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));

  const truckById = useMemo(() => new Map(trucks.map((truck) => [truck.truckId, truck])), [trucks]);

  const ACTIVE_STATUSES = new Set(["Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"]);

  const activeDriverIds = useMemo(
    () => new Set(trips.filter((t) => ACTIVE_STATUSES.has(t.status) && t.id !== editingTrip?.id).map((t) => t.driverId).filter(Boolean)),
    [trips, editingTrip]
  );

  const activeVehicleIds = useMemo(
    () => new Set(trips.filter((t) => ACTIVE_STATUSES.has(t.status) && t.id !== editingTrip?.id).map((t) => t.vehicleId).filter(Boolean)),
    [trips, editingTrip]
  );

  const assignableDrivers = useMemo(
    () =>
      assignments
        .map((assignment) => {
          const driver = drivers.find((d) => d.driverId === assignment.driverId);
          const truck = truckById.get(assignment.vehicleId);
          if (!driver || !truck) return null;
          const isActive = activeDriverIds.has(driver.driverId) || activeVehicleIds.has(truck.truckId);
          return { driver, truck, isActive };
        })
        .filter((entry): entry is { driver: Driver; truck: Truck; isActive: boolean } => entry !== null),
    [assignments, drivers, truckById, activeDriverIds, activeVehicleIds]
  );

  function handleAdd() {
    setEditingTrip(null);
    setDialogOpen(true);
  }

  function handleEdit(trip: Trip) {
    setEditingTrip(trip);
    setDialogOpen(true);
  }

  async function handleSave(trip: Trip): Promise<boolean> {
    try {
      if (editingTrip) {
        const updated = await tripsApi.update(editingTrip.id, trip);
        setTrips((prev) => prev.map((t) => (t.id === editingTrip.id ? updated : t)));
        showSuccess("Trip updated successfully.");
      } else {
        const created = await tripsApi.create(trip);
        setTrips((prev) => [...prev, created]);
        clearTripDraft();
        showSuccess("Trip assigned successfully.");
      }
      setDialogOpen(false);
      setEditingTrip(null);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save trip. Please try again.";
      await showError(msg, "Cannot Assign Trip");
      return false;
    }
  }

  async function handleMarkStarted(id: string) {
    try {
      const updated = await tripsApi.updateStatus(id, "Started");
      setTrips((prev) => prev.map((trip) => (trip.id === id ? updated : trip)));
      showSuccess("Trip marked as started.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update trip status.");
    }
  }

  async function handleCancel(tripId: string) {
    const result = await confirmAction("Cancel this trip?", "The status will be changed to Cancelled.", "Yes, cancel trip");
    if (!result.isConfirmed) return;
    try {
      const updated = await tripsApi.cancel(tripId);
      setTrips((prev) => prev.map((trip) => (trip.id === tripId ? updated : trip)));
      showSuccess("Trip cancelled successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to cancel trip.");
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

  // Show only Assigned trips in Assign Trips page
  const assignedTrips = trips
    .filter((trip) => trip.status === "Assigned")
    .filter((t) => tripMatchesSearch(t, searchQuery, trucks, drivers));

  if (loading) return <PageSkeleton hasButton hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white text-indigo-600 shadow-sm">
          <Send className="h-5 w-5" />
        </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Assign Trips</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Create and assign trips to drivers who have a vehicle assigned
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
        >
          <Plus className="h-4 w-4" />
          Assign Trip
        </button>
      </div>

      {/* Toolbar: search on the left, View on the right (same place as on the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by truck no., driver, trip ID…" value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* Only the trips this page lists (status Assigned), not every trip in the system */}
          <DownloadExcelButton path="/exports/trips" filename="assigned_trips.xlsx" params={{ status: "Assigned" }} />
        </div>
      </div>

      <TripTable
        trips={assignedTrips}
        drivers={drivers}
        trucks={trucks}
        customers={customers}
        onEdit={handleEdit}
        onMarkStarted={handleMarkStarted}
        onCancel={isAdmin ? handleCancel : undefined}
        onDelete={isAdmin ? (trip) => setDeleteRequestTrip(trip) : undefined}
        onDeleteRequest={!isAdmin ? (trip) => setDeleteRequestTrip(trip) : undefined}
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

      <TripFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingTrip(null);
        }}
        onSave={handleSave}
        initialData={editingTrip}
        existingTrips={trips}
        customers={customers}
        assignableDrivers={assignableDrivers}
        drivers={drivers}
      />
    </div>
  );
}
