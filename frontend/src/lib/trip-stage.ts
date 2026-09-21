import type { Trip } from "@/types/trip";

/** Trips physically on the move (or assigned and about to be). */
export const ACTIVE_TRIP_STATUSES = new Set(["Assigned", "Started", "Loaded", "On-Transit", "Reached", "Unloaded"]);

// Once a trip physically finishes ("Completed"), it still has a whole paper
// trail to clear before it's actually done — booking sheet closed, trip sheet
// delivered, received, entered, then verified — before it's invoiced or
// waived. The dashboard tracks it through every one of those stages and only
// drops it once invoiced/waived.
//
// hasClosure is checked BEFORE hasSheet/tripSheetReceived: a trip with no
// booking-sheet closure at all was previously falling straight into "Pending
// Sheet Delivery" alongside trips that DO have a closure and are genuinely
// just waiting on the trip sheet — inflating that bucket by exactly the
// count of closure-less trips. Those two are different stages.
//
// hasSheet is then checked ahead of the collected/received checkboxes: a
// trip sheet entered directly (e.g. by Admin/Accounts, bypassing the Yard
// Supervisor "collected" -> Trip Sheet Register "received" workflow) can
// have real sheet data with tripSheetReceived still false.
export function getStageLabel(trip: Trip): string {
  if (trip.status === "Assigned") return "Assigned";
  if (trip.status === "Completed") {
    if (!trip.hasClosure) return "Completed"; // physically done, booking sheet not closed yet
    if (trip.hasSheet) {
      return trip.verificationStatus !== "verified" ? "Pending Verification" : "Ready to Invoice";
    }
    return trip.tripSheetReceived ? "Pending Sheet Entry" : "Pending Sheet Delivery";
  }
  // Started / Loaded / On-Transit / Reached / Unloaded — in-transit movement.
  return trip.status ?? "—";
}
