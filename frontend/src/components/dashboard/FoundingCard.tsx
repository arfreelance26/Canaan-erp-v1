"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useFounding } from "@/context/FoundingContext";
import { useAuth } from "@/context/AuthContext";
import { fireConfetti, fireFireworks } from "@/lib/confetti";

const closedKey = (uid: string, date: string) => `erp_founding_card_closed_${uid}_${date}`;
const poppedKey = (uid: string, date: string) => `erp_founding_card_popped_${uid}_${date}`;
const BRAND_CONFETTI = ["#1b2b5e", "#2b3f9f", "#d4a017", "#f3d98b", "#ffffff"];

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string) {
  try { localStorage.setItem(key, "1"); } catch {}
}

/** Counts 0 → `to` with an ease-out when it first appears (instant under reduced motion). */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(to); return; }
    const start = performance.now(), dur = 1600;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n.toLocaleString("en-IN")}</>;
}

/** Gold laurel wreath (leaves along an arc around the number, kept clear of it). */
const LAUREL_R = 40, LAUREL_C = { x: 48, y: 50 };
const LAUREL_ARC = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: LAUREL_C.x + LAUREL_R * Math.cos(a), y: LAUREL_C.y + LAUREL_R * Math.sin(a) };
};
const LAUREL_LEAVES = Array.from({ length: 8 }, (_, i) => 108 + i * 18);   // bottom-left → top-left

function Laurel({ years }: { years: number }) {
  const from = LAUREL_ARC(LAUREL_LEAVES[0] - 6), to = LAUREL_ARC(LAUREL_LEAVES[LAUREL_LEAVES.length - 1]);
  return (
    <div className="relative flex h-[96px] w-[96px] shrink-0 items-center justify-center">
      <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="founding-leaf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbe9b0" /><stop offset="1" stopColor="#b8860b" />
          </linearGradient>
        </defs>
        {[0, 1].map((mirror) => (
          <g key={mirror} transform={mirror ? "translate(96 0) scale(-1 1)" : undefined}>
            <path d={`M${from.x.toFixed(1)} ${from.y.toFixed(1)} A${LAUREL_R} ${LAUREL_R} 0 0 1 ${to.x.toFixed(1)} ${to.y.toFixed(1)}`}
              fill="none" stroke="#c9a227" strokeWidth="1.3" strokeLinecap="round" />
            {LAUREL_LEAVES.map((deg) => {
              const { x, y } = LAUREL_ARC(deg);
              // tangent to the arc, tipped a little outward
              const rot = deg + 90 + 28;
              return <ellipse key={deg} cx={x} cy={y} rx="2.6" ry="6.4" fill="url(#founding-leaf)" transform={`rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`} />;
            })}
          </g>
        ))}
      </svg>
      <div className="relative text-center leading-none">
        <div className="bday-gold-text font-serif text-[30px] font-semibold">{years}</div>
        <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.22em] text-[rgba(243,217,139,0.85)]">Years</div>
      </div>
    </div>
  );
}

/** Everyone's Dashboard on 5 January — the company's anniversary, with its
 *  running totals. Gold + navy confetti once per person (fireworks on every
 *  5th year); closing it keeps it closed for the rest of the day. */
export function FoundingCard() {
  const { decorated, years, ordinal, milestone, date, stats, message, signature } = useFounding();
  const { user } = useAuth();
  const uid = String(user?.id ?? user?.name ?? "");
  const [closed, setClosed] = useState(true);   // decided after mount (localStorage)

  useEffect(() => {
    if (!decorated || !date) return;
    const isClosed = readFlag(closedKey(uid, date));
    setClosed(isClosed);
    if (!isClosed && !readFlag(poppedKey(uid, date))) {
      writeFlag(poppedKey(uid, date));
      const t = window.setTimeout(() => (milestone ? fireFireworks(12) : fireConfetti({ x: 0.5, y: 0.25 }, 200, BRAND_CONFETTI)), 500);
      return () => window.clearTimeout(t);
    }
  }, [decorated, date, uid, milestone]);

  if (!decorated || closed || years <= 0) return null;

  return (
    <section className="relative mb-6 overflow-hidden rounded-[20px] px-7 py-6 shadow-[0_18px_40px_-18px_rgba(13,22,51,0.55)] [background:radial-gradient(120%_140%_at_0%_0%,#23356f_0%,#15224a_45%,#0d1633_100%)]">
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[20px] p-px [background:linear-gradient(120deg,rgba(243,217,139,0),rgba(243,217,139,0.75),rgba(201,162,39,0.15)_60%,rgba(243,217,139,0.6))] [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)]" />
      <span aria-hidden className="bday-card-shine pointer-events-none absolute -top-1/2 h-[200%] w-28 rotate-[18deg] bg-gradient-to-r from-transparent via-[rgba(255,240,200,0.12)] to-transparent" />

      <div className="relative flex flex-wrap items-center gap-6">
        <Laurel years={years} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/companylogo-dark.png" alt="Canaan Global" className="h-9 w-auto object-contain" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[rgba(243,217,139,0.75)]">
              {ordinal} Anniversary{milestone ? " · Milestone" : ""}
            </p>
          </div>
          <h2 className="bday-gold-text mt-2 font-serif text-[30px] leading-tight sm:text-[34px]">
            {years} {years === 1 ? "Year" : "Years"} of Canaan Global
          </h2>
          <p className="mt-1 text-xs tracking-[0.06em] text-[rgba(226,232,245,0.6)]">Since 5 January 2015</p>
          <p className="mt-2 text-sm text-[rgba(226,232,245,0.85)]">{message || "Thank you for being part of the journey."}</p>
          <p className="mt-2.5 text-xs tracking-[0.04em] text-[rgba(243,217,139,0.7)]">{signature || "— Team Canaan Global"}</p>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { v: stats.tripsCompleted, l: "Trips completed" },
              { v: stats.trucks, l: "Trucks on the road" },
              { v: stats.customers, l: "Customers served" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-[rgba(243,217,139,0.22)] bg-white/[0.04] px-3 py-2.5 text-center sm:px-4">
                <div className="bday-gold-text text-[22px] font-bold tabular-nums leading-none"><CountUp to={s.v} /></div>
                <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgba(226,232,245,0.6)]">{s.l}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="Close anniversary card"
        onClick={() => { writeFlag(closedKey(uid, date)); setClosed(true); }}
        className="absolute right-4 top-3.5 rounded-full p-1 text-[rgba(226,232,245,0.45)] transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}
