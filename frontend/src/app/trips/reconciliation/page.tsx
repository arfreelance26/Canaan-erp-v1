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
            // Only trips that have a closure
            const closedTrips = t.filter((trip) => (trip as any).hasClosure === true);
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
              if (result) sheetMap.set(result.tripId, result.sheet);
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
        // Only trips that have a closure
        const closedTrips = t.filter((trip) => (trip as any).hasClosure === true);
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
          if (result) sheetMap.set(result.tripId, result.sheet);
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
    const saved = await tripsApi.upsertSheet(selectedTrip.id, data);
    setSheets((prev) => new Map([...prev, [selectedTrip.id, saved]]));
    setSelectedTrip(null);
  }

  async function handleBookingSheetSubmit(data: TripClosureData) {
    if (!bookingSheetTrip) return;
    const updated = await tripsApi.close(bookingSheetTrip.id, data);
    setClosures((prev) => new Map([...prev, [bookingSheetTrip.id, updated]]));
    setBookingSheetTrip(null);
  }

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Trip Reconciliation</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage booking sheets and trip sheets for closed trips
        </p>
      </div>

      {trips.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No closed trips yet. Close a completed trip first from the{" "}
          <a href="/trips/completed" className="text-blue-600 underline">Completed Trips</a> page.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1200px] text-left text-sm">
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
              {trips.map((trip) => {
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
