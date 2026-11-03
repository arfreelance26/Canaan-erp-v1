"use client";

/**
 * Icon hover motion: when the pointer enters a button, link, tab or menu item,
 * its Remix icon (every Remix icon renders with the `remixicon` class) plays a
 * short anime.js gesture. One delegated listener covers the whole app, so no
 * component needs wiring.
 *
 * The gesture is picked from the control's label (aria-label, title or text):
 *   ring   bells, alerts, notifications: swings from the top like a bell
 *   spin   settings, refresh, retry, sync: a part turn
 *   nudge  arrows, chevrons, next / back, expand / collapse: a step sideways
 *   wiggle everything else: a small tilt and lift
 * Override per control with data-icon-motion="ring|spin|nudge|wiggle|off"
 * (on the control or any ancestor; "off" turns it off for a whole area).
 *
 * Icons that already carry a transform (a chevron turned with rotate-180) or
 * spin (a loader) are left alone, as is everything under reduced motion.
 */
import { animate, type JSAnimation } from "animejs";
import { MOTION, prefersReducedMotion } from "./index";

export type IconMotion = "ring" | "spin" | "nudge" | "wiggle";

const CONTROL = 'a[href], button, [role="button"], [role="menuitem"], [role="tab"], [role="option"], summary';

const RULES: [RegExp, IconMotion][] = [
  [/\b(alert|alerts|notification|notifications|bell|remind)/i, "ring"],
  [/\b(setting|settings|display|preferences|refresh|reload|retry|try again|sync|reset)/i, "spin"],
  [/\b(next|previous|prev|back|forward|expand|collapse|open menu|go to)\b/i, "nudge"],
];

const running = new WeakMap<SVGElement, JSAnimation>();

function motionFor(control: Element): IconMotion | "off" {
  const set = control.closest<HTMLElement>("[data-icon-motion]")?.dataset.iconMotion;
  if (set === "off" || set === "ring" || set === "spin" || set === "nudge" || set === "wiggle") return set;
  const label = control.getAttribute("aria-label") || control.getAttribute("title") || control.textContent || "";
  return RULES.find(([re]) => re.test(label))?.[1] ?? "wiggle";
}

function play(icon: SVGElement, kind: IconMotion) {
  const base = { ease: MOTION.easeOut, onComplete: () => clear(icon) };
  switch (kind) {
    case "ring":
      icon.style.transformOrigin = "50% 8%";
      return animate(icon, { rotate: [0, 16, -12, 7, -3, 0], duration: 620, ...base });
    case "spin":
      icon.style.transformOrigin = "50% 50%";
      return animate(icon, { rotate: [0, 120], duration: 520, ...base });
    case "nudge":
      return animate(icon, { translateX: [0, 3, 0], duration: 360, ...base });
    case "wiggle":
      icon.style.transformOrigin = "50% 50%";
      return animate(icon, { rotate: [0, -10, 6, 0], scale: [1, 1.12, 1], duration: 460, ...base });
  }
}

// Drop the inline styles once the gesture ends, so classes own the icon again.
function clear(icon: SVGElement) {
  icon.style.transform = "";
  icon.style.transformOrigin = "";
  running.delete(icon);
}

function onPointerOver(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  const target = event.target as Element | null;
  const control = target?.closest?.(CONTROL);
  if (!control) return;
  // Only on entering the control, not on moving between its children.
  const from = event.relatedTarget as Node | null;
  if (from && control.contains(from)) return;
  if (control.matches(":disabled, [aria-disabled='true']")) return;

  const icon = control.querySelector<SVGElement>("svg.remixicon");
  if (!icon || running.has(icon) || icon.classList.contains("animate-spin")) return;
  if (getComputedStyle(icon).transform !== "none") return;

  const kind = motionFor(control);
  if (kind === "off") return;
  const anim = play(icon, kind);
  if (anim) running.set(icon, anim);
}

/** Start the app-wide listener; returns the cleanup. */
export function startIconHoverMotion(): () => void {
  if (typeof document === "undefined" || prefersReducedMotion()) return () => {};
  document.addEventListener("pointerover", onPointerOver, { passive: true });
  return () => document.removeEventListener("pointerover", onPointerOver);
}
