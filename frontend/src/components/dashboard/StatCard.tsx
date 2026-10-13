import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardVariant = "default" | "blue" | "emerald" | "amber" | "red" | "purple" | "indigo";

type StatCardProps = {
  label: string;
  value: string | number;
  caption?: string;
  icon: LucideIcon;
  variant?: StatCardVariant;
  onClick?: () => void;
  trend?: { delta: number; label: string };
};

// Every variant used to tint the whole card — six stat cards side by side
// each shouting a different color, with nothing to tell a routine number
// (Customers, Monthly Fixed) apart from a genuine alert (Urgent Alerts).
// Now only the icon chip carries the category color (same small-badge
// language as every page header elsewhere in the app); the card itself
// stays on the same neutral white surface as the rest of the UI, and the
// number is always plain dark gray — that's the thing someone's actually
// reading, it doesn't need to compete with its own card for attention.
//
// "red" is the one deliberate exception: callers only pass it when there's
// something to actually be alarmed about (see page.tsx's Urgent Alerts /
// Flagged Trips — variant is chosen FROM the real count, not hardcoded), so
// it keeps the full tint. That's what makes it register as an alert instead
// of just another one of six identically-loud boxes.
//
// The icon chip is a flat, fuller tint (not the pale gradient-to-white
// page-header version) and each card gets a thin colored rail on its left
// edge — same "active route" motif the Sidebar uses — so every card still
// carries its own color identity at a glance without going back to fully
// painting the card.
const ICON_CHIP: Record<StatCardVariant, string> = {
  default: "border-gray-200 bg-gray-100 text-gray-500",
  blue:    "border-blue-200 bg-blue-100 text-blue-600",
  emerald: "border-emerald-200 bg-emerald-100 text-emerald-600",
  amber:   "border-amber-200 bg-amber-100 text-amber-600",
  red:     "border-red-200 bg-red-100 text-red-600",
  purple:  "border-purple-200 bg-purple-100 text-purple-600",
  indigo:  "border-indigo-200 bg-indigo-100 text-indigo-600",
};

const RAIL: Record<StatCardVariant, string> = {
  default: "bg-gray-300",
  blue:    "bg-blue-500",
  emerald: "bg-emerald-500",
  amber:   "bg-amber-500",
  red:     "bg-red-500",
  purple:  "bg-purple-500",
  indigo:  "bg-indigo-500",
};

const HOVER_RING: Record<StatCardVariant, string> = {
  default: "hover:ring-gray-400",
  blue:    "hover:ring-blue-400",
  emerald: "hover:ring-emerald-400",
  amber:   "hover:ring-amber-400",
  red:     "hover:ring-red-400",
  purple:  "hover:ring-purple-400",
  indigo:  "hover:ring-indigo-400",
};

export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  variant = "default",
  onClick,
  trend,
}: StatCardProps) {
  const alert = variant === "red";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-5 pl-6 transition-shadow",
        alert ? "border-red-200 bg-red-50" : "border-gray-200 bg-white",
        onClick ? cn("cursor-pointer hover:shadow-md hover:ring-2 hover:ring-offset-1", HOVER_RING[variant]) : "",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
    >
      <span className={cn("absolute left-0 top-0 h-full w-1", RAIL[variant])} />
      <div className="flex items-center justify-between">
        <p className={cn(
          "text-xs font-semibold tracking-wider uppercase",
          alert ? "text-red-600" : "text-gray-400"
        )}>
          {label}
        </p>
        <span className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border shadow-sm",
          ICON_CHIP[variant]
        )}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={cn("mt-2 text-4xl font-bold leading-none", alert ? "text-red-700" : "text-gray-900")}>
        {value}
      </p>
      {trend && (
        <p className={cn(
          "mt-1.5 flex items-center gap-1 text-xs font-medium",
          trend.delta >= 0 ? "text-emerald-600" : "text-red-500",
        )}>
          {trend.delta >= 0
            ? <TrendingUp className="h-3 w-3" />
            : <TrendingDown className="h-3 w-3" />}
          {trend.delta >= 0 ? "+" : ""}{trend.delta} {trend.label}
        </p>
      )}
      {caption && <p className={cn("mt-1 text-sm", alert ? "text-red-600/80" : "text-gray-500")}>{caption}</p>}
    </div>
  );
}
