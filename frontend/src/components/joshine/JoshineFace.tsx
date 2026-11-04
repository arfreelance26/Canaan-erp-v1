"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { animate } from "animejs";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import { JOSHINE_SHAPES, type JoshineExpression, type JoshineShape } from "@/lib/joshine";

/**
 * Joshine drawn in a 400 × 400 box: the body shape in the chosen colour, a
 * soft top light and a shaded underside, and the eyes.
 *
 * `lively` brings it to life: the eyes follow the cursor, blink every few
 * seconds (now and then twice) and pop when the expression changes. Skipped
 * under reduced motion. Use it on one or two faces at a time; option tiles
 * stay still.
 */

// Fixed art colours: the eyes stay ink-dark on every body colour and theme.
const INK = "#1b2033";
const SHINE = "#ffffff";

// Big, tall anime-style eyes: vertical ovals with a large catch-light up and
// a small one down, set a little apart so the face reads young and soft.
const L = 146; // left eye centre x
const R = 254; // right eye centre x
const Y = 212; // eyes centre y
const RX = 26; // eye half-width
const RY = 42; // eye half-height

function arc(cx: number, up: boolean) {
  return up ? `M ${cx - 24} ${Y + 12} Q ${cx} ${Y - 22} ${cx + 24} ${Y + 12}` : `M ${cx - 22} ${Y} Q ${cx} ${Y + 20} ${cx + 22} ${Y}`;
}
const stroke = { stroke: INK, strokeWidth: 12, strokeLinecap: "round" as const, fill: "none" };
/** A tall oval eye with its two catch-lights, scaled with the eye. */
function eye(cx: number, rx = RX, ry = RY, dy = 0, extra = false) {
  const k = ry / RY;
  return (
    <>
      <ellipse cx={cx} cy={Y + dy} rx={rx} ry={ry} fill={INK} />
      <ellipse cx={cx + 8 * k} cy={Y + dy - 16 * k} rx={10 * k} ry={13 * k} fill={SHINE} />
      <circle cx={cx - 9 * k} cy={Y + dy + 17 * k} r={5 * k} fill={SHINE} />
      {extra && <circle cx={cx + 12 * k} cy={Y + dy + 6 * k} r={3 * k} fill={SHINE} />}
    </>
  );
}
const heart = (cx: number) => (
  <path
    d={`M ${cx} ${Y + 24} C ${cx - 38} ${Y} ${cx - 28} ${Y - 32} ${cx} ${Y - 15} C ${cx + 28} ${Y - 32} ${cx + 38} ${Y} ${cx} ${Y + 24} Z`}
    fill={INK}
  />
);
const brows = (inner: number, outer: number) =>
  `M ${L - 26} ${Y + outer} L ${L + 22} ${Y + inner} M ${R - 22} ${Y + inner} L ${R + 26} ${Y + outer}`;

const EYES: Record<JoshineExpression, ReactNode> = {
  calm: <>{eye(L)}{eye(R)}</>,
  happy: <><path d={arc(L, true)} {...stroke} /><path d={arc(R, true)} {...stroke} /></>,
  curious: <>{eye(L, 29, 46)}{eye(R, 21, 33, -6)}</>,
  wink: <>{eye(L)}<path d={arc(R, true)} {...stroke} /></>,
  sparkle: <>{eye(L, 28, 45, 0, true)}{eye(R, 28, 45, 0, true)}</>,
  surprised: (
    <>
      <circle cx={L} cy={Y} r={29} fill={INK} /><circle cx={L + 9} cy={Y - 10} r={9} fill={SHINE} />
      <circle cx={R} cy={Y} r={29} fill={INK} /><circle cx={R + 9} cy={Y - 10} r={9} fill={SHINE} />
    </>
  ),
  focused: (
    <>
      <path d={`M ${L - RX} ${Y - 10} H ${L + RX} V ${Y + 2} A ${RX} 32 0 0 1 ${L - RX} ${Y + 2} Z`} fill={INK} />
      <path d={`M ${R - RX} ${Y - 10} H ${R + RX} V ${Y + 2} A ${RX} 32 0 0 1 ${R - RX} ${Y + 2} Z`} fill={INK} />
      <circle cx={L + 9} cy={Y + 4} r={6} fill={SHINE} /><circle cx={R + 9} cy={Y + 4} r={6} fill={SHINE} />
    </>
  ),
  love: <>{heart(L)}{heart(R)}</>,
  sleepy: <><path d={arc(L, false)} {...stroke} /><path d={arc(R, false)} {...stroke} /></>,
  sideeye: (
    <>
      <path d={`M ${L - RX} ${Y - 2} H ${L + RX} A ${RX} 30 0 0 1 ${L - RX} ${Y - 2} Z`} fill={INK} />
      <path d={`M ${R - RX} ${Y - 2} H ${R + RX} A ${RX} 30 0 0 1 ${R - RX} ${Y - 2} Z`} fill={INK} />
      <path d={`M ${L - 25} ${Y - 9} H ${L + 23} M ${R - 23} ${Y - 9} H ${R + 25}`} {...stroke} strokeWidth={9} />
    </>
  ),
  determined: <>{eye(L, 22, 34, 8)}{eye(R, 22, 34, 8)}<path d={brows(-36, -50)} {...stroke} strokeWidth={10} /></>,
  sad: <>{eye(L, 22, 34, 8)}{eye(R, 22, 34, 8)}<path d={brows(-52, -38)} {...stroke} strokeWidth={10} /></>,
  grumpy: (
    <>
      <path d={`M ${L - 21} ${Y + 4} H ${L + 21} M ${R - 21} ${Y + 4} H ${R + 21}`} {...stroke} />
      <path d={brows(-20, -30)} {...stroke} strokeWidth={9} />
    </>
  ),
  dots: <><circle cx={L} cy={Y} r={16} fill={INK} /><circle cx={L + 5} cy={Y - 5} r={5} fill={SHINE} /><circle cx={R} cy={Y} r={16} fill={INK} /><circle cx={R + 5} cy={Y - 5} r={5} fill={SHINE} /></>,
};

