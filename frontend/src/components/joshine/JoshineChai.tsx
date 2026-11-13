"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import type { JoshineExpression } from "@/lib/joshine";

/**
 * Joshine's tea-time chai (11:00–11:02 and 16:00–16:02 IST — JoshinePet
 * decides when), in a teacup on a saucer, played step by step so the cup, her
 * hand and her face stay in sync:
 *
 *   arrive  cup and saucer rise in front of her with a small bounce
 *   hot     "too hot!": she looks at it surprised, the cup gives a little shake
 *   rest    she holds it in front of her by the handle, two soft curls of steam (about 15 s between sips)
 *   lift → sip → lower → after
 *           the steam fades first, the cup goes up to her mouth with a gentle
 *           tip, eyes closed and smiling while she drinks, back down to the
 *           saucer; then a blush and a small heart by her head. The chai
 *           level drops with every sip.
 *   putdown → leave
 *           when tea time ends: the empty cup settles on the saucer and both
 *           slide away, with a smile and a blush
 *
 * Calm (BEHAVIOUR_RULES.chai = "calm"): the cup fades in, no "too hot"
 * shake, just two slow sips (about 25 s and 75 s in, half the cup each), a
 * blush but no heart, and a gentle fade at the end.
 *
 * Nothing wispy is ever near her mouth (steam only rises from the cup while
 * it's down; no puffs) — so it reads as tea, not smoke.
 * Under reduced motion she just holds the cup, still.
 * Try it: window.dispatchEvent(new CustomEvent("joshine:chai")).
 */

export type ChaiPhase = "arrive" | "hot" | "rest" | "lift" | "sip" | "lower" | "after" | "putdown" | "leave";

/** Her face for each step (null = her own). */
export const CHAI_FACE: Record<ChaiPhase, JoshineExpression | null> = {
  arrive: "curious",
  hot: "surprised",
  rest: null,
  lift: null,
  sip: "happy",
  lower: "happy",
  after: "happy",
  putdown: "happy",
  leave: "happy",
};
export const CHAI_BLUSH: Partial<Record<ChaiPhase, boolean>> = { after: true, leave: true };

const MS = { arrive: 650, hot: 1600, firstRest: 2800, lift: 560, sip: 1200, lower: 520, after: 1400, rest: 11_000, putdown: 520, leave: 760 };
const SIP = 0.15;          // the level each sip takes (about 7 sips from full)
// Calm: two slow sips — when each starts (ms after the cup appears), half the cup each.
const CALM_SIPS = [25_000, 75_000];
const CALM_SIP = 0.5;

/** Runs the chai while `active`; returns the step on show and the chai left (1 full … 0 empty). */
export function useChai(active: boolean, mode: "full" | "calm" = "full"): { phase: ChaiPhase | null; level: number } {
  const [phase, setPhase] = useState<ChaiPhase | null>(null);
  const [level, setLevel] = useState(1);
  const timers = useRef<number[]>([]);
  const phaseRef = useRef<ChaiPhase | null>(null);

  function clear() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }
  function go(p: ChaiPhase | null) {
    phaseRef.current = p;
    setPhase(p);
  }
  function after(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  useEffect(() => {
    clear();
    if (active) {
      setLevel(1);
      if (prefersReducedMotion()) {
        go("rest");
        return clear;
      }
      if (mode === "calm") {
        // Fade in, hold, and two unhurried sips.
        const sipOnce = () => {
          go("lift");
          after(MS.lift * 1.4, () => {
            go("sip");
            setLevel((l) => Math.max(0, +(l - CALM_SIP).toFixed(2)));
            after(MS.sip * 1.3, () => {
              go("lower");
              after(MS.lower * 1.4, () => {
                go("after");
                after(MS.after, () => go("rest"));
              });
            });
          });
        };
        go("arrive");
        after(MS.arrive, () => go("rest"));
        CALM_SIPS.forEach((at) => after(at, sipOnce));
        return clear;
      }
      const sipLoop = () => {
        go("lift");
        after(MS.lift, () => {
          go("sip");
          setLevel((l) => Math.max(0, +(l - SIP).toFixed(2)));
          after(MS.sip, () => {
            go("lower");
            after(MS.lower, () => {
              go("after");
              after(MS.after, () => {
                go("rest");
                after(MS.rest, sipLoop);
              });
            });
          });
        });
      };
      go("arrive");
      after(MS.arrive, () => {
        go("hot");
        after(MS.hot, () => {
          go("rest");
          after(MS.firstRest, sipLoop);
        });
      });
      return clear;
    }
    // Tea time over: the empty cup goes down onto the saucer, then both slide away.
    if (phaseRef.current === null) return clear;
    setLevel(0);
    go("putdown");
    after(MS.putdown, () => {
      go("leave");
      after(MS.leave, () => go(null));
    });
    return clear;
    // Runs on each change of `active` (or the mode); the timers are its own.
  }, [active, mode]);

  useEffect(() => clear, []);
  return { phase, level };
}

// Fixed art colours: the same on every body colour and theme.
const INK = "#1b2033";
const CHINA = "#fbfcfe";
const CHINA_SHADE = "#e8ebf2";
const BAND = "#7aa7ff";
const TEA = "#b06d36";
const STEAM = "#ffffff";
const HEART = "#ff6b8a";

