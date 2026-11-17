"use client";

import { useEffect, useState } from "react";
import { RiRouteLine as RouteIcon } from "@remixicon/react";
import { customersApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type Usage = Awaited<ReturnType<typeof customersApi.geoUsage>>;

/**
 * Admin (Activity Log): today's Geoapify road-distance credits against the
 * daily budget, who used most, and how many answers are kept (backend
 * geo_usage.py). Amber from 80% of the budget. Quietly absent if it can't load.
 */
export function GeoUsageLine() {
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => {
    customersApi.geoUsage().then(setU).catch(() => setU(null));
  }, []);
  if (!u) return null;
  const share = u.budget ? u.used / u.budget : 0;
  const top = u.by_person.slice(0, 3).map((p) => `${p.name} ${p.credits}`).join(", ");
  return (
    <p
      className={cn("flex flex-wrap items-center gap-1.5 text-xs", share >= 0.8 ? "text-warning-text" : "text-text-tertiary")}
      title={`Each person can use up to ${u.hourly_per_person} credits an hour. Answers already worked out are reused for free.`}
    >
      <RouteIcon className="h-3.5 w-3.5" />
      Road distance (Geoapify) today: <b>{u.used.toLocaleString("en-IN")}</b> of {u.budget.toLocaleString("en-IN")} credits
      {top && <span>· most by {top}</span>}
      <span>· {u.cached_answers.toLocaleString("en-IN")} answers kept, reused free</span>
    </p>
  );
}
