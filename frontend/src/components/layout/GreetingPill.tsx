"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CloudSun, Moon, Sun, Sunset } from "lucide-react";
import { cn } from "@/lib/utils";
import { claimGreeting, finishGreeting, type GreetingSlot } from "@/lib/greetings";

const SHOW_MS = 6000;
const ROLL_MS = 500;
// The normal (breadcrumb) pill: pl-1 + pr-3 + 1px border each side, and a
// h-7 Home icon + py-1 + border tall. The greeting pill is bigger; while it
// rolls away it eases back to exactly these, so the breadcrumb never changes.
const PILL_CHROME_PX = 4 + 12 + 2;
const PILL_HEIGHT_PX = 28 + 8 + 2;

const SLOT_ICON: Record<GreetingSlot, { icon: typeof Sun; style: string }> = {
  morning: { icon: Sun, style: "bg-amber-50 text-amber-500" },
  afternoon: { icon: CloudSun, style: "bg-orange-50 text-orange-500" },
  evening: { icon: Sunset, style: "bg-rose-50 text-rose-500" },
  night: { icon: Moon, style: "bg-indigo-50 text-indigo-500" },
};

type Phase = "greeting" | "leaving" | "done";

/**
 * The Topbar's breadcrumb pill. Right after a login it first shows a time-of-
 * day greeting for 6s, then the greeting rolls up and out while the
 * breadcrumb rolls up into place (and the pill eases to its width). Any other
 * time — refresh, navigation — it's just the breadcrumb.
 */
export function GreetingPill({ userKey, name, children }: { userKey: string; name: string; children: ReactNode }) {
  const [greeting] = useState(() => (name ? claimGreeting(userKey, name) : null));
  const [phase, setPhase] = useState<Phase>(greeting ? "greeting" : "done");
  const [navSize, setNavSize] = useState<{ w: number; h: number } | undefined>(undefined);
  const navRef = useRef<HTMLElement | null>(null);
  const crumbRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);

  const leave = useCallback(() => {
    if (phase !== "greeting") return;
    const nav = navRef.current;
    const targetW = crumbRef.current ? crumbRef.current.offsetWidth + PILL_CHROME_PX : undefined;
    if (nav && targetW) {
      setNavSize({ w: nav.offsetWidth, h: nav.offsetHeight });
      // Two frames so the browser commits the starting size before the
      // target one — otherwise there's nothing to transition from.
      requestAnimationFrame(() => requestAnimationFrame(() => setNavSize({ w: targetW, h: PILL_HEIGHT_PX })));
    }
    setPhase("leaving");
    timers.current.push(window.setTimeout(() => {
      finishGreeting();
      setNavSize(undefined);
      setPhase("done");
    }, ROLL_MS + 50));
  }, [phase]);

  useEffect(() => {
    if (phase !== "greeting") return;
    const id = window.setTimeout(leave, SHOW_MS);
    return () => window.clearTimeout(id);
  }, [phase, leave]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const pillClass =
    "dk-inset flex min-w-0 items-center gap-1 rounded-full border border-gray-200/70 bg-white/70 py-1 pl-1 pr-3 shadow-sm";

  if (phase === "done" || !greeting) {
    return <nav className={cn(pillClass, "max-w-xs sm:max-w-sm")}>{children}</nav>;
  }

  const { icon: Icon, style } = SLOT_ICON[greeting.slot];
  return (
    <nav
      ref={navRef}
      aria-live="polite"
      className={cn(
        pillClass,
        "relative overflow-hidden max-w-[calc(100vw-9rem)] sm:max-w-2xl",
        // Bigger pill only while greeting; back to the breadcrumb's own padding as it rolls away.
        phase === "greeting" && "py-1 pl-1.5 pr-8",
      )}
      style={
        navSize
          ? {
              width: navSize.w,
              height: navSize.h,
              transition: `width ${ROLL_MS}ms cubic-bezier(0.4, 0, 0.2, 1), height ${ROLL_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            }
          : undefined
      }
    >
      <button
        type="button"
        onClick={leave}
        title="Dismiss"
        className={cn(
          "flex min-w-0 items-center gap-3 text-left",
          phase === "leaving" ? "animate-greet-out" : "animate-greet-in",
        )}
      >
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", style)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate text-base font-semibold tracking-[-0.01em] text-gray-900 sm:text-lg">
          {greeting.text}
        </span>
      </button>
      <div
        ref={crumbRef}
        aria-hidden={phase === "greeting"}
        className={cn(
          "absolute inset-y-0 left-1 flex items-center gap-1 whitespace-nowrap",
          phase === "leaving" ? "animate-crumb-in" : "pointer-events-none translate-y-full opacity-0",
        )}
      >
        {children}
      </div>
    </nav>
  );
}
