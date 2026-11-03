"use client";

import { useState } from "react";
import { RiPencilLine as Edit2, RiDeleteBinLine as Trash2, RiForbidLine as Ban, RiFileTextLine as FileText } from "@remixicon/react";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import { formatDate } from "@/lib/format-date";
import { generateLR } from "@/lib/generate-lr";
import { stageRowClass, stageBadgeClass, type StageColor } from "@/lib/stage-colors";

import { EmptyState } from "@/components/ui/EmptyState";
import { RouteLine } from "@/components/trips/RouteLine";
import { getRouteStep } from "@/lib/trip-stage";
const PAGE_SIZE = 10;

// Trip lifecycle status → color/label, reused for the row tint + status badge.
function tripStage(status: string): { color: StageColor; label: string } {
  switch (status) {
    case "Assigned":  return { color: "blue", label: "Assigned" };
    case "Started":   return { color: "amber", label: "In Transit" };
    case "Completed": return { color: "emerald", label: "Completed" };
    case "Cancelled": return { color: "rose", label: "Cancelled" };
    default:          return { color: "gray", label: status || "—" };
  }
}

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
  // Non-admin path: sends a deletion request to the Admin instead of deleting
  // directly. A page should pass at most one of onDelete / onDeleteRequest,
  // based on the current user's role (mirrors Trip History's pattern).
  onDeleteRequest?: (trip: Trip) => void;
  onCloseTrip?: (trip: Trip) => void;
  closedTripIds?: Set<string>;
  emptyStateMessage?: string;
};

export function TripTable({ trips, drivers, trucks, customers, onEdit, onMarkStarted, onMarkCompleted, onCancel, onDelete, onDeleteRequest, onCloseTrip, closedTripIds, emptyStateMessage }: TripTableProps) {
  const [page, setPage] = useState(1);

  if (trips.length === 0) {
    return (
      <EmptyState size="compact" illustration="logistics" title={emptyStateMessage || "No trips found"} />
    );
  }

  const driverById = new Map(drivers.map((driver) => [driver.driverId, driver]));
  const truckById = new Map(trucks.map((truck) => [truck.truckId, truck]));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  const totalPages = Math.max(1, Math.ceil(trips.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedTrips = trips.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasActions = !!(onEdit || onMarkStarted || onMarkCompleted || onCancel || onDelete || onDeleteRequest || onCloseTrip);

  return (
    <>
      <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <table className="w-full min-w-[1200px] text-left text-sm whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-separator-border bg-fill-1">
              {[
                "Status",
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
                <th key={column} className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-separator-border">
            {paginatedTrips.map((trip) => {
              const driver = driverById.get(trip.driverId);
              const truck = truckById.get(trip.vehicleId);
              const customer = customerById.get(trip.customerId);

              const stage = tripStage(trip.status);
              const routeStep = getRouteStep(trip);
              return (
                <tr key={trip.id} className={stageRowClass(stage.color)}>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <span className={stageBadgeClass(stage.color)}>{stage.label}</span>
                      {routeStep !== null && <RouteLine step={routeStep} />}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-text-primary">{trip.truckRegistration ?? truck?.registrationNumber ?? "—"}</td>
                  <td className="px-4 py-3 text-text-primary">{trip.driverName ?? driver?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-text-primary">{trip.tripId}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{trip.bookingReferenceNo}</td>
                  <td className="px-4 py-3 text-text-secondary">{(customer?.name ?? trip.shipperConsignee) || "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {trip.origin} <span className="text-text-tertiary">→</span> {trip.destination}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {trip.containerSpecification === "2 X 20 FEET CONTAINERS"
                      ? `${trip.containerNumber1} / ${trip.containerNumber2}`
                      : trip.containerSpecification === "20 FT CONTAINER" || trip.containerSpecification === "40 FT CONTAINER"
                      ? trip.containerNumber
                      : trip.containerSpecification === "OPEN LOAD CARGO"
                      ? trip.cargoReference
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(trip.scheduledDate)}</td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(trip.assignedDate)}</td>
                  {hasActions && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {onEdit && trip.status !== "Cancelled" && trip.status !== "Completed" && (
                          <button
                            type="button"
                            onClick={() => onEdit(trip)}
                            aria-label={`Edit ${trip.tripId}`}
                            className="transition duration-300 rounded-md p-1.5 text-text-secondary hover:bg-accent-surface-strong hover:text-accent-text"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                        {onMarkStarted && trip.status === "Assigned" && (
                          <button
                            type="button"
                            onClick={() => onMarkStarted(trip.id)}
                            className="rounded-lg bg-warning-solid px-3 py-1.5 text-caption-1-semibold text-on-solid hover:bg-warning-solid-hover"
                          >
                            Mark as Started
                          </button>
                        )}
                        {onMarkCompleted && trip.status === "Started" && (
                          <button
                            type="button"
                            onClick={() => onMarkCompleted(trip.id)}
                            className="rounded-lg bg-success-solid px-3 py-1.5 text-caption-1-semibold text-on-solid hover:bg-success-solid-hover"
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
                            className="transition duration-300 rounded-md p-1.5 text-text-secondary hover:bg-warning-surface-strong hover:text-warning-text"
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
                            className="transition duration-300 rounded-md p-1.5 text-text-secondary hover:bg-danger-surface-strong hover:text-danger-text"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {onDeleteRequest && (
                          <button
                            type="button"
                            onClick={() => onDeleteRequest(trip)}
                            aria-label={`Request delete ${trip.tripId}`}
                            title="Request Admin to delete this trip"
                            className="transition duration-300 rounded-md p-1.5 text-text-secondary hover:bg-warning-surface-strong hover:text-warning-text"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {/* LR / Consignment Note — hidden pending client clarification */}
                        {/* <button
                          type="button"
                          title="Download Lorry Receipt (LR)"
                          onClick={() => generateLR(trip, driver, truck, customer)}
                          className="transition duration-300 rounded-md p-1.5 text-text-secondary hover:bg-success-surface-strong hover:text-success-text"
                        >
                          <FileText className="h-4 w-4" />
                        </button> */}
                        {onCloseTrip && trip.status === "Completed" && (
                          closedTripIds?.has(trip.id) ? (
                            <span className="inline-flex items-center rounded-full bg-fill-2 px-2.5 py-1 text-caption-1-medium text-text-secondary">
                              Closed
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onCloseTrip(trip)}
                              className="rounded-lg bg-success-solid px-3 py-1.5 text-caption-1-semibold text-on-solid hover:bg-success-solid-hover"
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
        <div className="flex items-center justify-between rounded-xl border border-separator-border bg-background-primary-default px-4 py-3">
          <p className="text-sm text-text-secondary">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, trips.length)} of {trips.length} trips
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="rounded-lg border border-separator-border px-3 py-1.5 text-caption-1-medium text-text-secondary hover:bg-fill-2 disabled:opacity-40 disabled:cursor-not-allowed"
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
                  <span key={`ellipsis-${i}`} className="px-2 text-xs text-text-tertiary">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item as number)}
                    className={`rounded-lg px-3 py-1.5 text-caption-1-medium transition-colors ${
                      safePage === item
                        ? "bg-accent-solid text-on-solid"
                        : "border border-separator-border text-text-secondary hover:bg-fill-2"
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
              className="rounded-lg border border-separator-border px-3 py-1.5 text-caption-1-medium text-text-secondary hover:bg-fill-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
