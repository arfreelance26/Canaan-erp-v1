"use client";

import { useEffect } from "react";

/**
 * Mounts a single capture-phase wheel listener on document that blurs any
 * focused <input type="number"> before the browser can increment/decrement
 * its value via scroll. Applies globally to every number input in the app.
 */
export function NoScrollNumberInputs() {
  useEffect(() => {
    function handler(e: WheelEvent) {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === "number") {
        active.blur();
      }
    }

    document.addEventListener("wheel", handler, { capture: true, passive: true });
    return () => document.removeEventListener("wheel", handler, true);
  }, []);

  return null;
}
