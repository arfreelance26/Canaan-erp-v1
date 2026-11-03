"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// December festive decorations (see SeasonContext). Pointer-events-none
// decoration; motion is CSS (bday-* keyframes in globals.css) or a small
// canvas, both off under prefers-reduced-motion.

const GUST_S = 6;
const gustDelay = (x: number) => `${-(GUST_S - ((((x / 700) % GUST_S) + GUST_S) % GUST_S))}s`;

/** Deterministic 0..1 noise from a page x — the garland looks the same on
 *  every render and lines up between the sidebar and the topbar. */
function rand(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function usePageStrip<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((b) => (Math.round(r.left) === b.left && Math.round(r.width) === b.width ? b : { left: Math.round(r.left), width: Math.round(r.width) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  return { ref, ...box };
}

// ── Pine garland ───────────────────────────────────────────────────────────

const SPAN = 300, PIN_Y = 4, SAG = 14, H = 46;
const NEEDLES = ["#1d5a37", "#2a7a49", "#3c955b", "#164a2d"];

function curve(x: number) {
  const t = ((((x) % SPAN) + SPAN) % SPAN) / SPAN;
  return { y: PIN_Y + SAG * 4 * t * (1 - t), slope: (SAG * 4 * (1 - 2 * t)) / SPAN, t };
}

/** Draped pine garland with berries, baubles and bows at the pins — drawn in
 *  page coordinates so the sidebar's and the topbar's join into one. */
export function PineGarland({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const { ref, left, width } = usePageStrip<HTMLDivElement>();

  const parts = useMemo(() => {
    if (!width) return null;
    const needles: { x1: number; y1: number; x2: number; y2: number; c: string; w: number }[] = [];
    for (let x = Math.floor(left / 3) * 3 - 6; x < left + width + 6; x += 3) {
      const { y, slope } = curve(x);
      const a = Math.atan(slope);
      for (let k = 0; k < 3; k++) {
        const r = rand(x * 3 + k);
        const side = k % 2 ? 1 : -1;
        const ang = a + side * (0.6 + r * 0.7) + (k === 2 ? Math.PI / 2 * (r - 0.5) : 0);
        const len = 5 + rand(x + k * 17) * 4;
        needles.push({
          x1: x, y1: y + (r - 0.5) * 2,
          x2: x + Math.cos(ang) * len * (k === 2 ? 0.6 : 1), y2: y + Math.sin(ang) * len + 1.5,
          c: NEEDLES[Math.floor(rand(x * 7 + k) * NEEDLES.length)], w: 1.1 + r * 0.5,
        });
      }
    }
    const berries: { x: number; y: number }[] = [];
    const baubles: { x: number; y: number; red: boolean }[] = [];
    const pins: number[] = [];
    for (let x = Math.floor(left / 46) * 46; x < left + width + 46; x += 46) {
      const { y, t } = curve(x);
      if (t < 0.06 || t > 0.94) continue;
      if (Math.round(x / 46) % 2) {
        baubles.push({ x, y, red: Math.round(x / 92) % 2 === 0 });
      } else {
        berries.push({ x: x - 2, y: y + 1 }, { x: x + 2, y: y + 0.4 }, { x, y: y + 3.4 });
      }
    }
    for (let x = Math.floor(left / SPAN) * SPAN; x < left + width + SPAN; x += SPAN) pins.push(x);
    return { needles, berries, baubles, pins };
  }, [left, width]);

  return (
    <div ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 overflow-hidden", className)} style={{ height: H }}>
      {parts && (
        <>
          {/* Static layer — ~1000 needles + the drop shadow. Promoted to its own
              compositor layer so it's rasterised once, not on every frame the
              baubles swing (that repaint was what made the snow stutter). */}
          <svg width={width} height={H} viewBox={`${left} 0 ${width} ${H}`}
            className="absolute inset-0 block [filter:drop-shadow(0_1.5px_1px_rgba(15,23,42,0.2))] [will-change:transform] dark:[filter:drop-shadow(0_2px_2px_rgba(0,0,0,0.5))]">
            {parts.needles.map((n, i) => (
              <line key={i} x1={n.x1} y1={n.y1} x2={n.x2} y2={n.y2} stroke={n.c} strokeWidth={n.w} strokeLinecap="round" />
            ))}
            {parts.berries.map((b, i) => (
              <g key={`b${i}`}>
                <circle cx={b.x} cy={b.y} r={1.9} fill="#c62828" />
                <circle cx={b.x - 0.6} cy={b.y - 0.6} r={0.6} fill="#ffb4ad" />
              </g>
            ))}
            {parts.pins.map((x) => (
              <g key={`p${x}`}>
                <path d={`M${x} ${PIN_Y + 1} L${x - 6} ${PIN_Y - 2.5} L${x - 6} ${PIN_Y + 4.5} Z M${x} ${PIN_Y + 1} L${x + 6} ${PIN_Y - 2.5} L${x + 6} ${PIN_Y + 4.5} Z`} fill="#c62828" />
                <path d={`M${x - 0.8} ${PIN_Y + 1.5} L${x - 3} ${PIN_Y + 9} M${x + 0.8} ${PIN_Y + 1.5} L${x + 3} ${PIN_Y + 9}`} stroke="#c62828" strokeWidth={1.4} strokeLinecap="round" />
                <circle cx={x} cy={PIN_Y + 1} r={1.6} fill="#9b1c1c" />
              </g>
            ))}
          </svg>
          {/* Animated layer — just the swinging baubles, no filter (each draws
              its own small shadow), so a frame of the swing is cheap. */}
          <svg width={width} height={H} viewBox={`${left} 0 ${width} ${H}`} className="absolute inset-0 block">
            <defs>
              <radialGradient id={`${uid}-red`} cx="35%" cy="30%">
                <stop offset="0" stopColor="#ff8a80" /><stop offset="0.55" stopColor="#c62828" /><stop offset="1" stopColor="#7f1010" />
              </radialGradient>
              <radialGradient id={`${uid}-gold`} cx="35%" cy="30%">
                <stop offset="0" stopColor="#fff1c4" /><stop offset="0.55" stopColor="#d4a017" /><stop offset="1" stopColor="#8a6610" />
              </radialGradient>
            </defs>
            {parts.baubles.map((b) => (
              <g key={`o${b.x}`} className="bday-flag" style={{ animationDelay: gustDelay(b.x) }}>
                <line x1={b.x} y1={b.y + 2} x2={b.x} y2={b.y + 9} stroke="#c9a227" strokeWidth={0.7} />
                <circle cx={b.x + 0.6} cy={b.y + 17.4} r={5.4} className="fill-[rgba(15,23,42,0.18)] dark:fill-[rgba(0,0,0,0.45)]" />
                <rect x={b.x - 1.8} y={b.y + 8.6} width={3.6} height={2.2} rx={0.6} fill="#d4a017" />
                <circle cx={b.x} cy={b.y + 16} r={5.4} fill={`url(#${uid}-${b.red ? "red" : "gold"})`} />
                <ellipse cx={b.x - 1.9} cy={b.y + 14} rx={1.1} ry={1.8} fill="#ffffff" opacity={0.6} />
              </g>
            ))}
          </svg>
        </>
      )}
    </div>
  );
}

// ── Snowfall ───────────────────────────────────────────────────────────────

/** A few slow flakes drifting inside the parent (the topbar) only. */
/** `glitter` swaps the snow for slow-falling gold specks (1–4 January). */
export function Snowfall({ count = 24, className, glitter = false }: { count?: number; className?: string; glitter?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    let flakes: { x: number; y: number; r: number; vy: number; phase: number; drift: number }[] = [];
    const resize = () => {
      const oldW = w;
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // The sidebar widens / narrows (collapse toggle): spread the flakes over
      // the new width at once instead of leaving them bunched on one side.
      if (oldW > 0 && w > 0 && oldW !== w) for (const f of flakes) f.x *= w / oldW;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    flakes = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: 0.9 + Math.random() * 1.6, vy: 0.12 + Math.random() * 0.22,
      phase: Math.random() * Math.PI * 2, drift: 0.3 + Math.random() * 0.5,
    }));
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // Move by real elapsed time (in 60fps-frame units), so a frame the
      // browser drops doesn't freeze the snow for a beat. Capped so a long
      // pause (tab in background) doesn't teleport everything.
      const k = Math.min(now - last, 100) / 16.667;
      last = now;
      if (document.hidden) return;
      const dark = document.documentElement.classList.contains("dark");
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = glitter
        ? (dark ? "rgba(243,217,139,0.9)" : "rgba(201,162,39,0.75)")
        : (dark ? "rgba(255,255,255,0.85)" : "rgba(148,170,210,0.75)");
      for (const f of flakes) {
        f.y += f.vy * k;
        f.phase += 0.012 * k;
        f.x += Math.sin(f.phase) * f.drift * 0.35 * k;
        if (f.y - f.r > h) { f.y = -f.r; f.x = Math.random() * w; }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [count, glitter]);
  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 h-full w-full [will-change:transform]", className)} />;
}

// ── New Year's Day streamers ───────────────────────────────────────────────

/** Gold + silver twisted ribbons draped like the garland, with curled strands
 *  hanging and swaying — replaces the pine garland on 1–4 January. */
export function Streamers({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const { ref, left, width } = usePageStrip<HTMLDivElement>();

  const parts = useMemo(() => {
    if (!width) return null;
    const ribbon = (phase: number) => {
      let d = "";
      for (let x = Math.floor(left / 2) * 2 - 4; x < left + width + 4; x += 2) {
        const { y } = curve(x);
        d += `${d ? "L" : "M"}${x} ${(y + Math.sin(x / 7 + phase) * 2.6).toFixed(2)} `;
      }
      return d;
    };
    const curls: { x: number; y: number; gold: boolean; len: number }[] = [];
    for (let x = Math.floor(left / 28) * 28; x < left + width + 28; x += 28) {
      const { y, t } = curve(x);
      if (t < 0.05 || t > 0.95) continue;
      curls.push({ x, y, gold: Math.round(x / 28) % 2 === 0, len: 12 + rand(x) * 10 });
    }
    return { gold: ribbon(0), silver: ribbon(Math.PI), curls };
  }, [left, width]);

  return (
    <div ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 overflow-hidden", className)} style={{ height: H }}>
      {parts && (
        <>
          <svg width={width} height={H} viewBox={`${left} 0 ${width} ${H}`}
            className="absolute inset-0 block [filter:drop-shadow(0_1.5px_1px_rgba(15,23,42,0.2))] [will-change:transform] dark:[filter:drop-shadow(0_2px_2px_rgba(0,0,0,0.5))]">
            <defs>
              <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="1" y2="0" spreadMethod="reflect" gradientUnits="userSpaceOnUse" gradientTransform="scale(22 1)">
                <stop offset="0" stopColor="#fff1c4" /><stop offset="0.5" stopColor="#d4a017" /><stop offset="1" stopColor="#8a6610" />
              </linearGradient>
              <linearGradient id={`${uid}-s`} x1="0" y1="0" x2="1" y2="0" spreadMethod="reflect" gradientUnits="userSpaceOnUse" gradientTransform="scale(18 1)">
                <stop offset="0" stopColor="#ffffff" /><stop offset="0.5" stopColor="#c3cad6" /><stop offset="1" stopColor="#7d8796" />
              </linearGradient>
            </defs>
            <path d={parts.silver} fill="none" stroke={`url(#${uid}-s)`} strokeWidth={2.6} strokeLinecap="round" />
            <path d={parts.gold} fill="none" stroke={`url(#${uid}-g)`} strokeWidth={3} strokeLinecap="round" />
          </svg>
          <svg width={width} height={H} viewBox={`${left} 0 ${width} ${H}`} className="absolute inset-0 block">
            {parts.curls.map((c) => (
              <g key={c.x} className="bday-flag" style={{ animationDelay: gustDelay(c.x) }}>
                <path
                  d={`M${c.x} ${c.y + 1} c 3 ${c.len * 0.2} -3 ${c.len * 0.4} 0 ${c.len * 0.6} s -3 ${c.len * 0.25} 0 ${c.len * 0.4}`}
                  fill="none" stroke={c.gold ? "#d4a017" : "#b8c0cc"} strokeWidth={1.6} strokeLinecap="round" />
              </g>
            ))}
          </svg>
        </>
      )}
    </div>
  );
}

/** "2027" in shining gold — put inside FitMark (topbar, 1–4 January). */
export function NewYearMark({ year }: { year: number }) {
  return <span className="bday-gold-text font-serif text-[30px] font-semibold tracking-[0.18em] opacity-90">{year}</span>;
}

// ── Christmas Day sleigh ───────────────────────────────────────────────────

/** Santa's sleigh and two reindeer gliding once across the parent (the
 *  topbar), trailing sparkles. Unmounts itself when the flight ends. */
export function SantaSleigh({ onDone, className }: { onDone?: () => void; className?: string }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setGone(true); onDone?.(); return; }
    const t = window.setTimeout(() => { setGone(true); onDone?.(); }, 10_500);
    return () => window.clearTimeout(t);
  }, [onDone]);
  if (gone) return null;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="santa-flight absolute top-[14px] text-[#1b2b5e] dark:text-[#f3d98b]">
        <svg width="150" height="34" viewBox="0 0 150 34" fill="currentColor" className="santa-bob drop-shadow-[0_0_6px_rgba(243,217,139,0.55)]">
          {/* sparkle trail */}
          <g className="santa-trail" fill="#f3c94b">
            <circle cx="4" cy="22" r="1.1" /><circle cx="12" cy="18" r="0.9" /><circle cx="20" cy="24" r="1.2" /><circle cx="27" cy="19" r="0.8" />
          </g>
          {/* sleigh */}
          <path d="M34 20 h26 c4 0 6 -3 6 -7 h4 c0 8 -4 13 -11 13 h-21 z" />
          <path d="M32 28 h32 c4 0 6 -1 7 -3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M40 26 v2 M58 26 v2" stroke="currentColor" strokeWidth="1.4" />
          {/* santa */}
          <circle cx="52" cy="10" r="3.4" />
          <path d="M47 20 c0 -6 2 -8 5 -8 c3 0 5 2 5 8 z" />
          <path d="M49 8 l4 -6 l3 5 z" />
          <circle cx="53" cy="2" r="1.3" />
          {/* reins */}
          <path d="M66 15 L96 17 L124 16" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.8" />
          {/* reindeer ×2 */}
          {[96, 124].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="18" rx="8" ry="3.6" />
              <path d={`M${x + 6} 16 l4 -6 l3 1 l-3 7 z`} />
              <circle cx={x + 11} cy="9" r="2.3" />
              <path d={`M${x + 10} 7 l-2 -5 M${x + 9} 4 l-3 -1 M${x + 12} 7 l2 -5 M${x + 13} 4 l3 -1`} stroke="currentColor" strokeWidth="0.9" fill="none" strokeLinecap="round" />
              <path d={`M${x - 6} 20 l-3 7 M${x - 3} 21 l1 7 M${x + 4} 21 l-2 7 M${x + 7} 20 l4 6`} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

const SANTA_COOLDOWN_MS = 10 * 60 * 1000;

/** The sleigh on Christmas Day — once per Dashboard visit, at most every 10
 *  minutes per person, so it stays a treat rather than a loop. */
export function SantaOnDashboard({ uid, className }: { uid: string; className?: string }) {
  const [fly, setFly] = useState(false);
  useEffect(() => {
    const key = `erp_santa_last_${uid}`;
    let last = 0;
    try { last = Number(localStorage.getItem(key) || 0); } catch {}
    if (Date.now() - last < SANTA_COOLDOWN_MS) return;
    try { localStorage.setItem(key, String(Date.now())); } catch {}
    setFly(true);
  }, [uid]);
  return fly ? <SantaSleigh className={className} onDone={() => setFly(false)} /> : null;
}
