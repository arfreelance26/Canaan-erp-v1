"use client";

import { useState } from "react";
import { Edit2, Trash2, Ban, FileText } from "lucide-react";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import { formatDate } from "@/lib/format-date";
import { generateLR } from "@/lib/generate-lr";

const PAGE_SIZE = 10;

type TripTableProps = {
  trips: Trip[];
  drivers: Driver[];
  trucks: Truck[];
  customers: Customer[];
  onEdit?: (trip: Trip) => void;
  onMarkStarted?: (id: string) => void;
  onMarkCompleted?: (id: string) => void;
  onCancel?: (id: string) => void;
  onDelete?: (trip: Trip) => void;
  onCloseTrip?: (trip: Trip) => void;
  closedTripIds?: Set<string>;
  emptyStateMessage?: string;
};

export function TripTable({ trips, drivers, trucks, customers, onEdit, onMarkStarted, onMarkCompleted, onCancel, onDelete, onCloseTrip, closedTripIds, emptyStateMessage }: TripTableProps) {
  const [page, setPage] = useState(1);

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

  const totalPages = Math.max(1, Math.ceil(trips.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedTrips = trips.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasActions = !!(onEdit || onMarkStarted || onMarkCompleted || onCancel || onDelete || onCloseTrip);

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
        <table className="w-full min-w-[1200px] text-left text-sm whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-200 bg-gray-50">
              {[
                "Vehicle",
                "Driver",
                "Trip ID",
                "Booking Ref",
                "Customer",
                "From → To",
                "Cargo / Container Ref",
                "Scheduled Date",
                "Assigned Date",
                ...(hasActions ? ["Actions"] : []),
              ].map((column) => (
                <th key={column} className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedTrips.map((trip) => {
              const driver = driverById.get(trip.driverId);
              const truck = truckById.get(trip.vehicleId);
              const customer = customerById.get(trip.customerId);

              return (
                <tr key={trip.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{trip.truckRegistration ?? truck?.registrationNumber ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{trip.driverName ?? driver?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{trip.tripId}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{trip.bookingReferenceNo}</td>
                  <td className="px-4 py-3 text-gray-600">{(customer?.name ?? trip.shipperConsignee) || "—"}</td>
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
                  <td className="px-4 py-3 text-gray-600">{formatDate(trip.scheduledDate)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(trip.assignedDate)}</td>
                  {hasActions && (
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
                            title="Cancel trip"
                            className="transition-all duration-300 rounded-md p-1.5 text-gray-500 hover:bg-amber-50 hover:text-amber-600"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(trip)}
                            aria-label={`Delete ${trip.tripId}`}
                            title="Delete trip"
                            className="transition-all duration-300 rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {/* LR / Consignment Note — hidden pending client clarification */}
                        {/* <button
                          type="button"
                          title="Download Lorry Receipt (LR)"
                          onClick={() => generateLR(trip, driver, truck, customer)}
                          className="transition-all duration-300 rounded-md p-1.5 text-gray-500 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <FileText className="h-4 w-4" />
                        </button> */}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-sm text-gray-500">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, trips.length)} of {trips.length} trips
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
              .reduce<(number | "...")[]>((acc, n, i, arr) => {
                if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("...");
                acc.push(n);
                return acc;
              }, [])
              .map((item, i) =>
                item === "..." ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-xs text-gray-400">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item as number)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      safePage === item
                        ? "bg-blue-600 text-white"
                        : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
