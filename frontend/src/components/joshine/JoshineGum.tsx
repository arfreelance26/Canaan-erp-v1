"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import type { JoshineExpression } from "@/lib/joshine";

/**
 * Joshine's chewing-gum bubble, a surprise that never plays the same way twice.
 *
 * When: only when things are genuinely quiet — after a random 3 – 5 min with
 * nobody touching anything, and at most once per random 30 – 45 min. Never
 * while someone works, and never while Joshine wears her glasses or holds her
 * chai (JoshinePet keeps it waiting then, and for five quiet minutes after).
 *
 * How (picked at random each time; the puffs vary too):
 *   normal  blow → tremble → POP → gum stuck on the face → shake → it falls off → blush
 *   giant   a bigger bubble, an extra puff, a longer tremble, a bigger splat
 *   fizzle  a small bubble that goes "pfft" and shrinks; Joshine sulks
 *   saved   it swells and trembles, then Joshine sucks it back in, smug, and winks
 *
 * Moving the mouse or pressing a key mid-blow pops it early (a surprise one
 * only pops on a key or click, so it isn't ruined by the mouse at once).
 * Never during a greeting, tour, offer or the creator, tucked, or under
 * reduced motion.
 *
 * Try it: window.dispatchEvent(new CustomEvent("joshine:gum", { detail: "giant" }))
 * (detail: "normal" | "giant" | "fizzle" | "saved", or none for a random one).
 */

export type GumStyle = "normal" | "giant" | "fizzle" | "saved";
export type GumPhase =
  | "blow" | "tremble"
  | "pop" | "stuck" | "shake" | "fall" | "sheepish"   // normal / giant
  | "fizzle" | "sulk"                                  // fizzle
  | "suck" | "smug" | "proud";                         // saved

export type GumRun = {
  style: GumStyle;
  /** The bubble's size at its biggest (1 = Joshine-sized). */
  max: number;
  /** Each puff: the size it reaches and how long it takes (ms). */
  puffs: { scale: number; ms: number }[];
};

export const GUM_EVENT = "joshine:gum";

