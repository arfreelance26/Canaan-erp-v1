"use client";

import type { JoshineOutfitKey } from "@/lib/api";

/**
 * What Joshine wears and holds, drawn over her in the same 400 × 400 box as
 * the face (it may reach past the top for a hat). Sits inside her bob/tilt,
 * like the gum, so it moves with her.
 *
 *   glasses  round reading glasses while a form is open (JoshinePet watches for one)
 *   outfit   the day's: a party hat on the person's birthday, a gold crown with
 *            the year count on Founding Day (5 Jan), a Santa hat on 24–25 Dec
 * (The tea-time chai is its own step-by-step piece: JoshineChai.tsx.)
 *
 * Animations live in styles/motion.css (joshine-*) and stop under reduced motion.
 */

// Fixed art colours, like the eyes: the same on every body colour and theme.
const INK = "#1b2033";
const WHITE = "#ffffff";
// The eyes (JoshineFace): left / right centre x, centre y.
const L = 146;
const R = 254;
const Y = 212;

function Glasses({ on }: { on: string }) {
  return (
    <g className={on}>
      {/* lenses: a faint tint, so the eyes still show */}
      <circle cx={L} cy={Y} r={52} fill={WHITE} fillOpacity={0.14} stroke={INK} strokeWidth={9} />
      <circle cx={R} cy={Y} r={52} fill={WHITE} fillOpacity={0.14} stroke={INK} strokeWidth={9} />
      {/* bridge and arms */}
      <path d={`M ${L + 50} ${Y - 10} Q 200 ${Y - 26} ${R - 50} ${Y - 10}`} stroke={INK} strokeWidth={8} fill="none" strokeLinecap="round" />
      <path d={`M ${L - 52} ${Y - 6} L ${L - 84} ${Y - 16}`} stroke={INK} strokeWidth={8} strokeLinecap="round" />
      <path d={`M ${R + 52} ${Y - 6} L ${R + 84} ${Y - 16}`} stroke={INK} strokeWidth={8} strokeLinecap="round" />
      {/* a glint on each lens */}
      <path d={`M ${L - 30} ${Y - 26} q 12 -14 30 -14`} stroke={WHITE} strokeOpacity={0.8} strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d={`M ${R - 30} ${Y - 26} q 12 -14 30 -14`} stroke={WHITE} strokeOpacity={0.8} strokeWidth={6} fill="none" strokeLinecap="round" />
    </g>
  );
}

function SantaHat({ on }: { on: string }) {
  return (
    <g className={on} transform="translate(200 92) rotate(-10)">
      <path d="M -96 30 C -84 -40 -30 -112 58 -126 C 46 -90 70 -40 96 30 Z" fill="#d6283a" stroke="#a51d2c" strokeWidth={5} strokeLinejoin="round" />
      <path d="M -6 -84 C 14 -100 38 -114 58 -126" stroke="#ff6b7a" strokeOpacity={0.5} strokeWidth={8} fill="none" strokeLinecap="round" />
      <rect x={-112} y={16} width={224} height={42} rx={21} fill={WHITE} stroke="#e3e6ee" strokeWidth={4} />
      <circle cx={62} cy={-128} r={24} fill={WHITE} stroke="#e3e6ee" strokeWidth={4} />
    </g>
  );
}

function PartyHat({ on, confetti: withConfetti }: { on: string; confetti: boolean }) {
  const confetti = [["#ff8fc4", -70, -30], ["#ffd23f", 74, -54], ["#5ad1a0", -40, -110], ["#7aa7ff", 52, -118], ["#ff8a3d", 96, -6]] as const;
  return (
    <g className={on} transform="translate(200 96) rotate(8)">
      <path d="M -62 30 L 0 -132 L 62 30 Z" fill="#7a5cff" stroke="#5b40d6" strokeWidth={5} strokeLinejoin="round" />
      <path d="M -40 -26 L 34 -48 M -52 4 L 50 -22 M -22 -82 L 16 -96" stroke="#ffd23f" strokeWidth={10} strokeLinecap="round" />
      <rect x={-72} y={22} width={144} height={18} rx={9} fill="#ffd23f" />
      <circle cx={0} cy={-136} r={16} fill="#ff8fc4" />
      {withConfetti && confetti.map(([c, x, y], i) => (
        <circle key={i} cx={x} cy={y} r={7} fill={c} className="joshine-confetti" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </g>
  );
}

function Crown({ years, on }: { years: number | null; on: string }) {
  return (
    <g className={on} transform="translate(200 84)">
      <path d="M -88 34 L -92 -34 L -48 0 L 0 -58 L 48 0 L 92 -34 L 88 34 Z" fill="#f5c542" stroke="#c79a1c" strokeWidth={6} strokeLinejoin="round" />
      <rect x={-92} y={16} width={184} height={34} rx={8} fill="#e8b52a" stroke="#c79a1c" strokeWidth={5} />
      <circle cx={-92} cy={-38} r={10} fill="#ff6b7a" />
      <circle cx={0} cy={-62} r={11} fill="#5ad1a0" />
      <circle cx={92} cy={-38} r={10} fill="#7aa7ff" />
      {years != null && (
        <text x={0} y={42} textAnchor="middle" fontSize={30} fontWeight={800} fill="#7a5410" fontFamily="system-ui, sans-serif">{years}</text>
      )}
      <path d="M -60 -6 L -40 -24" stroke={WHITE} strokeOpacity={0.6} strokeWidth={6} strokeLinecap="round" />
    </g>
  );
}

export function JoshineOutfit({ size, glasses, outfit, foundingYears, gentle = false }: {
  size: number;
  glasses: boolean;
  outfit: JoshineOutfitKey | null;
  foundingYears: number | null;
  /** Calm mode: everything fades on (no bounce) and the birthday hat has no confetti. */
  gentle?: boolean;
}) {
  if (!glasses && !outfit) return null;
  const hatOn = gentle ? "joshine-fade-on" : "joshine-hat-on";
  return (
    <svg viewBox="0 0 400 400" width={size} height={size} aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      {outfit === "christmas" && <SantaHat on={hatOn} />}
      {outfit === "birthday" && <PartyHat on={hatOn} confetti={!gentle} />}
      {outfit === "founding" && <Crown years={foundingYears} on={hatOn} />}
      {glasses && <Glasses on={gentle ? "joshine-fade-on" : "joshine-glasses-on"} />}
    </svg>
  );
}
