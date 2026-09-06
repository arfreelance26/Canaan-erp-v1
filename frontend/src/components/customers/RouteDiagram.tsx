"use client";

import { Truck, MapPin } from "lucide-react";

type RouteDiagramProps = {
  originState?: string;
  originAddress?: string;
  destinationState?: string;
  destinationAddress?: string;
  approxDistanceKm?: string;
  /** Smaller variant for use inside cards/grids. */
  compact?: boolean;
};

// Dotted origin -> destination diagram (truck badge to pin badge) shared by
// the destination form's live preview and the pricing form's route cards.
export function RouteDiagram({
  originState,
  originAddress,
  destinationState,
  destinationAddress,
  approxDistanceKm,
  compact = false,
}: RouteDiagramProps) {
  return (
    <div className={compact ? "relative h-40 w-full" : "relative h-56 w-full sm:h-64"}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        fill="none"
      >
        <path
          d="M10,64 C 34,64 24,38 50,38 S 74,14 91,11"
          stroke="#1f2937"
          strokeWidth={compact ? 1.3 : 1.5}
          strokeLinecap="round"
          strokeDasharray="0.2 6.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Origin — truck */}
      <div className="absolute bottom-0 left-0 flex flex-col items-start gap-2">
        <div
          className={[
            "flex items-center justify-center rounded-xl bg-gray-900 text-white shadow-lg",
            compact ? "h-8 w-8" : "h-11 w-11",
          ].join(" ")}
        >
          <Truck className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </div>
        <div className={compact ? "max-w-[8rem]" : "max-w-[10rem]"}>
          <p className="truncate text-[11px] font-semibold uppercase text-gray-700">
            {originState || "Origin state"}
          </p>
          <p className="truncate text-[11px] text-gray-400">{originAddress || "Origin address"}</p>
        </div>
      </div>

      {/* Destination — pin */}
      <div className="absolute right-0 top-0 flex flex-col items-end gap-2">
        <div
          className={[
            "flex items-center justify-center rounded-full bg-gray-900 text-white shadow-lg",
            compact ? "h-8 w-8" : "h-11 w-11",
          ].join(" ")}
        >
          <MapPin className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </div>
        <div className={compact ? "max-w-[8rem] text-right" : "max-w-[10rem] text-right"}>
          <p className="truncate text-[11px] font-semibold uppercase text-gray-700">
            {destinationState || "Destination state"}
          </p>
          <p className="truncate text-[11px] text-gray-400">
            {destinationAddress || "Destination address"}
          </p>
        </div>
      </div>

      {/* Distance badge, centered on the path */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow-md">
        {approxDistanceKm ? `${approxDistanceKm} km` : "Distance not set"}
      </div>
    </div>
  );
}
