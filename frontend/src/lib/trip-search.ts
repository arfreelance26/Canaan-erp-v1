import { useEffect } from "react";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import type { Driver } from "@/types/driver";
import type { Customer } from "@/types/customer";

/** Returns a display string for a trip's container / cargo reference. */
export function containerRef(trip: Trip): string {
  if (trip.containerSpecification === "2 X 20 FEET CONTAINERS") {
    const both = [trip.containerNumber1, trip.containerNumber2].filter(Boolean).join(" / ");
    return both || "—";
  }
  if (trip.containerSpecification === "20 FT CONTAINER" || trip.containerSpecification === "40 FT CONTAINER") {
    return trip.containerNumber || "—";
  }
  if (trip.containerSpecification === "OPEN LOAD CARGO") {
    return trip.cargoReference || "—";
  }
  return "—";
}

/**
 * Shared trip search predicate used by every trip listing page.
 * Matches trip ID, booking reference, origin/destination, truck registration
 * number, truck internal ID, driver name, container/cargo reference, and customer name.
 */
export function tripMatchesSearch(trip: Trip, query: string, trucks?: Truck[], drivers?: Driver[], customers?: Customer[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const truck = trucks?.find((t) => t.truckId === trip.vehicleId);
  const driver = drivers?.find((d) => d.driverId === trip.driverId);
  const customer = customers?.find((c) => c.id === trip.customerId);
  return (
    (trip.tripId ?? "").toLowerCase().includes(q) ||
    (trip.bookingReferenceNo ?? "").toLowerCase().includes(q) ||
    (trip.origin ?? "").toLowerCase().includes(q) ||
    (trip.destination ?? "").toLowerCase().includes(q) ||
    (trip.vehicleId ?? "").toLowerCase().includes(q) ||
    (truck?.registrationNumber ?? "").toLowerCase().includes(q) ||
    (driver?.name ?? "").toLowerCase().includes(q) ||
    (trip.containerNumber ?? "").toLowerCase().includes(q) ||
    (trip.containerNumber1 ?? "").toLowerCase().includes(q) ||
    (trip.containerNumber2 ?? "").toLowerCase().includes(q) ||
    (trip.cargoReference ?? "").toLowerCase().includes(q) ||
    (customer?.name ?? "").toLowerCase().includes(q)
  );
}

/**
 * Syncs a page's local search state with the global Topbar search:
 * reads ?q= from the URL on mount and listens for live "erp:global-search"
 * events dispatched by the Topbar while the page is already open.
 */
export function useGlobalSearchQuery(setQuery: (q: string) => void) {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
    const handler = (e: Event) => setQuery((e as CustomEvent<string>).detail ?? "");
    window.addEventListener("erp:global-search", handler);
    return () => window.removeEventListener("erp:global-search", handler);
  }, [setQuery]);
}
