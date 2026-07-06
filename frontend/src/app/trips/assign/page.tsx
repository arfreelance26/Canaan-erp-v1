"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { TripTable } from "@/components/trips/TripTable";
import { TripFormDialog } from "@/components/trips/TripFormDialog";
import { tripsApi, driversApi, trucksApi, customersApi, assignmentsApi } from "@/lib/api";
import { tripMatchesSearch, useGlobalSearchQuery } from "@/lib/trip-search";
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

export default function AssignTripsPage() {
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

  useEffect(() => {
        Promise.all([
          tripsApi.list(),
          driversApi.list(),
          trucksApi.list(),
          customersApi.list(),
          assignmentsApi.list(),
        ])
          .then(([t, d, tr, c, a]) => {
            setTrips(t);
            setDrivers(d);
            setTrucks(tr);
            setCustomers(c);
            setAssignments(a);
          })
          .finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => {
    Promise.all([
      tripsApi.list(),
      driversApi.list(),
      trucksApi.list(),
      customersApi.list(),
      assignmentsApi.list(),
    ])
      .then(([t, d, tr, c, a]) => {
        setTrips(t);
        setDrivers(d);
        setTrucks(tr);
        setCustomers(c);
        setAssignments(a);
      })
      .finally(() => setLoading(false));
      }, 5000);

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

  async function handleSave(trip: Trip) {
    try {
      if (editingTrip) {
        const updated = await tripsApi.update(editingTrip.id, trip);
        setTrips((prev) => prev.map((t) => (t.id === editingTrip.id ? updated : t)));
        showSuccess("Trip updated successfully.");
      } else {
        const created = await tripsApi.create(trip);
        setTrips((prev) => [...prev, created]);
        showSuccess("Trip assigned successfully.");
      }
      setDialogOpen(false);
      setEditingTrip(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save trip. Please try again.";
      await showError(msg, "Cannot Assign Trip");
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

  // Show only Assigned trips in Assign Trips page
  const assignedTrips = trips
    .filter((trip) => trip.status === "Assigned")
    .filter((t) => tripMatchesSearch(t, searchQuery, trucks));

  if (loading) return <PageSkeleton hasButton hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assign Trips</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and assign trips to drivers who have a vehicle assigned
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search trips..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/trips" filename="trips.xlsx" />
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Assign Trip
          </button>
        </div>
      </div>

      <TripTable
        trips={assignedTrips}
        drivers={drivers}
        trucks={trucks}
        customers={customers}
        onEdit={handleEdit}
        onMarkStarted={handleMarkStarted}
        onCancel={handleCancel}
      />

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
      />
    </div>
  );
}
