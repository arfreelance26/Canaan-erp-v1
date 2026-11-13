import type { TripCategory } from "@/types/trip";

/** The five trip categories, with their labels and tag colours — Trip History's
 *  filter and route tag, and the Trip Category column on Driver / Vehicle Based Record. */
export const TRIP_CATEGORIES: { value: TripCategory; label: string; tag: string }[] = [
  { value: "OUTSTATION",  label: "Outstation",  tag: "bg-accent-surface text-accent-text" },
  { value: "LOCAL",       label: "Local",       tag: "bg-teal-surface text-teal-text" },
  { value: "SHIFTING",    label: "Shifting",    tag: "bg-fill-2 text-text-secondary" },
  { value: "LOCAL CFS",   label: "Local CFS",   tag: "bg-purple-surface text-purple-text" },
  { value: "RETURN TRIP", label: "Return Trip", tag: "bg-warning-surface text-warning-text" },
];

/** "OUTSTATION" → "Outstation": for report titles and the like. */
export const TRIP_CATEGORY_LABEL = Object.fromEntries(TRIP_CATEGORIES.map((c) => [c.value, c.label])) as Record<TripCategory, string>;

const BY_VALUE = new Map<string, (typeof TRIP_CATEGORIES)[number]>(TRIP_CATEGORIES.map((c) => [c.value, c]));

/** A trip's category as a small coloured tag ("—" when it has none). */
export function TripCategoryTag({ category, className = "" }: { category: string | null | undefined; className?: string }) {
  if (!category) return <span className={`text-text-tertiary ${className}`}>—</span>;
  const c = BY_VALUE.get(category);
  return (
    <span className={`inline-block w-fit whitespace-nowrap rounded-full px-2 py-px text-[10px] font-semibold ${c?.tag ?? "bg-fill-2 text-text-secondary"} ${className}`}>
      {c?.label ?? category}
    </span>
  );
}
