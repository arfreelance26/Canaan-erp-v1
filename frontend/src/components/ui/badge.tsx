import { cn } from "@/lib/utils";

type BadgeVariant = "active" | "available" | "warning" | "critical" | "neutral" | "purple" | "indigo";

const VARIANTS: Record<BadgeVariant, string> = {
  active:    "bg-accent-surface-strong text-accent-text",
  available: "bg-success-surface-strong text-success-text",
  warning:   "bg-warning-surface-strong text-warning-text",
  critical:  "bg-danger-surface-strong text-danger-text",
  neutral:   "bg-fill-3 text-text-secondary",
  purple:    "bg-purple-surface-strong text-purple-text",
  indigo:    "bg-purple-surface-strong text-purple-text",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption-1-semibold",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge, type BadgeVariant };
