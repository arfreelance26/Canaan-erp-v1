"use client";

import { useEffect } from "react";
import { startIconHoverMotion } from "@/lib/motion/icon-hover";

/** Mounted once in the root layout: plays the icon hover gestures app-wide
 *  (see lib/motion/icon-hover.ts). Renders nothing. */
export function IconHoverMotion() {
  useEffect(() => startIconHoverMotion(), []);
  return null;
}
