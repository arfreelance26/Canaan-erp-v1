"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Party decorations for a staff birthday (see BirthdayContext). All of it is
// pointer-events-none decoration; motion is CSS (bday-* keyframes in
// globals.css) and stops under prefers-reduced-motion.

// ── Bunting ────────────────────────────────────────────────────────────────
// Drawn in PAGE coordinates (the strip's own left edge is measured), so the
// sidebar's and the topbar's strings line up into one garland across the
// screen, and the breeze (animation delay by page x) travels across both.

const FLAG_FILLS = [
  { top: "#f2c64e", tip: "#c08a0e" },   // gold
  { top: "#f7a65a", tip: "#d66f12" },   // orange
  { top: "#7b93f8", tip: "#3451d1" },   // blue
];

type StringSpec = {
  span: number;      // distance between pins
  phase: number;     // pin offset (page px)
  pinY: number;      // pin height
  sag: number;       // drop at the middle of a loop
  gap: number;       // distance between flags
  flagW: number;
  flagH: number;
  opacity: number;
};

const STRINGS: StringSpec[] = [
  { span: 300, phase: 0, pinY: 2, sag: 16, gap: 36, flagW: 18, flagH: 19, opacity: 1 },
];

function stringY(s: StringSpec, x: number) {
  const t = (((x - s.phase) % s.span) + s.span) % s.span / s.span;
  return { y: s.pinY + s.sag * 4 * t * (1 - t), slope: (s.sag * 4 * (1 - 2 * t)) / s.span };
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

/** Draped triangle pennants hanging from the top edge of the parent. */
export function Bunting({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const { ref, left, width } = usePageStrip<HTMLDivElement>();
  const H = 40;

  return (
    <div ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 overflow-hidden", className)} style={{ height: H }}>
      {width > 0 && (
        <svg width={width} height={H} viewBox={`${left} 0 ${width} ${H}`} className="block">
          <defs>
            {FLAG_FILLS.map((f, i) => (
              <linearGradient key={i} id={`${uid}-f${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={f.top} />
                <stop offset="1" stopColor={f.tip} />
              </linearGradient>
            ))}
          </defs>
          {STRINGS.map((s, si) => {
            // String: one smooth parabola per loop, drawn across the visible range.
            const first = Math.floor((left - s.phase) / s.span) * s.span + s.phase;
            let d = "";
            for (let a = first; a < left + width; a += s.span) {
              d += `M${a} ${s.pinY} Q${a + s.span / 2} ${s.pinY + s.sag * 2} ${a + s.span} ${s.pinY} `;
            }
            const flags: number[] = [];
            const startFlag = Math.floor((left - s.phase) / s.gap) * s.gap + s.phase + s.gap / 2;
            for (let x = startFlag; x < left + width + s.gap; x += s.gap) {
              const t = (((x - s.phase) % s.span) + s.span) % s.span;
              if (t > 8 && t < s.span - 8) flags.push(x);   // keep pins clear
            }
            return (
              <g key={si} opacity={s.opacity}>
                <path d={d} fill="none" className="stroke-[#b8892f] dark:stroke-[#e2bd6c]" strokeWidth={1.2} strokeLinecap="round" />
                {flags.map((x) => {
                  const { y, slope } = stringY(s, x);
                  const angle = (Math.atan(slope) * 180) / Math.PI;
                  const fi = Math.abs(Math.round(x / s.gap)) % FLAG_FILLS.length;
                  const w = s.flagW / 2;
                  return (
                    <g key={x} transform={`rotate(${angle.toFixed(2)} ${x} ${y.toFixed(2)})`}>
                      <g className="bday-flag" style={{ animationDelay: `${-(6 - ((((x / 700) % 6) + 6) % 6))}s` }}>
                        {/* own soft shadow — a filter on the whole SVG would be re-run every animation frame */}
                        <path d={`M${x - w + 0.6} ${y + 1.4} L${x + w + 0.6} ${y + 1.4} L${x + 0.6} ${y + s.flagH + 1.6} Z`} className="fill-[rgba(15,23,42,0.14)] dark:fill-[rgba(0,0,0,0.45)]" />
                        <path d={`M${x - w} ${y} L${x + w} ${y} L${x} ${y + s.flagH} Z`} fill={`url(#${uid}-f${fi})`} />
                        {(
                          <path d={`M${x - w + 3} ${y + 2.4} L${x + w - 3} ${y + 2.4}`} stroke="rgba(255,255,255,0.55)" strokeWidth={0.8} strokeDasharray="1.6 1.6" />
                        )}
                      </g>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ── String lights ──────────────────────────────────────────────────────────
// Warm bulbs on a thin wire drooping in two loops under the sidebar header.
// Wind: every gust (same 6s rhythm as the flags, travelling left → right)
// lifts each loop a little and swings its bulbs like pendulums. Character:
// a mix of teardrop and globe bulbs on uneven leads with a resting tilt, a
// glowing filament, a glass highlight, the odd flicker, and a warm pool of
// light below.

const GUST_S = 6;
/** Same phase formula as the flags: negative delays rising with page x. */
const gustDelay = (x: number) => `${-(GUST_S - ((((x / 700) % GUST_S) + GUST_S) % GUST_S))}s`;

type Bulb = { x: number; y: number; lead: number; tilt: number; globe: boolean; gold: boolean; depth: number };

const LIGHTS_W = 310, LIGHTS_H = 44, PIN_Y = 2, SAG = 13;

// Fixed "random" so every render (and every user) gets the same string.
const BULB_LAYOUT = [
  { t: 0.18, lead: 3, tilt: -3, globe: false },
  { t: 0.39, lead: 5, tilt: 2, globe: true },
  { t: 0.61, lead: 2, tilt: -1, globe: false },
  { t: 0.83, lead: 4, tilt: 3, globe: true },
];

function lightsBulbs(): { loops: number[]; span: number; bulbs: Bulb[] } {
  const span = LIGHTS_W / 2;
  const loops = [0, span];
  const bulbs: Bulb[] = [];
  loops.forEach((a, li) => BULB_LAYOUT.forEach((b, bi) => {
    const t = li ? 1 - b.t : b.t;            // mirror the second loop so it isn't a copy
    const depth = SAG * 4 * t * (1 - t);
    bulbs.push({
      x: a + span * t, y: PIN_Y + depth, depth,
      lead: li ? BULB_LAYOUT[(bi + 2) % 4].lead : b.lead,
      tilt: li ? -b.tilt : b.tilt,
      globe: li ? !b.globe : b.globe,
      gold: (li * 4 + bi) % 2 === 1,
    });
  }));
  return { loops, span, bulbs };
}

const LIGHTS = lightsBulbs();

type Tone = "warm" | "gold" | "red" | "green" | "blue";
const XMAS_TONES: Tone[] = ["warm", "red", "green", "gold"];
// Founding Day — the brand's navy and gold, with warm white between.
const BRAND_TONES: Tone[] = ["gold", "blue", "warm", "blue"];
const GLOW: Record<Tone, string> = { warm: "#ffe7a3", gold: "#ffd772", red: "#ff7b7b", green: "#7fe0a3", blue: "#8fa8ff" };
const GLASS: Record<Tone, [string, string]> = {
  warm: ["#fffaf0", "#ffd98a"], gold: ["#fde7aa", "#e3a52f"],
  red: ["#ffb3a8", "#d92b2b"], green: ["#b8f0c8", "#1f9a52"], blue: ["#c3d0ff", "#2c46b8"],
};

// Christmas baubles hang between the bulbs (positions along each loop).
const BAUBLES = [{ t: 0.29, red: true }, { t: 0.72, red: false }];

/** In-flow strip under the sidebar header — expanded sidebar only.
 *  "christmas" swaps in red/green/gold/white bulbs plus swinging baubles. */
/** `intense` (Christmas Day): bigger glows twinkling faster and brighter. */
export function StringLights({ variant = "birthday", intense = false }: { variant?: "birthday" | "christmas" | "brand"; intense?: boolean }) {
  const xmas = variant === "christmas";
  const uid = useId().replace(/:/g, "");
  const [flicker, setFlicker] = useState<number | null>(null);

  // The odd flicker: every ~10s one bulb stutters, like a real old string.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let off: number | undefined;
    const id = window.setInterval(() => {
      setFlicker(Math.floor(Math.random() * LIGHTS.bulbs.length));
      off = window.setTimeout(() => setFlicker(null), 700);
    }, 9000 + Math.random() * 3000);
    return () => { window.clearInterval(id); window.clearTimeout(off); };
  }, []);

  const { loops, span, bulbs } = LIGHTS;
  return (
    <div aria-hidden className={cn("pointer-events-none relative shrink-0 overflow-hidden", intense && "bday-lights-intense")} style={{ height: LIGHTS_H }}>
      <svg width={LIGHTS_W} height={LIGHTS_H} className="block overflow-visible">
        <defs>
          {(Object.keys(GLOW) as Tone[]).map((t) => (
            <radialGradient key={`g-${t}`} id={`${uid}-glow-${t}`}>
              <stop offset="0" stopColor={GLOW[t]} stopOpacity="0.95" />
              <stop offset="1" stopColor={GLOW[t]} stopOpacity="0" />
            </radialGradient>
          ))}
          {(Object.keys(GLASS) as Tone[]).map((t) => (
            <linearGradient key={`l-${t}`} id={`${uid}-${t}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={GLASS[t][0]} />
              <stop offset="1" stopColor={GLASS[t][1]} />
            </linearGradient>
          ))}
          <radialGradient id={`${uid}-bauble-red`} cx="35%" cy="30%">
            <stop offset="0" stopColor="#ff8a80" />
            <stop offset="0.55" stopColor="#c62828" />
            <stop offset="1" stopColor="#7f1010" />
          </radialGradient>
          <radialGradient id={`${uid}-bauble-gold`} cx="35%" cy="30%">
            <stop offset="0" stopColor="#fff1c4" />
            <stop offset="0.55" stopColor="#d4a017" />
            <stop offset="1" stopColor="#8a6610" />
          </radialGradient>
          <radialGradient id={`${uid}-pool`}>
            <stop offset="0" stopColor="#ffcf6b" stopOpacity="1" />
            <stop offset="1" stopColor="#ffcf6b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* warm light pooling under each loop */}
        {loops.map((a) => (
          <ellipse key={`pool-${a}`} cx={a + span / 2} cy={LIGHTS_H - 8} rx={span * 0.42} ry={9}
            fill={`url(#${uid}-pool)`} className="bday-pool opacity-[0.1] dark:opacity-[0.3]" />
        ))}

        {/* wire — each loop lifts with the gust (scaled toward its pins) */}
        {loops.map((a) => (
          <path key={`wire-${a}`} d={`M${a} ${PIN_Y} Q${a + span / 2} ${PIN_Y + SAG * 2} ${a + span} ${PIN_Y}`} fill="none"
            className="bday-wire stroke-[#6b5a3a] dark:stroke-[#9c8656]" strokeWidth={0.9}
            style={{ transformOrigin: `${a}px ${PIN_Y}px`, animationDelay: gustDelay(a + span / 2) }} />
        ))}

        {bulbs.map((b, i) => {
          const top = b.y + b.lead;                // socket top
          const glassTop = top + 3;
          const cy = b.globe ? glassTop + 4.4 : glassTop + 5.5;
          const loopMid = b.x < span ? span / 2 : span * 1.5;
          const tone: Tone = xmas ? XMAS_TONES[i % XMAS_TONES.length]
            : variant === "brand" ? BRAND_TONES[i % BRAND_TONES.length]
            : b.gold ? "gold" : "warm";
          return (
            // rides the wire's lift…
            <g key={i} className="bday-bulb-lift" style={{ ["--lift" as string]: `${b.depth}px`, animationDelay: gustDelay(loopMid) }}>
              {/* …and swings from where it hangs */}
              <g className="bday-swing" style={{ transformOrigin: `${b.x}px ${b.y}px`, ["--tilt" as string]: `${b.tilt}deg`, animationDelay: gustDelay(b.x) }}>
                <g className={flicker === i ? "bday-flicker" : undefined}>
                  <circle cx={b.x} cy={cy} r={intense ? 13 : 10} fill={`url(#${uid}-glow-${tone})`} className="bday-glow" style={{ animationDelay: `${(i * 0.73) % 3.6}s` }} />
                  <line x1={b.x} y1={b.y} x2={b.x} y2={top} className="stroke-[#6b5a3a] dark:stroke-[#9c8656]" strokeWidth={0.8} />
                  <rect x={b.x - 1.7} y={top} width={3.4} height={3.2} rx={0.6} className="fill-[#4a3d26] dark:fill-[#7d6a44]" />
                  {b.globe ? (
                    <circle cx={b.x} cy={cy} r={4.3} fill={`url(#${uid}-${tone})`} className="stroke-[#d9a441]/70 dark:stroke-transparent" strokeWidth={0.5} />
                  ) : (
                    <path d={`M${b.x} ${glassTop} C${b.x + 3.8} ${glassTop + 2} ${b.x + 3.6} ${glassTop + 8} ${b.x} ${glassTop + 9.6} C${b.x - 3.6} ${glassTop + 8} ${b.x - 3.8} ${glassTop + 2} ${b.x} ${glassTop} Z`}
                      fill={`url(#${uid}-${tone})`} className="stroke-[#d9a441]/70 dark:stroke-transparent" strokeWidth={0.5} />
                  )}
                  {/* filament + glass highlight */}
                  <path d={`M${b.x - 1.3} ${cy + 0.6} L${b.x - 0.4} ${cy - 0.8} L${b.x + 0.4} ${cy + 0.6} L${b.x + 1.3} ${cy - 0.8}`}
                    fill="none" stroke="#ff9d2e" strokeWidth={0.6} strokeLinecap="round" strokeLinejoin="round" />
                  <ellipse cx={b.x - 1.6} cy={cy - 1.8} rx={0.8} ry={1.4} fill="#ffffff" opacity={0.75} />
                </g>
              </g>
            </g>
          );
        })}

        {xmas && loops.flatMap((a, li) => BAUBLES.map((bb, bi) => {
          const t = li ? 1 - bb.t : bb.t;
          const depth = SAG * 4 * t * (1 - t);
          const x = a + span * t, y = PIN_Y + depth;
          const red = li ? !bb.red : bb.red;
          const cy = y + 9.5;
          return (
            <g key={`bauble-${li}-${bi}`} className="bday-bulb-lift" style={{ ["--lift" as string]: `${depth}px`, animationDelay: gustDelay(a + span / 2) }}>
              <g className="bday-swing" style={{ transformOrigin: `${x}px ${y}px`, ["--tilt" as string]: `${li ? 2 : -2}deg`, animationDelay: gustDelay(x) }}>
                <line x1={x} y1={y} x2={x} y2={cy - 6} stroke="#c9a227" strokeWidth={0.6} />
                <rect x={x - 1.6} y={cy - 6.4} width={3.2} height={2} rx={0.5} fill="#d4a017" />
                <circle cx={x} cy={cy} r={4.8} fill={`url(#${uid}-bauble-${red ? "red" : "gold"})`} />
                <ellipse cx={x - 1.7} cy={cy - 1.8} rx={1} ry={1.6} fill="#ffffff" opacity={0.6} />
              </g>
            </g>
          );
        }))}
      </svg>
    </div>
  );
}

/** 🥳 on the birthday person's avatar. */
export function BirthdayBadge({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute -right-1.5 -top-1.5 text-[14px] leading-none drop-shadow", className)}>
      🥳
    </span>
  );
}

// ── Rising balloons ─────────────────────────────────────────────────────────
// The birthday counterpart of the December snow: a few small balloons drifting
// up through the parent (sidebar / topbar), swaying on their strings. Canvas,
// moved by elapsed time (no stutter on a dropped frame), off under reduced motion.

const BALLOON_COLORS: [string, string, string][] = [
  // highlight, body, shade
  ["#fbe39a", "#e0a91b", "#a87a0c"],   // gold
  ["#ffc28f", "#f08a24", "#b85d0c"],   // orange
  ["#b3c2ff", "#4c6ef5", "#2c46b8"],   // blue
];

type Balloon = { x: number; y: number; r: number; vy: number; phase: number; sway: number; c: number };

export function Balloons({ count = 8, className }: { count?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    let balloons: Balloon[] = [];
    const resize = () => {
      const oldW = w;
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (oldW > 0 && w > 0 && oldW !== w) for (const b of balloons) b.x *= w / oldW;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const spawn = (anywhere: boolean): Balloon => {
      const r = 4.5 + Math.random() * 3.5;
      return {
        x: 8 + Math.random() * Math.max(w - 16, 1),
        y: anywhere ? Math.random() * h : h + r * 4 + Math.random() * 40,
        r, vy: 0.18 + Math.random() * 0.22,
        phase: Math.random() * Math.PI * 2, sway: 0.25 + Math.random() * 0.35,
        c: Math.floor(Math.random() * BALLOON_COLORS.length),
      };
    };
    balloons = Array.from({ length: count }, () => spawn(true));

    const draw = (b: Balloon) => {
      const [hi, body, shade] = BALLOON_COLORS[b.c];
      const tilt = Math.sin(b.phase) * 0.12;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(tilt);
      // string — a lazy S that trails below and swings opposite the tilt
      ctx.strokeStyle = "rgba(140,140,160,0.55)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(0, b.r * 1.2 + 1.5);
      ctx.bezierCurveTo(-b.r * 0.6, b.r * 2.2, b.r * 0.6, b.r * 3, -tilt * 20, b.r * 4.2);
      ctx.stroke();
      // knot
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.moveTo(0, b.r * 1.15);
      ctx.lineTo(-1.6, b.r * 1.2 + 2);
      ctx.lineTo(1.6, b.r * 1.2 + 2);
      ctx.closePath();
      ctx.fill();
      // body
      const g = ctx.createRadialGradient(-b.r * 0.35, -b.r * 0.45, b.r * 0.15, 0, 0, b.r * 1.3);
      g.addColorStop(0, hi);
      g.addColorStop(0.55, body);
      g.addColorStop(1, shade);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, b.r, b.r * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // shine
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.ellipse(-b.r * 0.38, -b.r * 0.45, b.r * 0.18, b.r * 0.32, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const k = Math.min(now - last, 100) / 16.667;
      last = now;
      if (document.hidden) return;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < balloons.length; i++) {
        const b = balloons[i];
        b.y -= b.vy * k;
        b.phase += 0.02 * k;
        b.x += Math.sin(b.phase) * b.sway * 0.4 * k;
        if (b.y + b.r * 5 < 0) balloons[i] = spawn(false);
        draw(balloons[i]);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [count]);
  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 h-full w-full [will-change:transform]", className)} />;
}