/** Joshine's face for each phase: serious while blowing, shocked at the pop. */
export const GUM_FACE: Record<GumPhase, JoshineExpression> = {
  blow: "determined",
  tremble: "determined",
  pop: "surprised",
  stuck: "surprised",
  shake: "grumpy",
  fall: "dots",
  sheepish: "happy",
  fizzle: "dots",
  sulk: "sad",
  suck: "surprised",
  smug: "sideeye",
  proud: "wink",
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const SECOND = 1000;
const MINUTE = 60 * SECOND;

function pickStyle(): GumStyle {
  const r = Math.random();
  if (r < 0.2) return "giant";
  if (r < 0.37) return "fizzle";
  if (r < 0.47) return "saved";
  return "normal";
}

/** A bubble of `style`, with its own number, size and pace of puffs. */
function planRun(style: GumStyle): GumRun {
  const max = style === "giant" ? 1.3 : style === "fizzle" ? rand(0.28, 0.38) : 1;
  const count = style === "giant" ? randInt(3, 5) : style === "fizzle" ? 2 : randInt(2, 4);
  const puffs = Array.from({ length: count }, (_, i) => {
    const last = i === count - 1;
    const share = (i + 1) / count;
    return { scale: last ? max : max * share * rand(0.88, 1.04), ms: Math.round(rand(450, 820)) };
  });
  return { style, max, puffs };
}

/** The phases after the blow, and how long each lasts (ms). */
function afterBlow(style: GumStyle): [GumPhase, number][] {
  switch (style) {
    case "fizzle":
      return [["fizzle", 650], ["sulk", 1200]];
    case "saved":
      return [["tremble", 950], ["suck", 420], ["smug", 900], ["proud", 800]];
    case "giant":
      return [["tremble", 1100], ...popTail(1500)];
    default:
      return [["tremble", 650], ...popTail(1300)];
  }
}
function popTail(stuckMs: number): [GumPhase, number][] {
  return [["pop", 260], ["stuck", stuckMs], ["shake", 650], ["fall", 650], ["sheepish", 1100]];
}

/**
 * Runs the bubble. `allowed` is false whenever Joshine is busy (greeting,
 * tour, creator, tucked…). Returns the bubble being blown and its phase.
 */
export function useGumBubble(allowed: boolean): { run: GumRun | null; phase: GumPhase | null } {
  const [state, setState] = useState<{ run: GumRun | null; phase: GumPhase | null }>({ run: null, phase: null });
  const current = useRef<{ run: GumRun | null; phase: GumPhase | null; surprise: boolean }>({ run: null, phase: null, surprise: false });
  const timers = useRef<number[]>([]);
  const allowedRef = useRef(allowed);
  // Random timings, drawn afresh after every bubble.
  const lastActive = useRef(0);
  const lastKey = useRef(0);
  const pointer = useRef({ x: -1, y: -1 });
  const idleNeeded = useRef(0);
  const nextAllowed = useRef(0);

  function clear() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }
  function show(run: GumRun | null, phase: GumPhase | null) {
    current.current = { ...current.current, run, phase };
    setState({ run, phase });
  }
  function stop() {
    clear();
    show(null, null);
  }
  function play(run: GumRun, steps: [GumPhase, number][]) {
    clear();
    let at = 0;
    steps.forEach(([p, ms]) => {
      timers.current.push(window.setTimeout(() => show(run, p), at));
      at += ms;
    });
    timers.current.push(window.setTimeout(() => show(null, null), at));
  }
  function reroll(now: number) {
    idleNeeded.current = rand(3 * MINUTE, 5 * MINUTE);
    nextAllowed.current = now + rand(30 * MINUTE, 45 * MINUTE);
  }
  function start(style: GumStyle = pickStyle(), surprise = false) {
    if (current.current.run || !allowedRef.current || prefersReducedMotion()) return;
    reroll(Date.now());
    current.current.surprise = surprise;
    const run = planRun(style);
    const blowMs = run.puffs.reduce((sum, p) => sum + p.ms, 0);
    play(run, [["blow", blowMs], ...afterBlow(style)]);
  }
  /** Touched mid-blow: it pops (a fizzle just fizzles). */
  function interrupt() {
    const { run, phase } = current.current;
    if (!run || (phase !== "blow" && phase !== "tremble")) return;
    play(run, run.style === "fizzle" ? afterBlow("fizzle") : popTail(run.style === "giant" ? 1500 : 1300));
  }

  useEffect(() => {
    allowedRef.current = allowed;
    // Something else needs Joshine: drop the gum at once.
    if (!allowed && current.current.run) stop();
  }, [allowed]);

  useEffect(() => {
    const now = Date.now();
    lastActive.current = now;
    reroll(now);
    nextAllowed.current = now;   // the first one only waits for the idle time

    const onMove = (e: PointerEvent) => {
      lastActive.current = Date.now();
      pointer.current = { x: e.clientX, y: e.clientY };
      if (!current.current.surprise) interrupt();
    };
    const onScroll = () => {
      lastActive.current = Date.now();
      if (!current.current.surprise) interrupt();
    };
    const onPress = () => {
      lastActive.current = Date.now();
      interrupt();
    };
    const onKey = () => {
      lastKey.current = Date.now();
      onPress();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("wheel", onScroll, { passive: true });
    window.addEventListener("pointerdown", onPress, { passive: true });
    window.addEventListener("touchstart", onPress, { passive: true });
    window.addEventListener("keydown", onKey);

    const onDemand = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      const style = (["normal", "giant", "fizzle", "saved"] as const).find((s) => s === detail);
      start(style ?? pickStyle());
    };
    window.addEventListener(GUM_EVENT, onDemand);

    const check = window.setInterval(() => {
      const t = Date.now();
      if (document.hidden || current.current.run) return;
      // Left alone long enough (the only time it plays now).
      if (t >= nextAllowed.current && t - lastActive.current >= idleNeeded.current) start();
    }, 4000);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("wheel", onScroll);
      window.removeEventListener("pointerdown", onPress);
      window.removeEventListener("touchstart", onPress);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(GUM_EVENT, onDemand);
      window.clearInterval(check);
      clear();
    };
    // Listeners read refs; set up once.
  }, []);

  return state;
}

// Fixed art colours, like Joshine's eyes: gum is pink on every body colour.
const GUM = "#ff8fc4";
const GUM_RIM = "#f2629f";
const SHINE = "#ffffff";

// Where the bubble comes out: the middle of the face, under the eyes.
const MX = 200;
const MY = 292;
const ORIGIN = `${MX}px ${MY}px`;

// Bits that fly off when it pops: direction and size (scaled with the bubble).
const BITS = [
  { dx: -150, dy: -110, r: 16 }, { dx: 160, dy: -95, r: 13 }, { dx: -175, dy: 40, r: 11 },
  { dx: 170, dy: 60, r: 15 }, { dx: -40, dy: -170, r: 10 }, { dx: 60, dy: 150, r: 12 },
];

// The burst gum, flattened over the face with a few drips.
const SPLAT =
  "M 74 206 C 62 146 132 118 202 126 C 284 118 350 148 336 208 C 346 252 322 280 302 286 " +
  "C 300 314 290 336 280 314 C 276 298 262 292 246 294 C 232 297 228 336 214 338 " +
  "C 200 340 204 302 190 298 C 162 292 142 302 130 294 C 120 318 104 322 104 298 " +
  "C 72 290 58 252 74 206 Z";

