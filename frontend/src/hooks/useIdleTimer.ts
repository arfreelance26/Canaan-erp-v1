"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_EVENTS = ["keypress", "mousemove", "touchmove", "click", "scroll"] as const;

/**
 * Minimal idle-timeout hook. Replaces react-haiku's `useIdle`, which can
 * enter a "Maximum update depth exceeded" render loop under React 19 /
 * Turbopack — its event handler calls setState unconditionally on every
 * qualifying DOM event, and a burst of those (e.g. from a smooth-scroll
 * animation) can retrigger renders faster than React can settle.
 *
 * This version only ever calls setState on an actual idle <-> active
 * transition, so a flood of activity events just resets a ref-backed timer
 * without touching React state.
 */
export function useIdleTimer(timeoutMs: number, initialIdle = false): boolean {
  const [idle, setIdle] = useState(initialIdle);
  const idleRef = useRef(initialIdle);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    idleRef.current = idle;
  }, [idle]);

  useEffect(() => {
    function goIdle() {
      if (!idleRef.current) {
        idleRef.current = true;
        setIdle(true);
      }
    }

    function resetTimer() {
      if (idleRef.current) {
        idleRef.current = false;
        setIdle(false);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(goIdle, timeoutMs);
    }

    resetTimer();
    for (const event of DEFAULT_EVENTS) {
      document.addEventListener(event, resetTimer, { passive: true });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of DEFAULT_EVENTS) {
        document.removeEventListener(event, resetTimer);
      }
    };
  }, [timeoutMs]);

  return idle;
}
