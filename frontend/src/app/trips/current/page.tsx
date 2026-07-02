"use client";

import { useEffect, useState } from "react";
import { TripTable } from "@/components/trips/TripTable";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Search } from "lucide-react";

const CURRENT_STATUSES: Trip["status"][] = ["Started", "Loaded", "On-Transit", "Reached", "Unloaded"];

export default function CurrentTripsPage() {
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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
      useAutoRefresh(() => {
    Promise.all([tripsApi.list(), driversApi.list(), trucksApi.list(), customersApi.list()])
    .then(([t, d, tr, c]) => {
    setAllTrips(t);
    setDrivers(d);
    setTrucks(tr);
    setCustomers(c);
    })
    .finally(() => setLoading(false));
      }, 5000);


  const trips = allTrips.filter((trip) => CURRENT_STATUSES.includes(trip.status));
  const filteredTrips = trips.filter((t) => !searchQuery || t.tripId?.toLowerCase().includes(searchQuery.toLowerCase()) || t.bookingReferenceNo?.toLowerCase().includes(searchQuery.toLowerCase()) || t.origin?.toLowerCase().includes(searchQuery.toLowerCase()) || t.destination?.toLowerCase().includes(searchQuery.toLowerCase()));

  async function handleMarkCompleted(id: string) {
    const updated = await tripsApi.updateStatus(id, "Completed");
    setAllTrips((prev) => prev.map((trip) => (trip.id === id ? updated : trip)));
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Current Trips</h1>
          <p className="mt-1 text-sm text-gray-500">
            Active and upcoming trips being handled by drivers
          </p>
        </div>
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
      </div>

      <TripTable
        trips={filteredTrips}
        drivers={drivers}
        trucks={trucks}
        customers={customers}
        onMarkCompleted={handleMarkCompleted}
        emptyStateMessage='No trips assigned yet. Go to Assign Trips to create one.'
      />
    </div>
  );
}
