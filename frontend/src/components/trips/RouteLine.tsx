"use client";

import { useRef } from "react";
import { cx } from "@/utils/cx";
import { useRouteLineFill } from "@/lib/motion";
import { ROUTE_STEPS } from "@/lib/trip-stage";

type RouteLineProps = {
  /** Current step, an index into ROUTE_STEPS (see getRouteStep). */
  step: number;
  /** "compact" for table rows (dots only, label in the tooltip); "full" shows every step name. */
  size?: "compact" | "full";
  className?: string;
};

/**
 * The trip route line — Canaan's signature detail. A thin track with one dot
 * per stage, filled up to where the trip is now. Used for trip stage only.
 *
 *   <RouteLine step={getRouteStep(trip) ?? 0} />
 */
export function RouteLine({ step, size = "compact", className }: RouteLineProps) {
  const fillRef = useRef<HTMLSpanElement>(null);
  const last = ROUTE_STEPS.length - 1;
  const current = Math.max(0, Math.min(last, step));
  useRouteLineFill(fillRef, current / last);
  const label = `${ROUTE_STEPS[current]} · step ${current + 1} of ${ROUTE_STEPS.length}`;

  return (
    <div
      role="img"
      aria-label={`Trip stage: ${label}`}
      title={size === "compact" ? label : undefined}
      className={cx(size === "compact" ? "w-24" : "w-full", className)}
    >
      <div className="relative flex h-3 items-center">
        <span aria-hidden className="absolute inset-x-1 h-px bg-separator-border-strong" />
        <span
          ref={fillRef}
          aria-hidden
          className="absolute inset-x-1 h-px origin-left bg-accent-solid"
          style={{ transform: `scaleX(${current / last})` }}
        />
        <div className="relative flex w-full justify-between">
          {ROUTE_STEPS.map((name, i) => (
            <span
              key={name}
              aria-hidden
              className={cx(
                "rounded-full transition-colors",
                i === current
                  ? "size-2.5 bg-accent-solid ring-2 ring-accent-surface"
                  : i < current
                    ? "size-1.5 bg-accent-solid"
                    : "size-1.5 border border-separator-border-strong bg-background-primary-default",
              )}
            />
          ))}
        </div>
      </div>
      {size === "full" && (
        <div className="mt-2 flex justify-between gap-2">
          {ROUTE_STEPS.map((name, i) => (
            <span
              key={name}
              className={cx(
                "text-caption-1-regular first:text-left last:text-right",
                i === current ? "text-text-primary" : "text-text-tertiary",
              )}
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
