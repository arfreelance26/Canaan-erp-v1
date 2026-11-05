"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { RiCupLine } from "@remixicon/react";
import type { Greeting } from "@/lib/greetings";
import { cx } from "@/utils/cx";

/** How long the thought stays before it sinks back into Joshine. */
export const GREETING_MS = 8000;
/** Tea time stays a little longer. */
const TEA_MS = 10000;
/** How long the sinking-back takes before the bubble is gone. */
const LEAVE_MS = 520;

type Props = {
  greeting: Greeting;
  /** The first name, tinted in Joshine's colour inside the line. */
  name: string;
  /** Joshine's body colour: the thought is tinted with it. */
  color: string;
  petSize: number;
  /** Tucked away, only the top of Joshine shows; the thought rises from there. */
  tucked: boolean;
  onDone: () => void;
};

// Joshine sits at right-5 (20px) / bottom-4 (16px), `petSize` square.
const PET_RIGHT = 20;
const PET_BOTTOM = 16;

/**
 * Joshine's greeting, as a thought: three little bubbles rise from its head,
 * a soft cloud grows out of the last one, and the words appear inside one by
 * one, as if Joshine is saying them. After 8 seconds (hovering holds it) it
 * all sinks back into Joshine. Click to let it go early.
 *
 * The cloud and the rising bubbles are one shape under a shared drop shadow,
 * so the puffs join without seams; everything is a light tint of the colour
 * the person picked for Joshine, over the theme's own background.
 */
