import { useEffect } from "react";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";

/**
 * Shared trip search predicate used by every trip listing page.
 * Matches trip ID, booking reference, origin/destination, truck ID and
 * truck registration number (so searching a truck number filters its trips).
 */
export function tripMatchesSearch(trip: Trip, query: string, trucks?: Truck[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const truck = trucks?.find((t) => t.truckId === trip.vehicleId);
  return (
    (trip.tripId ?? "").toLowerCase().includes(q) ||
    (trip.bookingReferenceNo ?? "").toLowerCase().includes(q) ||
    (trip.origin ?? "").toLowerCase().includes(q) ||
    (trip.destination ?? "").toLowerCase().includes(q) ||
    (trip.vehicleId ?? "").toLowerCase().includes(q) ||
    (truck?.registrationNumber ?? "").toLowerCase().includes(q)
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