// Rosy cheeks, shown while Joshine is being hovered or petted.
const BLUSH = "#ff7a98";

// How far the eyes travel toward the cursor, in viewBox units.
const REACH_X = 20;
const REACH_Y = 12;

type Props = {
  shape: JoshineShape;
  expression: JoshineExpression;
  color: string;
  /** Rendered width and height in px. */
  size: number;
  lively?: boolean;
  /** Draw the body only (shape tiles). */
  bodyOnly?: boolean;
  /** Rosy cheeks under the eyes (fade in and out). */
  blush?: boolean;
  className?: string;
};

export function JoshineFace({ shape, expression, color, size, lively = false, bodyOnly = false, blush = false, className }: Props) {
  const id = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const lookRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);

  // Eyes follow the cursor, eased toward it frame by frame.
  useEffect(() => {
    if (!lively || bodyOnly || prefersReducedMotion()) return;
    const target = { x: 0, y: 0 };
    const now = { x: 0, y: 0 };
    let raf = 0;
    const tick = () => {
      now.x += (target.x - now.x) * 0.18;
      now.y += (target.y - now.y) * 0.18;
      lookRef.current?.setAttribute("transform", `translate(${now.x.toFixed(2)} ${now.y.toFixed(2)})`);
      raf = Math.abs(target.x - now.x) + Math.abs(target.y - now.y) > 0.05 ? requestAnimationFrame(tick) : 0;
    };
    const aim = (x: number, y: number) => {
      target.x = x;
      target.y = y;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      const box = svgRef.current?.getBoundingClientRect();
      if (!box) return;
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height * 0.5);
      const dist = Math.hypot(dx, dy) || 1;
      const pull = Math.min(1, dist / 260);
      aim((dx / dist) * REACH_X * pull, (dy / dist) * REACH_Y * pull);
    };
    const onLeave = () => aim(0, 0);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [lively, bodyOnly]);

  // Blink every 2.5–6 s; one time in four, a double blink.
  useEffect(() => {
    if (!lively || bodyOnly || prefersReducedMotion()) return;
    let timer = 0;
    const blink = () => {
      const eyes = eyesRef.current;
      if (eyes) {
        const twice = Math.random() < 0.25;
        animate(eyes, {
          scaleY: twice ? [1, 0.08, 1, 0.08, 1] : [1, 0.08, 1],
          duration: twice ? 420 : 210,
          ease: "inOutQuad",
        });
      }
      timer = window.setTimeout(blink, 2500 + Math.random() * 3500);
    };
    timer = window.setTimeout(blink, 1200 + Math.random() * 2000);
    return () => window.clearTimeout(timer);
  }, [lively, bodyOnly]);

  // A small pop when the expression changes.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!lively || bodyOnly || !eyesRef.current || prefersReducedMotion()) return;
    animate(eyesRef.current, { scale: [0.6, 1], opacity: [0, 1], duration: 320, ease: MOTION.easeOut });
  }, [expression, lively, bodyOnly]);

  const d = JOSHINE_SHAPES[shape];
  return (
    <svg ref={svgRef} viewBox="0 0 400 400" width={size} height={size} className={className} aria-hidden>
      <defs>
        <radialGradient id={`${id}-light`} cx="34%" cy="26%" r="62%">
          <stop offset="0%" stopColor={SHINE} stopOpacity="0.45" />
          <stop offset="100%" stopColor={SHINE} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-shade`} x1="0" y1="0.35" x2="0.25" y2="1">
          <stop offset="0%" stopColor={INK} stopOpacity="0" />
          <stop offset="100%" stopColor={INK} stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path d={d} fill={color} style={{ transition: "fill 200ms ease-out" }} />
      <path d={d} fill={`url(#${id}-shade)`} />
      <path d={d} fill={`url(#${id}-light)`} />
      {!bodyOnly && (
        <g ref={lookRef}>
          {/* Cheeks sit just outside and below the eyes; they don't blink. */}
          <g style={{ opacity: blush ? 0.55 : 0, transition: "opacity 260ms ease-out" }}>
            <ellipse cx={L - 30} cy={Y + 56} rx={28} ry={15} fill={BLUSH} />
            <ellipse cx={R + 30} cy={Y + 56} rx={28} ry={15} fill={BLUSH} />
          </g>
          <g ref={eyesRef} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
            {EYES[expression]}
          </g>
        </g>
      )}
    </svg>
  );
}
