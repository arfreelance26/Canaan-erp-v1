"use client";

import { useCountUpText } from "@/lib/motion";

/**
 * A figure that counts up when it appears and tweens when it changes. Takes
 * the value already formatted ("₹1,23,456", "12 / 20", 87) and keeps that
 * format while counting. Use it wherever a stat or KPI figure is shown.
 */
export function AnimatedNumber({ value }: { value: string | number }) {
  return <>{useCountUpText(typeof value === "number" ? value.toLocaleString("en-IN") : value)}</>;
}
