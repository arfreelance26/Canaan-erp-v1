"use client";

import { useEffect, useState } from "react";
import { TripTable } from "@/components/trips/TripTable";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";

const CURRENT_STATUSES: Trip["status"][] = ["Started", "Loaded", "On-Transit", "Reached", "Unloaded"];

export default function CurrentTripsPage() {
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list()])
      .then(([t, d, tr, c]) => {
        setAllTrips(t);
        setDrivers(d);
        setTrucks(tr);
        setCustomers(c);
      })
      .finally(() => setLoading(false));
  }, []);

  const trips = allTrips.filter((trip) => CURRENT_STATUSES.includes(trip.status));

  async function handleMarkCompleted(id: string) {
    const updated = await tripsApi.updateStatus(id, "Completed");
    setAllTrips((prev) => prev.map((trip) => (trip.id === id ? updated : trip)));
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Current Trips</h1>
        <p className="mt-1 text-sm text-gray-500">
          Active and upcoming trips being handled by drivers
        </p>
      </div>

      <TripTable
        trips={trips}
        drivers={drivers}
        trucks={trucks}
        customers={customers}
        onMarkCompleted={handleMarkCompleted}
        emptyStateMessage='No trips assigned yet. Go to Assign Trips to create one.'
      />
    </div>
  );
}
