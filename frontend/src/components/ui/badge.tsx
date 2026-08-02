import { cn } from "@/lib/utils";

type BadgeVariant = "active" | "available" | "warning" | "critical" | "neutral" | "purple" | "indigo";

const VARIANTS: Record<BadgeVariant, string> = {
  active:    "bg-blue-100 text-blue-700",
  available: "bg-emerald-100 text-emerald-700",
  warning:   "bg-amber-100 text-amber-700",
  critical:  "bg-red-100 text-red-700",
  neutral:   "bg-gray-200 text-gray-600",
  purple:    "bg-purple-100 text-purple-700",
  indigo:    "bg-indigo-100 text-indigo-700",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge, type BadgeVariant };
