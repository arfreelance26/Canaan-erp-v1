"use client";

import { useEffect, useState } from "react";
import { TripTable } from "@/components/trips/TripTable";
import { CloseTripDialog } from "@/components/trips/CloseTripDialog";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import { tripMatchesSearch, useGlobalSearchQuery } from "@/lib/trip-search";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripClosureData } from "@/types/trip-closure";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Search } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

export default function CompletedTripsPage() {
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

  useEffect(() => {
        Promise.all([
          tripsApi.list("Completed"),
          driversApi.list(),
          trucksApi.list(),
          customersApi.list(),
        ])
          .then(([t, d, tr, c]) => {
            setTrips(t);
            setDrivers(d);
            setTrucks(tr);
            setCustomers(c);
            // Pre-populate closed IDs from trips that already have a closure
            const closed = new Set<string>(
              t.filter((trip) => (trip as any).hasClosure === true).map((trip) => trip.id)
            );
            setClosedTripIds(closed);
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

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  const filteredTrips = trips.filter((t) => tripMatchesSearch(t, searchQuery, trucks, drivers));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Completed Trips</h1>
          <p className="mt-1 text-sm text-gray-500">
            All trips that have been successfully completed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by truck no., driver, trip ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/trips" filename="trips.xlsx" />
        </div>
      </div>

      <TripTable
        trips={filteredTrips.filter((trip) => !(trip as any).hasClosure && !closedTripIds.has(trip.id))}
        drivers={drivers}
        trucks={trucks}
        customers={customers}
        onCloseTrip={(trip) => setSelectedTrip(trip)}
        closedTripIds={closedTripIds}
        emptyStateMessage="No completed trips found."
      />

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
