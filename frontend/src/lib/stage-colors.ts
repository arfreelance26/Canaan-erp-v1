/**
 * Stage color system for workflow tables.
 *
 * Every workflow screen (reconciliation, sheet-collection, verification …) has
 * filter cards colored per stage. These helpers reuse those exact colors to
 * tint each table row and render a matching status badge, so a row's stage is
 * readable at a glance and consistent with the filter it belongs to.
 *
 * Full class strings are enumerated (not built dynamically) so Tailwind keeps
 * them in the build. Row tints use the -50 background, which is dark-adapted in
 * globals.css, so they read correctly in both light and dark themes.
 */

export type StageColor =
  | "gray"
  | "amber"
  | "yellow"
  | "blue"
  | "emerald"
  | "rose"
  | "red"
  | "orange"
  | "purple"
  | "indigo"
  | "teal";

// Full-row tint + colored left bar (per the chosen "full row tint" style).
const ROW: Record<StageColor, string> = {
  gray: "border-l-4 border-l-gray-300 hover:bg-gray-50",
  amber: "border-l-4 border-l-amber-400 bg-amber-50 hover:bg-amber-100/70",
  yellow: "border-l-4 border-l-yellow-400 bg-yellow-50 hover:bg-yellow-100/70",
  blue: "border-l-4 border-l-blue-400 bg-blue-50 hover:bg-blue-100/70",
  emerald: "border-l-4 border-l-emerald-400 bg-emerald-50 hover:bg-emerald-100/70",
  rose: "border-l-4 border-l-rose-400 bg-rose-50 hover:bg-rose-100/70",
  red: "border-l-4 border-l-red-400 bg-red-50 hover:bg-red-100/70",
  orange: "border-l-4 border-l-orange-400 bg-orange-50 hover:bg-orange-100/70",
  purple: "border-l-4 border-l-purple-400 bg-purple-50 hover:bg-purple-100/70",
  indigo: "border-l-4 border-l-indigo-400 bg-indigo-50 hover:bg-indigo-100/70",
  teal: "border-l-4 border-l-teal-400 bg-teal-50 hover:bg-teal-100/70",
};

const BADGE: Record<StageColor, string> = {
  gray:    "bg-gray-100    text-gray-700    dark:text-gray-900",
  amber:   "bg-amber-100   text-amber-700   dark:text-amber-900",
  yellow:  "bg-yellow-100  text-yellow-700  dark:text-yellow-900",
  blue:    "bg-blue-100    text-blue-700    dark:text-blue-900",
  emerald: "bg-emerald-100 text-emerald-700 dark:text-emerald-900",
  rose:    "bg-rose-100    text-rose-700    dark:text-rose-900",
  red:     "bg-red-100     text-red-700     dark:text-red-900",
  orange:  "bg-orange-100  text-orange-700  dark:text-orange-900",
  purple:  "bg-purple-100  text-purple-700  dark:text-purple-900",
  indigo:  "bg-indigo-100  text-indigo-700  dark:text-indigo-900",
  teal:    "bg-teal-100    text-teal-700    dark:text-teal-900",
};

/** Row `<tr>` className for a stage color (full tint + left bar). */
export function stageRowClass(color: StageColor): string {
  return ROW[color];
}

/** Pill className for a status badge in the matching stage color. */
export function stageBadgeClass(color: StageColor): string {
  return `inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE[color]}`;
}
