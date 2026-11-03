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
  gray: "border-l-4 border-l-border-button-default hover:bg-fill-2",
  amber: "border-l-4 border-l-warning-border-strong bg-warning-surface hover:bg-warning-surface-strong/70",
  yellow: "border-l-4 border-l-warning-border-strong bg-warning-surface hover:bg-warning-surface-strong/70",
  blue: "border-l-4 border-l-accent-border-strong bg-accent-surface hover:bg-accent-surface-strong/70",
  emerald: "border-l-4 border-l-success-border-strong bg-success-surface hover:bg-success-surface-strong/70",
  rose: "border-l-4 border-l-danger-border-strong bg-danger-surface hover:bg-danger-surface-strong/70",
  red: "border-l-4 border-l-danger-border-strong bg-danger-surface hover:bg-danger-surface-strong/70",
  orange: "border-l-4 border-l-orange-border-strong bg-orange-surface hover:bg-orange-surface-strong/70",
  purple: "border-l-4 border-l-purple-border-strong bg-purple-surface hover:bg-purple-surface-strong/70",
  indigo: "border-l-4 border-l-purple-border-strong bg-purple-surface hover:bg-purple-surface-strong/70",
  teal: "border-l-4 border-l-teal-border-strong bg-teal-surface hover:bg-teal-surface-strong/70",
};

const BADGE: Record<StageColor, string> = {
  gray:    "bg-fill-2 text-text-primary",
  amber:   "bg-warning-surface-strong text-warning-text",
  yellow:  "bg-warning-surface-strong text-warning-text",
  blue:    "bg-accent-surface-strong text-accent-text",
  emerald: "bg-success-surface-strong text-success-text",
  rose:    "bg-danger-surface-strong text-danger-text",
  red:     "bg-danger-surface-strong text-danger-text",
  orange:  "bg-orange-surface-strong text-orange-text",
  purple:  "bg-purple-surface-strong text-purple-text",
  indigo:  "bg-purple-surface-strong text-purple-text",
  teal:    "bg-teal-surface-strong text-teal-text",
};

/** All stage colors in a fixed order, for cycling through a palette by index. */
export const ALL_STAGE_COLORS: StageColor[] = [
  "blue", "emerald", "purple", "orange", "rose", "teal",
  "indigo", "amber", "red", "yellow", "gray",
];

/** Row `<tr>` className for a stage color (full tint + left bar). */
export function stageRowClass(color: StageColor): string {
  return ROW[color];
}

/** Pill className for a status badge in the matching stage color. */
export function stageBadgeClass(color: StageColor): string {
  return `inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-caption-1-semibold ${BADGE[color]}`;
}
