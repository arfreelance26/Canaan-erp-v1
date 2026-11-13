"use client";

import { RiCloseCircleLine as XCircle } from "@remixicon/react";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { TRIP_CATEGORIES } from "@/components/trips/TripCategoryTag";
import type { TripCategory } from "@/types/trip";

/** "" = every category. */
export type TripCategoryChoice = TripCategory | "";

/** Keep a trip when no category is chosen, or when it's in the chosen one. */
export function inTripCategory(trip: { tripCategory?: string | null }, choice: TripCategoryChoice): boolean {
  return !choice || trip.tripCategory === choice;
}

/**
 * The Trip Category pill: "All categories (794)", "Outstation (632)", … with a
 * ✕ to clear it. `trips` is what the counts are taken from — the list the page
 * is showing before the category is applied (its tab, dates and search), so
 * each number is what you'd get by picking it. Trip History and the trip
 * pages (Assign, Available, Current, Completed, Sheet Collection,
 * Reconciliation, Verification & Invoicing) all use this one.
 */
export function TripCategoryFilter({
  trips,
  value,
  onChange,
  tour,
}: {
  trips: { tripCategory?: string | null }[];
  value: TripCategoryChoice;
  onChange: (v: TripCategoryChoice) => void;
  /** Its data-tour tag, for the page's tour: "trip-category-filter" on the trip pages. */
  tour: string;
}) {
  const options = [
    { value: "", label: `All categories (${trips.length})` },
    ...TRIP_CATEGORIES.map((c) => ({ value: c.value, label: `${c.label} (${trips.filter((t) => t.tripCategory === c.value).length})` })),
  ];
  return (
    <div data-tour={tour} className="flex items-center gap-1">
      <GlassSelect
        variant="pill"
        aria-label="Trip Category"
        value={value}
        onChange={(v) => onChange(v as TripCategoryChoice)}
        options={options}
        triggerClassName={value ? "border-accent-border-strong text-accent-text" : undefined}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Show all categories"
          aria-label="Show all categories"
          className="flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-fill-2 hover:text-text-primary"
        >
          <XCircle className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
