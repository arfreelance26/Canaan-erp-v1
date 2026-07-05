"use client";

import { useEffect, useState } from "react";
import { tripsApi, driversApi, trucksApi, customersApi } from "@/lib/api";
import { TripSheetDialog } from "@/components/trips/TripSheetDialog";
import { BookingSheetDialog } from "@/components/trips/BookingSheetDialog";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import { n } from "@/types/trip-sheet";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Search } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

type DialogMode = "add" | "view" | "edit";

export default function TripReconciliationPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Local cache: tripId -> closure data and sheet data
  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());

  // Trip Sheet dialog
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>("add");

  // Booking Sheet dialog
  const [bookingSheetTrip, setBookingSheetTrip] = useState<Trip | null>(null);
  const [bookingSheetReadOnly, setBookingSheetReadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
        Promise.all([
          tripsApi.list("Completed"),
          driversApi.list(),
          trucksApi.list(),
          customersApi.list(),
        ])
          .then(([t, d, tr, c]) => {
            setDrivers(d);
            setTrucks(tr);
            setCustomers(c);
            // Only trips that have a closure AND have had their sheet collected
            const closedTrips = t.filter((trip) => (trip as any).hasClosure === true && (trip as any).tripSheetCollected === true);
            setTrips(closedTrips);
            // Fetch closures for each closed trip
            return Promise.all(
              closedTrips.map((trip) =>
                tripsApi.getClosure(trip.id).then((closure) => ({ tripId: trip.id, closure })).catch(() => null)
              )
            );
          })
          .then((closureResults) => {
            const closureMap = new Map<string, TripClosureData>();
            for (const result of closureResults) {
              if (result) closureMap.set(result.tripId, result.closure);
            }
            setClosures(closureMap);
            // Fetch sheets for trips that have a sheet
            return Promise.all(
              [...closureMap.keys()].map((tripId) =>
                tripsApi.getSheet(tripId).then((sheet) => ({ tripId, sheet })).catch(() => null)
              )
            );
          })
          .then((sheetResults) => {
            const sheetMap = new Map<string, TripSheetData>();
            for (const result of sheetResults) {
              if (result && result.sheet) sheetMap.set(result.tripId, result.sheet);
            }
            setSheets(sheetMap);
          })
          .finally(() => setLoading(false));
      }, []);
      useAutoRefresh(() => {
    Promise.all([
      tripsApi.list("Completed"),
      driversApi.list(),
      trucksApi.list(),
      customersApi.list(),
    ])
      .then(([t, d, tr, c]) => {
        setDrivers(d);
        setTrucks(tr);
        setCustomers(c);
        // Only trips that have a closure AND have had their sheet collected
        const closedTrips = t.filter((trip) => (trip as any).hasClosure === true && (trip as any).tripSheetCollected === true);
        setTrips(closedTrips);
        // Fetch closures for each closed trip
        return Promise.all(
          closedTrips.map((trip) =>
            tripsApi.getClosure(trip.id).then((closure) => ({ tripId: trip.id, closure })).catch(() => null)
          )
        );
      })
      .then((closureResults) => {
        const closureMap = new Map<string, TripClosureData>();
        for (const result of closureResults) {
          if (result) closureMap.set(result.tripId, result.closure);
        }
        setClosures(closureMap);
        // Fetch sheets for trips that have a sheet
        return Promise.all(
          [...closureMap.keys()].map((tripId) =>
            tripsApi.getSheet(tripId).then((sheet) => ({ tripId, sheet })).catch(() => null)
          )
        );
      })
      .then((sheetResults) => {
        const sheetMap = new Map<string, TripSheetData>();
        for (const result of sheetResults) {
          if (result && result.sheet) sheetMap.set(result.tripId, result.sheet);
        }
        setSheets(sheetMap);
      })
      .finally(() => setLoading(false));
      }, 5000);


  const driverById = new Map(drivers.map((d) => [d.driverId, d]));
  const truckById = new Map(trucks.map((t) => [t.truckId, t]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  function openDialog(trip: Trip, mode: DialogMode) {
    setSelectedTrip(trip);
    setDialogMode(mode);
  }

  function openBookingSheet(trip: Trip, readOnly: boolean) {
    setBookingSheetTrip(trip);
    setBookingSheetReadOnly(readOnly);
  }

  async function handleSubmitSheet(data: TripSheetData) {
    if (!selectedTrip) return;
    try {
      const saved = await tripsApi.upsertSheet(selectedTrip.id, data);
      setSheets((prev) => new Map([...prev, [selectedTrip.id, saved]]));
      setSelectedTrip(null);
      showSuccess("Trip sheet saved successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save trip sheet.");
    }
  }

  async function handleBookingSheetSubmit(data: TripClosureData) {
    if (!bookingSheetTrip) return;
    try {
      const updated = await tripsApi.close(bookingSheetTrip.id, data);
      setClosures((prev) => new Map([...prev, [bookingSheetTrip.id, updated]]));
      setBookingSheetTrip(null);
      showSuccess("Booking sheet saved successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save booking sheet.");
    }
  }

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={10} />;

  const filteredTrips = trips.filter((t) => !searchQuery || t.tripId?.toLowerCase().includes(searchQuery.toLowerCase()) || t.bookingReferenceNo?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Reconciliation</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage booking sheets and trip sheets for closed trips
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
        </div>
      </div>

      {filteredTrips.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No closed trips yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1200px] text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {["Trip ID", "Booking Ref", "Customer", "Route", "Driver", "Vehicle",
                  "Bill To", "Hire Amount", "Total Expense", "Actions"].map((col) => (
                  <th key={col} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTrips.map((trip) => {
                const closure = closures.get(trip.id);
                const sheet = sheets.get(trip.id);
                const driver = driverById.get(trip.driverId);
                const truck = truckById.get(trip.vehicleId);
                const customer = customerById.get(trip.customerId);

                return (
                  <tr key={trip.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{trip.tripId}</td>
                    <td className="px-4 py-3 text-gray-600">{trip.bookingReferenceNo}</td>
                    <td className="px-4 py-3 text-gray-600">{customer?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {trip.origin} <span className="text-gray-400">→</span> {trip.destination}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{driver?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{truck?.registrationNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{closure?.billTo ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-blue-700">
                      {sheet ? fmt(n(sheet.hireAmount)) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-emerald-700">
                      {sheet ? fmt(n(sheet.totalExpense)) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        {/* Booking Sheet */}
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Booking Sheet</p>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => openBookingSheet(trip, true)}
                              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => openBookingSheet(trip, false)}
                              className="rounded-lg border border-purple-300 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                            >
                              Edit
                            </button>
                          </div>
                        </div>

                        {/* Trip Sheet */}
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Trip Sheet</p>
                          {trip.tripSheetCollected && trip.tripSheetCollectedAt && (
                            <p className="text-[10px] text-emerald-600 font-medium mb-0.5">
                              Trip Sheet for this Trip has been handed over on{" "}
                              {new Date(trip.tripSheetCollectedAt).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                          )}
                          {sheet ? (
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => openDialog(trip, "view")}
                                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => openDialog(trip, "edit")}
                                className="rounded-lg border border-blue-300 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                              >
                                Edit
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openDialog(trip, "add")}
                              className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              ADD
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TripSheetDialog
        open={selectedTrip !== null}
        trip={selectedTrip}
        closure={selectedTrip ? closures.get(selectedTrip.id) : undefined}
        existingSheet={selectedTrip ? sheets.get(selectedTrip.id) : undefined}
        readOnly={dialogMode === "view"}
        drivers={drivers}
        trucks={trucks}
        onClose={() => setSelectedTrip(null)}
        onSubmit={handleSubmitSheet}
      />

      <BookingSheetDialog
        open={bookingSheetTrip !== null}
        trip={bookingSheetTrip}
        closure={bookingSheetTrip ? closures.get(bookingSheetTrip.id) : undefined}
        driver={bookingSheetTrip ? driverById.get(bookingSheetTrip.driverId) : undefined}
        truck={bookingSheetTrip ? truckById.get(bookingSheetTrip.vehicleId) : undefined}
        customers={customers}
        readOnly={bookingSheetReadOnly}
        onClose={() => setBookingSheetTrip(null)}
        onSubmit={handleBookingSheetSubmit}
      />
    </div>
  );
}
