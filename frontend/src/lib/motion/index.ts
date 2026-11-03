"use client";

/**
 * App motion, built on anime.js v4 and tuned to BoardUI's motion language
 * (skill reference: motion.md). The ONE place timings and easings live.
 *
 *   useEnter(ref)              page / panel content condenses into place once
 *   useCountUp(value)          a figure tweens to its new value
 *   useRouteLineFill(ref, pct) the trip route line fills to the current stage
 *
 * Rules: entrances fade + tiny rise + ≤2px blur, ease-out, 360ms, short
 * stagger; never loop, never bounce; everything is skipped when the user
 * prefers reduced motion. Hover/press feedback stays in CSS (transition-colors).
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { animate, cubicBezier, stagger } from "animejs";

export const MOTION = {
  /** BoardUI ease-out with presence: strong deceleration, no overshoot. */
  easeOut: cubicBezier(0.22, 1, 0.36, 1),
  duration: { micro: 150, enter: 360, figure: 600, line: 700 },
  stagger: 40,
} as const;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Animate the element's `[data-enter]` descendants (or the element itself when
 * it has none) into place once on mount. Re-runs when `key` changes, e.g. the
 * route path, so each page gets one entrance.
 */
export function useEnter<T extends HTMLElement>(ref: RefObject<T | null>, key?: unknown) {
  useEffect(() => {
    const root = ref.current;
    if (!root || prefersReducedMotion()) return;
    const marked = root.querySelectorAll<HTMLElement>("[data-enter]");
    const targets = marked.length ? Array.from(marked) : [root];
    const anim = animate(targets, {
      opacity: [0, 1],
      translateY: [4, 0],
      filter: ["blur(2px)", "blur(0px)"],
      duration: MOTION.duration.enter,
      delay: stagger(MOTION.stagger),
      ease: MOTION.easeOut,
      // Clear the transform/filter once settled: a lingering inline transform
      // would make this element the containing block for position:fixed children.
      onComplete: () =>
        targets.forEach((t) => {
          t.style.transform = "";
          t.style.filter = "";
        }),
    });
    return () => {
      anim.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * Tween a displayed number toward `value`. First render shows the value as-is
 * (no count-up from zero on every visit); later changes tween over 600ms.
 */
export function useCountUp(value: number, { animateFirst = false } = {}): number {
  const [display, setDisplay] = useState(animateFirst ? 0 : value);
  const current = useRef(display);
  const first = useRef(true);

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    if ((first.current && !animateFirst) || prefersReducedMotion()) {
      first.current = false;
      current.current = value;
      setDisplay(value);
      return;
    }
    first.current = false;
    const state = { n: current.current };
    const anim = animate(state, {
      n: value,
      duration: MOTION.duration.figure,
      ease: MOTION.easeOut,
      onUpdate: () => {
        current.current = state.n;
        setDisplay(state.n);
      },
    });
    return () => {
      anim.pause();
    };
  }, [value, animateFirst]);

  return display;
}

/** Fill a route-line track (scaleX from the left) to `fraction` (0–1). */
export function useRouteLineFill<T extends HTMLElement>(ref: RefObject<T | null>, fraction: number) {
  const last = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const to = Math.max(0, Math.min(1, fraction));
    if (prefersReducedMotion()) {
      el.style.transform = `scaleX(${to})`;
      last.current = to;
      return;
    }
    const anim = animate(el, {
      scaleX: [last.current, to],
      duration: MOTION.duration.line,
      ease: MOTION.easeOut,
    });
    last.current = to;
    return () => {
      anim.pause();
    };
  }, [ref, fraction]);
}
