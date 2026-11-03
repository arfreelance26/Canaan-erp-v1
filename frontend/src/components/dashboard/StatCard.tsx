"use client";

import { type RemixiconComponentType } from "@remixicon/react";
import { RiArrowRightDownLine, RiArrowRightUpLine } from "@remixicon/react";
import { cx } from "@/utils/cx";
import { useCountUp } from "@/lib/motion";

type StatCardVariant = "default" | "blue" | "emerald" | "amber" | "red" | "purple" | "indigo";

type StatCardProps = {
  label: string;
  value: string | number;
  caption?: string;
  /** Kept for API compatibility; stat cards are numbers, so it's not drawn. */
  icon?: RemixiconComponentType;
  /** Only "red" changes the look — callers pass it when the count is a real alert. */
  variant?: StatCardVariant;
  onClick?: () => void;
  trend?: { delta: number; label: string };
};

/** A numeric figure tweens to new values; formatted strings render as given. */
function Figure({ value }: { value: string | number }) {
  const n = useCountUp(typeof value === "number" ? value : 0);
  if (typeof value !== "number") return <>{value}</>;
  return <>{Math.round(n).toLocaleString("en-IN")}</>;
}

/**
 * Dashboard KPI: label, figure, change with what it compares to. Neutral
 * surface; the only colour is an alert (variant "red") and the trend sign.
 */
export function StatCard({ label, value, caption, variant = "default", onClick, trend }: StatCardProps) {
  const alert = variant === "red";
  const interactive = Boolean(onClick);

  return (
    <div
      className={cx(
        "flex flex-col gap-2 rounded-2xl border p-5 outline-none transition-colors",
        alert ? "border-danger-border bg-danger-surface" : "border-separator-border bg-background-primary-default",
        interactive && "cursor-pointer focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        interactive && (alert ? "hover:border-danger-border-strong" : "hover:bg-background-secondary-default"),
      )}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); } : undefined}
    >
      <p className={cx("text-body-regular", alert ? "text-danger-text" : "text-text-secondary")}>{label}</p>
      <p className={cx("text-title-1-medium tabular-nums", alert ? "text-danger-text-strong" : "text-text-primary")}>
        <Figure value={value} />
      </p>
      {trend && (
        <p className={cx("flex items-center gap-1 text-caption-1-regular", trend.delta >= 0 ? "text-success-text" : "text-danger-text")}>
          {trend.delta >= 0 ? <RiArrowRightUpLine className="size-3.5" /> : <RiArrowRightDownLine className="size-3.5" />}
          <span className="tabular-nums">{trend.delta >= 0 ? "+" : ""}{trend.delta}</span>
          <span className="text-text-tertiary">{trend.label}</span>
        </p>
      )}
      {caption && <p className={cx("text-caption-1-regular", alert ? "text-danger-text" : "text-text-tertiary")}>{caption}</p>}
    </div>
  );
}
