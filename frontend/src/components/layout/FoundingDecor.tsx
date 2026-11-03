"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Founding Day decorations (see FoundingContext) — on-brand and quiet: a gold
// wave (the logo's waves) along the topbar's bottom edge with a light sweeping
// across it, an "EST. 2015 · N YEARS" mark, and a shine passing over the logo.
// Pointer-events-none; motion is CSS (founding-* in globals.css).

/** Gold wave line along the bottom edge of the parent, with a sweeping light. */
export function GoldWave({ className }: { className?: string }) {
  // One smooth sine across a 1200-wide box, stretched to the bar's width.
  let d = "M0 5";
  for (let x = 0; x <= 1200; x += 10) d += ` L${x} ${(5 + Math.sin(x / 38) * 3).toFixed(2)}`;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 -bottom-[5px] h-[10px] overflow-hidden", className)}>
      <svg viewBox="0 0 1200 10" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="founding-wave" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#c9a227" stopOpacity="0.2" />
            <stop offset="0.15" stopColor="#d4a017" />
            <stop offset="0.5" stopColor="#f3d98b" />
            <stop offset="0.85" stopColor="#d4a017" />
            <stop offset="1" stopColor="#c9a227" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <path d={d} fill="none" stroke="url(#founding-wave)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="founding-sweep absolute top-0 h-full w-40 bg-[radial-gradient(closest-side,rgba(255,244,205,0.95),rgba(243,217,139,0.35)_60%,transparent)]" />
    </div>
  );
}

/** Holds a topbar mark ("EST. 2015 · 12 YEARS", "2027") in the free space
 *  between the breadcrumb and the buttons — in the layout, so it can never
 *  slide under them. Shown only when it fits whole; hidden otherwise (narrow
 *  window, expanded sidebar on a small screen) rather than cut off. */
export function FitMark({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [fits, setFits] = useState(false);
  useEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const check = () => setFits(i.scrollWidth + 16 <= o.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(o);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} aria-hidden className="pointer-events-none mx-3 flex min-w-0 flex-1 items-center justify-center overflow-hidden">
      <span ref={inner} className={cn("whitespace-nowrap transition-opacity duration-300", fits ? "opacity-100" : "opacity-0")}>{children}</span>
    </div>
  );
}

/** "EST. 2015 · 12 YEARS" — put inside <FitMark>. */
export function EstMark({ years }: { years: number }) {
  return (
    <span className="bday-gold-text text-[13px] font-semibold uppercase tracking-[0.32em]">
      Est. 2015 <span className="mx-2 opacity-60">·</span> {years} {years === 1 ? "Year" : "Years"}
    </span>
  );
}

/** A band of light passing across the logo every few seconds — masked to the
 *  logo's own shape, so only the artwork shines, not its box. Place inside a
 *  `relative` wrapper around the logo image. */
export function LogoShine({ src }: { src: string }) {
  return (
    <span
      aria-hidden
      className="founding-shine pointer-events-none absolute inset-0"
      style={{
        WebkitMaskImage: `url(${src})`, maskImage: `url(${src})`,
        WebkitMaskSize: "contain", maskSize: "contain",
        WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
        WebkitMaskPosition: "left center", maskPosition: "left center",
      }}
    />
  );
}

/** Gold "12 / YEARS" badge beside the logo (its own space, not on the artwork). */
export function YearsBadge({ years }: { years: number }) {
  return (
    <span aria-hidden className="pointer-events-none flex shrink-0 flex-col items-center rounded-xl border border-[#d4a017]/60 bg-gradient-to-b from-[#fff8e1]/70 to-transparent px-2 py-1 leading-none dark:from-[#d4a017]/10">
      <span className="bday-gold-text font-serif text-[22px] font-semibold">{years}</span>
      <span className="mt-0.5 text-[7.5px] font-extrabold uppercase tracking-[0.2em] text-[#b8860b] dark:text-[#f3d98b]/85">{years === 1 ? "Year" : "Years"}</span>
    </span>
  );
}