export function JoshineGreeting({ greeting, name, color, petSize, tucked, onDone }: Props) {
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);

  const leave = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onDone, LEAVE_MS);
  };
  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  });

  // The 8 seconds start once the thought has formed; hovering pauses them.
  const remaining = useRef((greeting.kind === "tea" ? TEA_MS : GREETING_MS) + 900);
  useEffect(() => {
    if (held || leaving) return;
    const started = Date.now();
    const t = window.setTimeout(() => leaveRef.current(), remaining.current);
    return () => {
      window.clearTimeout(t);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [held, leaving]);

  // Where Joshine's head is, and the path the thought rises along.
  const head = PET_BOTTOM + (tucked ? Math.round(petSize * 0.42) : petSize);
  const dots = [
    { size: 7, right: PET_RIGHT + petSize * 0.58, bottom: head + 2 },
    { size: 11, right: PET_RIGHT + petSize * 0.72, bottom: head + 13 },
    { size: 15, right: PET_RIGHT + petSize * 0.88, bottom: head + 28 },
  ];
  const cloudRight = PET_RIGHT + petSize * 0.62;
  const cloudBottom = head + 40;

  // A clear tint of Joshine's colour (about a quarter) over the theme's
  // surface, so the thought stands apart from the page in light and dark
  // mode; the name a deeper mix that stays readable on it.
  const fill = `color-mix(in oklab, var(--color-background-primary-default) 74%, ${color})`;
  const nameColor = `color-mix(in oklab, ${color} 50%, var(--color-text-primary))`;
  // One outline and shadow around the whole shape (cloud, puffs and the
  // rising bubbles together): a thin edge in Joshine's colour, then depth.
  const shadow: CSSProperties = {
    filter: [
      `drop-shadow(0 0 0.6px color-mix(in oklab, ${color} 85%, var(--color-text-primary)))`,
      `drop-shadow(0 0 0.6px color-mix(in oklab, ${color} 85%, var(--color-text-primary)))`,
      "drop-shadow(0 12px 24px color-mix(in srgb, var(--color-scrim) 28%, transparent))",
      "drop-shadow(0 2px 4px color-mix(in srgb, var(--color-scrim) 18%, transparent))",
    ].join(" "),
  };

  // The line, word by word; the first name gets Joshine's colour.
  const words = greeting.text.split(" ");
  // Each word of the name they're called by ("Jeba Sam" is two).
  const nameWords = new Set(name.trim().split(/\s+/).filter(Boolean));
  const special = greeting.kind === "birthday" || greeting.kind === "anniversary" || greeting.kind === "festival";
  const sparkles = special
    ? [
        { x: "-6%", y: "18%", s: 12, d: 650 },
        { x: "88%", y: "4%", s: 14, d: 780 },
        { x: "30%", y: "-14%", s: 10, d: 900 },
        { x: "102%", y: "46%", s: 9, d: 1020 },
      ]
    : greeting.kind === "rare"
      ? [{ x: "8%", y: "6%", s: 12, d: 700 }]
      : [];

  return (
    <>
      {/* The little bubbles rising from Joshine's head. */}
      <div aria-hidden className="pointer-events-none fixed bottom-0 right-0 z-pet" style={{ width: cloudRight + 40, height: cloudBottom + 20, ...shadow }}>
        {dots.map((d, i) => (
          <span
            key={i}
            className={cx("thought-dot absolute rounded-full", leaving && "thought-dot-leave")}
            style={{
              width: d.size, height: d.size, right: d.right, bottom: d.bottom, backgroundColor: fill,
              animationDelay: leaving ? `${(2 - i) * 70}ms` : `${i * 120}ms`,
            }}
          />
        ))}
      </div>

      {/* The thought itself. */}
      <div role="status" aria-live="polite" className="fixed z-pet" style={{ right: cloudRight, bottom: cloudBottom, ...shadow }}>
        <button
          type="button"
          onClick={leave}
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
          aria-label={`${greeting.text} (click to close)`}
          className={cx(
            "thought-cloud relative block origin-bottom-right rounded-[26px] text-start outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            leaving && "thought-cloud-leave",
          )}
          style={{ maxWidth: `min(300px, calc(100vw - ${Math.round(cloudRight) + 20}px))` }}
        >
          {/* Puffs around the edge make it a cloud: same fill, one shared shadow. */}
          <span aria-hidden className="absolute -top-3 left-5 size-10 rounded-full" style={{ backgroundColor: fill }} />
          <span aria-hidden className="absolute -top-4 left-[42%] size-12 rounded-full" style={{ backgroundColor: fill }} />
          <span aria-hidden className="absolute -top-2 right-6 size-9 rounded-full" style={{ backgroundColor: fill }} />
          <span aria-hidden className="absolute -left-2.5 top-1/2 size-9 -translate-y-1/2 rounded-full" style={{ backgroundColor: fill }} />
          <span aria-hidden className="absolute -bottom-2 left-[30%] size-8 rounded-full" style={{ backgroundColor: fill }} />

          <span className={cx("relative block rounded-[26px] px-5 pb-3.5 pt-4", greeting.kind === "tea" && "flex items-end gap-3")} style={{ backgroundColor: fill }}>
            {/* Tea time: a cup with steam curling up from it. */}
            {greeting.kind === "tea" && (
              <span aria-hidden className="tea-cup relative mb-0.5 shrink-0" style={{ color: nameColor }}>
                <span className="tea-steam absolute -top-3 left-[30%] h-3 w-1 rounded-full" style={{ backgroundColor: nameColor }} />
                <span className="tea-steam tea-steam-2 absolute -top-3.5 left-[55%] h-3 w-1 rounded-full" style={{ backgroundColor: nameColor }} />
                <RiCupLine className="size-7" />
              </span>
            )}
            <span className="block text-title-3-semibold tracking-tight text-text-primary [text-wrap:balance]">
              {words.map((w, i) => {
                const bare = w.replace(/[.,?!]+$/, "");
                const isName = nameWords.has(bare);
                return (
                  <Fragment key={i}>
                    <span className="thought-word inline-block" style={{ animationDelay: `${620 + i * 70}ms` }}>
                      {isName ? (
                        <>
                          <span style={{ color: nameColor }}>{bare}</span>
                          {w.slice(bare.length)}
                        </>
                      ) : (
                        w
                      )}
                    </span>
                    {/* A real space between words, so long lines wrap. */}
                    {i < words.length - 1 && " "}
                  </Fragment>
                );
              })}
            </span>
          </span>
        </button>
      </div>

      {/* Special days: a few sparkles around Joshine as the thought forms. */}
      {sparkles.length > 0 && !leaving && (
        <div aria-hidden className="pointer-events-none fixed z-pet" style={{ right: PET_RIGHT, bottom: PET_BOTTOM, width: petSize, height: head - PET_BOTTOM + 24 }}>
          {sparkles.map((p, i) => (
            <svg
              key={i}
              viewBox="0 0 24 24"
              className="thought-sparkle absolute text-gold-400"
              style={{ left: p.x, top: p.y, width: p.s, height: p.s, animationDelay: `${p.d}ms` }}
            >
              <path fill="currentColor" d="M12 0c.6 5.6 2.9 9.6 12 12-9.1 2.4-11.4 6.4-12 12-.6-5.6-2.9-9.6-12-12C9.1 9.6 11.4 5.6 12 0Z" />
            </svg>
          ))}
        </div>
      )}
    </>
  );
}
