import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardVariant = "default" | "blue" | "emerald" | "amber" | "red" | "purple";

type StatCardProps = {
  label: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  variant?: StatCardVariant;
  onClick?: () => void;
};

const VARIANTS: Record<
  StatCardVariant,
  { card: string; icon: string; label: string; value: string; caption: string }
> = {
  default: {
    card: "border-gray-200 bg-white",
    icon: "text-gray-400",
    label: "text-gray-400",
    value: "text-gray-900",
    caption: "text-gray-500",
  },
  blue: {
    card: "border-blue-200 bg-blue-50",
    icon: "text-blue-500",
    label: "text-blue-500",
    value: "text-blue-800",
    caption: "text-blue-600/80",
  },
  emerald: {
    card: "border-emerald-200 bg-emerald-50",
    icon: "text-emerald-500",
    label: "text-emerald-600",
    value: "text-emerald-800",
    caption: "text-emerald-600/80",
  },
  amber: {
    card: "border-amber-200 bg-amber-50",
    icon: "text-amber-500",
    label: "text-amber-600",
    value: "text-amber-800",
    caption: "text-amber-600/80",
  },
  red: {
    card: "border-red-200 bg-red-50",
    icon: "text-red-500",
    label: "text-red-600",
    value: "text-red-700",
    caption: "text-red-600/80",
  },
  purple: {
    card: "border-purple-200 bg-purple-50",
    icon: "text-purple-500",
    label: "text-purple-600",
    value: "text-purple-800",
    caption: "text-purple-600/80",
  },
};

export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  variant = "default",
  onClick,
}: StatCardProps) {
  const s = VARIANTS[variant];
  return (
    <div
      className={cn(
        "rounded-xl border p-5",
        s.card,
        onClick ? "cursor-pointer transition-shadow hover:shadow-md hover:ring-2 hover:ring-offset-1" : "",
        onClick && variant === "blue" ? "hover:ring-blue-400" : "",
        onClick && variant === "emerald" ? "hover:ring-emerald-400" : "",
        onClick && variant === "amber" ? "hover:ring-amber-400" : "",
        onClick && variant === "red" ? "hover:ring-red-400" : "",
        onClick && variant === "purple" ? "hover:ring-purple-400" : "",
        onClick && variant === "default" ? "hover:ring-gray-400" : "",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
    >
      <div className="flex items-center justify-between">
        <p className={cn("text-xs font-semibold tracking-wider uppercase", s.label)}>
          {label}
        </p>
        <Icon className={cn("h-5 w-5", s.icon)} />
      </div>
      <p className={cn("mt-2 text-3xl font-bold", s.value)}>{value}</p>
      <p className={cn("mt-1 text-sm", s.caption)}>{caption}</p>
    </div>
  );
}
