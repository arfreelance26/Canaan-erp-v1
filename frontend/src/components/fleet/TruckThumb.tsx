"use client";

import { useState } from "react";
import { RiTruckLine as TruckIcon } from "@remixicon/react";
import type { Truck } from "@/types/truck";
import { truckImageUrl } from "@/components/fleet/VehicleImages";
import { cn } from "@/lib/utils";

/** The truck's Vehicle Identity Image as a 44px rounded square; the page's own
 *  truck-icon tile when it has none (or the image fails to load). `tile` sets
 *  that fallback's colours, e.g. Truck Maintenance's orange, Fuel History's blue. */
export function TruckThumb({ truck, tile }: { truck: Truck; tile: string }) {
  const [broken, setBroken] = useState(false);
  const src = truck.truckPhotosFileName && !broken ? truckImageUrl(truck, "photo") : null;
  if (src) {
    return (
      <span className="flex h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-separator-border bg-fill-2 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${truck.registrationNumber} photo`} loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm", tile)}>
      <TruckIcon className="h-5 w-5" />
    </span>
  );
}