// The cup and saucer are drawn around x 300 and placed at her centre, in front
// of her (CENTRE moves them 100 left, 10 down: cup at about 200, 310). Each
// step's pose turns the cup about its own middle (300, 300 before the move).
// Checked by rendering over her body: held in front of her below the eyes, and
// on the sip the rim comes up to her mouth (about 200, 292) with a gentle tip.
const CENTRE = "translate(-100 10)";
const POSE: Record<ChaiPhase, string> = {
  arrive: "none",
  hot: "translate(0px, -6px)",
  rest: "none",
  lift: "translate(0px, -12px) rotate(-6deg)",
  sip: "translate(-4px, -20px) rotate(-16deg)",
  lower: "translate(0px, -4px) rotate(-2deg)",
  after: "none",
  putdown: "none",
  leave: "none",
};
const STEAMY: Partial<Record<ChaiPhase, boolean>> = { arrive: true, hot: true, rest: true, after: true };

/** The teacup and saucer with her hand on the handle, drawn in her 400 × 400 box (inside her bob/tilt). */
export function JoshineChai({ phase, level, color, size, gentle = false }: {
  phase: ChaiPhase | null; level: number; color: string; size: number;
  /** Calm mode: fade in and out, no shake, no heart. */
  gentle?: boolean;
}) {
  if (!phase) return null;
  const teaY = 286 + (1 - level) * 30;     // the tea's surface sinks into the bowl…
  const teaRx = 44 - (1 - level) * 12;     // …and narrows with it
  const steam = STEAMY[phase] && level > 0.05;
  const outline = { stroke: INK, strokeOpacity: 0.22, strokeWidth: 3 };
  return (
    <svg viewBox="0 0 400 400" width={size} height={size} aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      {/* A small heart by her head after a sip */}
      {phase === "after" && !gentle && <path d="M 338 148 C 326 138 328 124 338 130 C 348 124 350 138 338 148 Z" fill={HEART} className="joshine-heart" />}

      <g
        className={phase === "arrive" ? (gentle ? "joshine-fade-on" : "joshine-chai-arrive") : undefined}
        style={{
          transform: phase === "leave" && !gentle ? "translate(70px, 110px)" : "none",
          opacity: phase === "leave" ? 0 : 1,
          transition: "transform 760ms cubic-bezier(0.5, 0, 0.75, 0), opacity 700ms ease-in",
        }}
      >
        <g transform={CENTRE}>
        {/* the saucer stays in front of her */}
        <ellipse cx={300} cy={342} rx={64} ry={12} fill={CHINA} {...outline} />
        <ellipse cx={300} cy={339} rx={34} ry={5} fill={CHINA_SHADE} />

        {/* the cup: lifted, tipped and lowered as she drinks */}
        <g
          className={phase === "hot" && !gentle ? "joshine-hot-shake" : undefined}
          style={{
            transformOrigin: "300px 300px",
            transform: POSE[phase],
            transition: gentle
              ? `transform ${phase === "sip" ? 1100 : 800}ms ease-in-out`
              : `transform ${phase === "sip" ? 640 : 520}ms cubic-bezier(0.34, 1.2, 0.64, 1)`,
          }}
        >
          {/* steam: two soft curls from the cup, only while it's down */}
          <g style={{ opacity: steam ? 0.9 : 0, transition: "opacity 300ms ease" }}>
            <path d="M 290 270 q -8 -10 0 -20 q 8 -10 0 -20" stroke={STEAM} strokeWidth={6} fill="none" strokeLinecap="round" className="joshine-steam" />
            <path d="M 312 266 q -8 -10 0 -20 q 8 -10 0 -20" stroke={STEAM} strokeWidth={6} fill="none" strokeLinecap="round" className="joshine-steam joshine-steam-2" />
          </g>
          {/* handle (a white edge, so it shows on any body colour) */}
          <path d="M 344 292 C 376 288 378 324 340 322" stroke="#ffffff" strokeWidth={15} fill="none" strokeLinecap="round" />
          <path d="M 344 292 C 376 288 378 324 340 322" stroke={CHINA_SHADE} strokeWidth={9} fill="none" strokeLinecap="round" />
          {/* bowl, band, rim and the chai */}
          <path d="M 252 282 Q 252 336 300 337 Q 348 336 348 282 Z" fill={CHINA} {...outline} />
          <path d="M 255 300 Q 300 312 345 300" stroke={BAND} strokeWidth={7} fill="none" strokeLinecap="round" />
          <ellipse cx={300} cy={282} rx={48} ry={10} fill={CHINA_SHADE} {...outline} />
          {level > 0.02 && <ellipse cx={300} cy={teaY} rx={teaRx} ry={7} fill={TEA} style={{ transition: "cy 600ms ease, rx 600ms ease" }} />}
          <path d="M 262 292 Q 266 318 280 326" stroke="#ffffff" strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.9} />
          {/* her hand on the handle, in her own colour */}
          <circle cx={372} cy={306} r={17} fill={color} stroke={INK} strokeOpacity={0.18} strokeWidth={4} />
        </g>
        </g>
      </g>
    </svg>
  );
}