/** The puffs as keyframes: each overshoots a little, then eases back. */
function blowFrames(run: GumRun): { frames: Keyframe[]; ms: number } {
  const ms = run.puffs.reduce((sum, p) => sum + p.ms, 0);
  const frames: Keyframe[] = [{ transform: "scale(0.04)", offset: 0 }];
  let at = 0;
  run.puffs.forEach((p, i) => {
    const last = i === run.puffs.length - 1;
    const peak = (at + p.ms * 0.7) / ms;
    at += p.ms;
    frames.push({ transform: `scale(${(p.scale * 1.05).toFixed(3)}, ${(p.scale * 0.97).toFixed(3)})`, offset: peak, easing: "ease-in-out" });
    frames.push({ transform: last ? `scale(${p.scale})` : `scale(${(p.scale * 0.95).toFixed(3)}, ${(p.scale * 1.01).toFixed(3)})`, offset: at / ms });
  });
  return { frames, ms };
}

/**
 * The gum itself, drawn over Joshine in the same 400 × 400 box (it may spill
 * past the edges). Sits inside Joshine's bob/tilt so it moves with it.
 */
export function JoshineGum({ run, phase, size }: { run: GumRun | null; phase: GumPhase | null; size: number }) {
  const bubbleRef = useRef<SVGGElement>(null);
  const bubbleShown = phase === "blow" || phase === "tremble" || phase === "fizzle" || phase === "suck";

  // The bubble's size: grown puff by puff, then shrunk for a fizzle or a save.
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el || !run) return;
    if (phase === "blow") {
      const { frames, ms } = blowFrames(run);
      const a = el.animate(frames, { duration: ms, fill: "forwards" });
      return () => a.cancel();
    }
    if (phase === "tremble") {
      el.style.transform = `scale(${run.max})`;
    }
    if (phase === "fizzle" || phase === "suck") {
      const from = `scale(${run.max})`;
      const frames: Keyframe[] = phase === "fizzle"
        ? [{ transform: from }, { transform: `scale(${run.max * 1.08}, ${run.max * 0.8})`, offset: 0.25 }, { transform: "scale(0)" }]
        : [{ transform: from }, { transform: "scale(0.1)" }];
      const a = el.animate(frames, { duration: phase === "fizzle" ? 650 : 420, easing: "cubic-bezier(0.5, 0, 0.9, 0.5)", fill: "forwards" });
      return () => a.cancel();
    }
  }, [run, phase]);

  if (!run || !phase) return null;
  const k = run.max;
  const splatScale = run.style === "giant" ? 1.15 : 1;
  const splat = phase === "pop" || phase === "stuck" || phase === "shake" || phase === "fall";
  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible"
    >
      {bubbleShown && (
        <g ref={bubbleRef} style={{ transformOrigin: ORIGIN, transform: "scale(0.04)" }}>
          <g className={phase === "tremble" ? "gum-tremble" : undefined} style={{ transformOrigin: ORIGIN }}>
            <circle cx={MX} cy={MY - 40} r={150} fill={GUM} fillOpacity={0.9} stroke={GUM_RIM} strokeWidth={6} />
            <ellipse cx={MX - 62} cy={MY - 118} rx={34} ry={20} fill={SHINE} fillOpacity={0.75} transform={`rotate(-32 ${MX - 62} ${MY - 118})`} />
            <circle cx={MX + 70} cy={MY + 30} r={9} fill={SHINE} fillOpacity={0.5} />
          </g>
        </g>
      )}

      {phase === "pop" && (
        <g>
          <circle cx={MX} cy={MY - 40 * k} r={150 * k} fill="none" stroke={GUM} strokeWidth={14} className="gum-ring" style={{ transformOrigin: `${MX}px ${MY - 40 * k}px` }} />
          {BITS.map((b, i) => (
            <circle
              key={i}
              cx={MX}
              cy={MY - 40 * k}
              r={b.r * Math.max(1, k)}
              fill={GUM}
              className="gum-bit"
              style={{ ["--dx" as string]: `${b.dx * k}px`, ["--dy" as string]: `${b.dy * k}px` }}
            />
          ))}
        </g>
      )}

      {splat && (
        <g transform={`translate(200 230) scale(${splatScale}) translate(-200 -230)`}>
          <g className={phase === "fall" ? "gum-fall" : phase === "pop" ? "gum-splat" : undefined} style={{ transformOrigin: "200px 230px" }}>
            <path d={SPLAT} fill={GUM} fillOpacity={0.86} stroke={GUM_RIM} strokeWidth={5} strokeLinejoin="round" />
            <path d="M 120 178 C 150 156 190 150 222 154" stroke={SHINE} strokeOpacity={0.6} strokeWidth={10} strokeLinecap="round" fill="none" />
            <circle cx={280} cy={170} r={7} fill={SHINE} fillOpacity={0.55} />
          </g>
        </g>
      )}
    </svg>
  );
}
