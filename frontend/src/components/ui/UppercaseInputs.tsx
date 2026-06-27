"use client";

import { useEffect } from "react";

// Input types that must NOT be uppercased
const EXCLUDED_TYPES = new Set([
  "password",
  "email",
  "number",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
  "range",
  "color",
  "file",
  "checkbox",
  "radio",
  "submit",
  "button",
  "reset",
  "hidden",
]);

/**
 * Mounts a single capture-phase listener on document that converts every
 * text input / textarea value to uppercase before React's own listeners see
 * the event. Using the native setter ensures React's synthetic onChange fires
 * with the already-uppercased value, so component state is always uppercase.
 */
export function UppercaseInputs() {
  useEffect(() => {
    const inputSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    const textareaSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;

    function handler(e: Event) {
      const t = e.target;

      if (t instanceof HTMLInputElement) {
        if (EXCLUDED_TYPES.has(t.type)) return;
        const upper = t.value.toUpperCase();
        if (upper !== t.value) inputSetter?.call(t, upper);
      } else if (t instanceof HTMLTextAreaElement) {
        const upper = t.value.toUpperCase();
        if (upper !== t.value) textareaSetter?.call(t, upper);
      }
    }

    // Capture phase: fires before React's root-container bubble listener,
    // so React always receives the uppercase value when it processes the event.
    document.addEventListener("input", handler, true);
    return () => document.removeEventListener("input", handler, true);
  }, []);

  return null;
}
