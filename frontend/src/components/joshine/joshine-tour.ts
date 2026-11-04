"use client";

import { createElement, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DriveStep, Driver } from "driver.js";
import type { JoshineExpression, JoshineSettings } from "@/lib/joshine";
import { findTourButton, resolveTourTarget, stepIsForRole, TOUR_SIDEBAR_EVENT, type Tour, type TourStep } from "@/lib/tours";
import { JoshineFace } from "./JoshineFace";

/**
 * Runs a tour from lib/tours.ts with driver.js, with Joshine as the guide:
 * every popover carries Joshine's face (the person's own shape and colour)
 * with the step's expression, and the pet in the corner follows along.
 * driver.js and its stylesheet load on the first tour only (styles/tour.css).
 */

// ── Live tour state, read by the pet (useTourState) ─────────────────────────
type TourState = { active: boolean; expression: JoshineExpression | null };
let state: TourState = { active: false, expression: null };
const listeners = new Set<() => void>();
function setState(next: TourState) {
  state = next;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Whether a tour is running, and Joshine's face for the current step. */
export function useTourState(): TourState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// ── Which tours this person has seen (per browser) ──────────────────────────
type UserId = string | number | null | undefined;
const seenKey = (userId: string | number) => `canaan.tours.seen.v1.${userId}`;

/** True when this person has finished or turned down the tour (no id: assume seen). */
export function hasSeenTour(userId: UserId, tourId: string): boolean {
  if (userId == null) return true;
  try {
    return (JSON.parse(localStorage.getItem(seenKey(userId)) ?? "[]") as string[]).includes(tourId);
  } catch {
    return false;
  }
}

export function markTourSeen(userId: UserId, tourId: string) {
  if (userId == null) return;
  try {
    const seen = new Set(JSON.parse(localStorage.getItem(seenKey(userId)) ?? "[]") as string[]);
    seen.add(tourId);
    localStorage.setItem(seenKey(userId), JSON.stringify([...seen]));
  } catch {
    /* private window: the offer may come back, harmless */
  }
}

/** Whether this person asked Joshine to stop offering page tours. */
export function pageOffersOff(userId: UserId): boolean {
  if (userId == null) return true;
  try {
    return localStorage.getItem(`canaan.tours.offers-off.v1.${userId}`) === "1";
  } catch {
    return false;
  }
}

/** "Don't offer page tours": they stay available from Joshine's panel. */
export function turnOffPageOffers(userId: UserId) {
  if (userId == null) return;
  try {
    localStorage.setItem(`canaan.tours.offers-off.v1.${userId}`, "1");
  } catch {
    /* private window: harmless */
  }
}

// ── Running a tour ───────────────────────────────────────────────────────────
let current: Driver | null = null;
let faceRoot: Root | null = null;

function unmountFace() {
  faceRoot?.unmount();
  faceRoot = null;
}

/** Starts `tour`; resolves once it's on screen. A running tour is replaced.
 *
 * A step with `click` starts a new part: when the person presses Next, the
 * button named there is clicked (a tab, so only the view changes), and the
 * next part's steps are looked up on the screen as it is then. */
export async function startTour(tour: Tour, joshine: JoshineSettings, opts: { userId?: UserId; role?: string } = {}) {
  const { driver } = await import("driver.js");
  current?.destroy();

  const name = joshine.name || "Joshine";
  const say = (s: string) => s.replaceAll("{name}", name);

  // Split into parts at each `click` step.
  const parts: TourStep[][] = [];
  for (const step of tour.steps.filter((st) => stepIsForRole(st, opts.role))) {
    if (step.click || step.part || parts.length === 0) parts.push([]);
    parts[parts.length - 1].push(step);
  }
  const multi = parts.length > 1;

  const runPart = (index: number): void => {
    // Only steps whose element is on screen for this person right now; steps
    // with no element are Joshine talking in the middle.
    const resolved = parts[index]
      .map((step) => ({ step, el: resolveTourTarget(step) }))
      .filter(({ el }) => el !== null);
    const hasNext = index + 1 < parts.length;
    if (resolved.length === 0) {
      if (hasNext) return switchTo(index + 1);
      return finish();
    }

    const driveSteps: DriveStep[] = resolved.map(({ step: s, el }, i) => ({
      element: el ?? undefined,
      data: { expression: s.expression ?? "calm" },
      popover: {
        title: say(s.title),
        description: say(s.text),
        side: s.side,
        align: s.align,
        // A later part can't step back into the view before it.
        ...(index > 0 && i === 0 ? { showButtons: ["next", "close"] as ("next" | "close")[] } : {}),
        ...(hasNext && i === resolved.length - 1 ? { doneBtnText: "Next" } : {}),
      },
    }));

    let chaining = false;
    const d = driver({
      steps: driveSteps,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      allowKeyboardControl: true,
      overlayClickBehavior: "close",
      overlayColor: "var(--color-scrim)",
      overlayOpacity: 0.45,
      stagePadding: 6,
      stageRadius: 14,
      popoverOffset: 12,
      popoverClass: "joshine-tour",
      showProgress: resolved.length > 1,
      progressText: multi
        ? `Part ${index + 1} of ${parts.length}${parts[index][0].part ? ` · ${parts[index][0].part}` : ""} · {{current}} of {{total}}`
        : "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Done",
      closeBtnLabel: "End tour",
      onNextClick: (_el, _step, { driver: drv }) => {
        if (hasNext && drv.isLastStep()) {
          chaining = true;
          drv.destroy();
          switchTo(index + 1);
          return;
        }
        drv.moveNext();
      },
      onPopoverRender: (popover, { driver: drv }) => {
        const step = drv.getActiveStep();
        const expression = (step?.data?.expression ?? "calm") as JoshineExpression;
        setState({ active: true, expression });
        // Joshine's face beside the title, in the person's own look.
        unmountFace();
        const holder = document.createElement("span");
        holder.className = "joshine-tour-face";
        holder.setAttribute("aria-hidden", "true");
        popover.wrapper.insertBefore(holder, popover.title);
        faceRoot = createRoot(holder);
        faceRoot.render(createElement(JoshineFace, { shape: joshine.shape, color: joshine.color, expression, size: 44, lively: joshine.lively }));
      },
      onDestroyed: () => {
        unmountFace();
        if (chaining) return;
        finish();
      },
    });
    current = d;
    d.drive();
  };

  // Next part: click its tab first if it has one (and give the page a moment
  // to draw it); a plain new part just carries on.
  const switchTo = (index: number): void => {
    const label = parts[index][0].click;
    if (!label) return runPart(index);
    const tab = findTourButton(label);
    if (!tab) return finish();
    (tab as HTMLElement).click();
    window.setTimeout(() => runPart(index), 350);
  };

  const finish = (): void => {
    if (tour.hold === "sidebar") window.dispatchEvent(new CustomEvent(TOUR_SIDEBAR_EVENT, { detail: false }));
    setState({ active: false, expression: null });
    markTourSeen(opts.userId, tour.id);
    current = null;
  };

  // Open the menu first if the tour points into it, and let it slide open.
  if (tour.hold === "sidebar") {
    window.dispatchEvent(new CustomEvent(TOUR_SIDEBAR_EVENT, { detail: true }));
    window.setTimeout(() => runPart(0), 380);
  } else {
    runPart(0);
  }
}
