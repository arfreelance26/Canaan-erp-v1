"use client";

import { Edit2, Trash2 } from "lucide-react";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";

type TripTableProps = {
  trips: Trip[];
  drivers: Driver[];
  trucks: Truck[];
  customers: Customer[];
  onEdit?: (trip: Trip) => void;
  onMarkStarted?: (id: string) => void;
  onMarkCompleted?: (id: string) => void;
  onCancel?: (id: string) => void;
  onCloseTrip?: (trip: Trip) => void;
  closedTripIds?: Set<string>;
  emptyStateMessage?: string;
};

export function TripTable({ trips, drivers, trucks, customers, onEdit, onMarkStarted, onMarkCompleted, onCancel, onCloseTrip, closedTripIds, emptyStateMessage }: TripTableProps) {
  if (trips.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        {emptyStateMessage || "No trips found."}
      </div>
    );
  }

  const driverById = new Map(drivers.map((driver) => [driver.driverId, driver]));
  const truckById = new Map(trucks.map((truck) => [truck.truckId, truck]));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[1200px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {[
              "Trip ID",
              "Booking Ref",
              "Customer",
              "Route",
              "Cargo / Container Ref",
              "Scheduled Date",
              "Assigned Date",
              "Driver",
              "Vehicle",
              ...(onEdit || onMarkStarted || onMarkCompleted || onCancel || onCloseTrip ? ["Actions"] : []),
            ].map(
              (column) => (
                <th key={column} className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                  {column}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {trips.map((trip) => {
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
                <td className="px-4 py-3 text-gray-600">
                  {trip.containerSpecification === "2 X 20 FEET CONTAINERS"
                    ? `${trip.containerNumber1} / ${trip.containerNumber2}`
                    : trip.containerSpecification === "20 FT CONTAINER" || trip.containerSpecification === "40 FT CONTAINER"
                    ? trip.containerNumber
                    : trip.containerSpecification === "OPEN LOAD CARGO"
                    ? trip.cargoReference
                    : "—"}
                </td>
                <td className="px-4 py-3 text-gray-600">{trip.scheduledDate}</td>
                <td className="px-4 py-3 text-gray-600">{trip.assignedDate}</td>
                <td className="px-4 py-3 text-gray-600">{driver?.name ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600">{truck?.registrationNumber ?? "—"}</td>
                {(onEdit || onMarkStarted || onMarkCompleted || onCancel || onCloseTrip) && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {onEdit && trip.status !== "Cancelled" && trip.status !== "Completed" && (
                        <button
                          type="button"
                          onClick={() => onEdit(trip)}
                          aria-label={`Edit ${trip.tripId}`}
                          className="transition-all duration-300 rounded-md p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}
                      {onMarkStarted && trip.status === "Assigned" && (
                        <button
                          type="button"
                          onClick={() => onMarkStarted(trip.id)}
                          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                          Mark as Started
                        </button>
                      )}
                      {onMarkCompleted && trip.status === "Started" && (
                        <button
                          type="button"
                          onClick={() => onMarkCompleted(trip.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Mark as Completed
                        </button>
                      )}
                      {onCancel && trip.status !== "Cancelled" && trip.status !== "Completed" && (
                        <button
                          type="button"
                          onClick={() => onCancel(trip.id)}
                          aria-label={`Cancel ${trip.tripId}`}
                          className="transition-all duration-300 rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      {onCloseTrip && trip.status === "Completed" && (
                        closedTripIds?.has(trip.id) ? (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                            Closed
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onCloseTrip(trip)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            CLOSE TRIP
                          </button>
                        )
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
