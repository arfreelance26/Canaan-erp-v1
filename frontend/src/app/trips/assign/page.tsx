"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { TripTable } from "@/components/trips/TripTable";
import { TripFormDialog } from "@/components/trips/TripFormDialog";
import { tripsApi, driversApi, trucksApi, customersApi, assignmentsApi } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { DriverAssignment } from "@/types/driver-assignment";

export default function AssignTripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assignments, setAssignments] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);

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
  }, []);

  const truckById = useMemo(() => new Map(trucks.map((truck) => [truck.truckId, truck])), [trucks]);

  const assignableDrivers = useMemo(
    () =>
      assignments
        .map((assignment) => {
          const driver = drivers.find((d) => d.driverId === assignment.driverId);
          const truck = truckById.get(assignment.vehicleId);
          return driver && truck ? { driver, truck } : null;
        })
        .filter((entry): entry is { driver: Driver; truck: Truck } => entry !== null),
    [assignments, drivers, truckById]
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
    if (editingTrip) {
      // Update existing trip
      const updated = await tripsApi.update(editingTrip.id, trip);
      setTrips((prev) => prev.map((t) => (t.id === editingTrip.id ? updated : t)));
    } else {
      // Create new trip
      const created = await tripsApi.create(trip);
      setTrips((prev) => [...prev, created]);
    }
    setDialogOpen(false);
    setEditingTrip(null);
  }

  async function handleMarkStarted(id: string) {
    const updated = await tripsApi.updateStatus(id, "Started");
    setTrips((prev) => prev.map((trip) => (trip.id === id ? updated : trip)));
  }

  async function handleCancel(id: string) {
    if (!confirm("Cancel this trip?")) return;
    const updated = await tripsApi.cancel(id);
    setTrips((prev) => prev.map((trip) => (trip.id === id ? updated : trip)));
  }

  // Show only Assigned trips in Assign Trips page
  const assignedTrips = trips.filter((trip) => trip.status === "Assigned");

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assign Trips</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and assign trips to drivers who have a vehicle assigned
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Assign Trip
        </button>
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
