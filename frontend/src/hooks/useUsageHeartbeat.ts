"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { moduleForPath } from "@/lib/usage-modules";
import { usageApi } from "@/lib/api";

const IDLE_THRESHOLD_MS = 2 * 60 * 1000;   // 2 minutes of no mouse/key/touch = idle
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;   // send accumulated active/idle seconds every 5 minutes

/**
 * SW Usage Analytics' only client-side instrumentation. Mounted once in
 * AppShell (not per-page) while a user is logged in.
 *
 * Idle/active detection is free — `useIdleTimer` already listens for
 * keypress/mousemove/touchmove/click/scroll. This hook just ticks a local
 * 1-second interval that adds elapsed time to whichever bucket (active/idle)
 * the current `idle` flag says, under whatever module the current pathname
 * maps to (see lib/usage-modules.ts). Nothing is sent to the server on every
 * tick — only on a 5-minute timer, a module/path change, or the tab being
 * hidden/closed, each of which flushes the single module/time currently
 * accumulated and resets the local counters to zero.
 */
export function useUsageHeartbeat(enabled: boolean) {
  const pathname = usePathname();
  const idle = useIdleTimer(IDLE_THRESHOLD_MS);

  const idleRef = useRef(idle);
  const moduleRef = useRef(moduleForPath(pathname ?? "/"));
  const activeSecondsRef = useRef(0);
  const idleSecondsRef = useRef(0);
  const enabledRef = useRef(enabled);

  useEffect(() => { idleRef.current = idle; }, [idle]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const flush = useRef(() => {
    if (!enabledRef.current) return;
    const activeSeconds = activeSecondsRef.current;
    const idleSeconds = idleSecondsRef.current;
    if (activeSeconds === 0 && idleSeconds === 0) return;
    const moduleName = moduleRef.current;
    activeSecondsRef.current = 0;
    idleSecondsRef.current = 0;
    usageApi.heartbeat(moduleName, activeSeconds, idleSeconds).catch(() => {
      // Best-effort — a dropped heartbeat just means this slice of time is
      // under-counted, never worth surfacing to the user.
    });
  });

  // 1-second local tick — accumulates time, no network cost.
  useEffect(() => {
    const id = setInterval(() => {
      if (!enabledRef.current) return;
      if (idleRef.current) idleSecondsRef.current += 1;
      else activeSecondsRef.current += 1;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Periodic safety flush.
  useEffect(() => {
    const id = setInterval(() => flush.current(), FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Module/path change — flush whatever accumulated under the OLD module
  // before switching the ref, so time is attributed to the right section.
  useEffect(() => {
    const nextModule = moduleForPath(pathname ?? "/");
    if (nextModule !== moduleRef.current) {
      flush.current();
      moduleRef.current = nextModule;
    }
  }, [pathname]);

  // Tab hidden or closed — flush immediately rather than losing up to 5
  // minutes of activity. sendBeacon-style reliability isn't worth the extra
  // endpoint shape here; a best-effort fetch is consistent with every other
  // background call in this app, and losing an occasional final slice on a
  // hard crash is an acceptable tradeoff for a usage-trends feature.
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === "hidden") flush.current();
    }
    function onUnload() {
      flush.current();
    }
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);
}
