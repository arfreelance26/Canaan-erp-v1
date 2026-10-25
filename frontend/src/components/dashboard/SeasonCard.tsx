"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, TreePine, X } from "lucide-react";
import { useSeason } from "@/context/SeasonContext";
import { useAuth } from "@/context/AuthContext";
import { fireConfetti, fireFireworks, fireSnow } from "@/lib/confetti";

const closedKey = (uid: string, kind: string, date: string) => `erp_season_card_closed_${uid}_${kind}_${date}`;
const poppedKey = (uid: string, kind: string, date: string) => `erp_season_card_popped_${uid}_${kind}_${date}`;

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string) {
  try { localStorage.setItem(key, "1"); } catch {}
}

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** Milliseconds until the next midnight in India. */
const msToIstMidnight = () => DAY_MS - ((Date.now() + IST_OFFSET_MS) % DAY_MS);

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** New Year's Eve: a live countdown to midnight (IST) on the card. No
 *  midnight show — hardly anyone is online then; the fireworks wait for each
 *  person's first visit in the new year instead (see SeasonCard). */
function NyeCountdown({ newYear }: { newYear: number }) {
  const { refresh } = useSeason();
  const [left, setLeft] = useState(msToIstMidnight);
  const prev = useRef(left);
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = msToIstMidnight();
      if (now > prev.current + 60_000) refresh();   // past midnight → it's the new year now
      prev.current = now;
      setLeft(now);
    }, 1000);
    return () => window.clearInterval(id);
  }, [refresh]);
  return (
    <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-[rgba(243,217,139,0.35)] bg-white/5 px-3 py-1 text-xs font-semibold tabular-nums text-[rgba(243,217,139,0.95)]">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f3d98b]" />
      {fmtCountdown(left)} to {newYear}
    </p>
  );
}

/** Everyone's Dashboard on 24–25 Dec ("Merry Christmas", a snowfall once a
 *  day), 31 Dec ("Happy New Year" + countdown, a confetti burst once) and
 *  1–4 Jan ("Happy New Year", a fireworks show on each person's FIRST visit of
 *  the new year — once, whichever of the four days they come back).
 *  Closing it keeps it closed for the rest of that day. */
export function SeasonCard() {
  const { greeting, newYear, date, day, messages } = useSeason();
  const { user } = useAuth();
  const uid = String(user?.id ?? user?.name ?? "");
  const [closed, setClosed] = useState(true);   // decided after mount (localStorage)

  useEffect(() => {
    if (!greeting || !date) return;
    const isClosed = readFlag(closedKey(uid, greeting, date));
    setClosed(isClosed);
    // The new-year fireworks are once per person per new year (not per day).
    const popKey = day === "newyearday" ? poppedKey(uid, "fireworks", String(newYear)) : poppedKey(uid, greeting, date);
    if (!isClosed && !readFlag(popKey)) {
      writeFlag(popKey);
      const burst = greeting === "christmas" ? fireSnow
        : day === "newyearday" ? () => fireFireworks()
        : () => fireConfetti({ x: 0.5, y: 0.25 }, 200);
      const t = window.setTimeout(burst, 500);
      return () => window.clearTimeout(t);
    }
  }, [greeting, date, uid, day, newYear]);

  if (!greeting || closed) return null;
  const xmas = greeting === "christmas";

  return (
    <section
      className={
        "relative mb-6 flex items-center gap-6 overflow-hidden rounded-[20px] px-7 py-6 shadow-[0_18px_40px_-18px_rgba(13,22,51,0.55)] " +
        (xmas
          ? "[background:radial-gradient(120%_140%_at_0%_0%,#1f6b45_0%,#124a30_45%,#0a2a1b_100%)]"
          : "[background:radial-gradient(120%_140%_at_0%_0%,#23356f_0%,#15224a_45%,#0d1633_100%)]")
      }
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[20px] p-px [background:linear-gradient(120deg,rgba(243,217,139,0),rgba(243,217,139,0.75),rgba(201,162,39,0.15)_60%,rgba(243,217,139,0.6))] [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)]" />
      <span aria-hidden className="bday-card-shine pointer-events-none absolute -top-1/2 h-[200%] w-28 rotate-[18deg] bg-gradient-to-r from-transparent via-[rgba(255,240,200,0.12)] to-transparent" />
      <div className="relative flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-full text-[#2a1e04] shadow-[0_6px_18px_-6px_rgba(201,162,39,0.7),inset_0_1px_0_rgba(255,255,255,0.5)] [background:radial-gradient(circle_at_35%_30%,#fbe9b0,#c9a227_55%,#8a6610)]">
        {xmas ? <TreePine className="h-8 w-8" strokeWidth={1.6} /> : <Sparkles className="h-8 w-8" strokeWidth={1.6} />}
      </div>
      <div className="relative min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[rgba(243,217,139,0.75)]">
          {xmas ? "Season's greetings" : `Welcome ${newYear}`}
        </p>
        <h2 className="bday-gold-text mt-1.5 font-serif text-[30px] leading-tight sm:text-[34px]">
          {xmas ? "Merry Christmas" : `Happy New Year ${newYear}`}
        </h2>
        <p className="mt-2 text-sm text-[rgba(226,232,245,0.85)]">
          {xmas
            ? messages.christmas || "Wishing you and your family joy, peace and a wonderful Christmas."
            : messages.newyear || "Thank you for a great year — here's to an even better one together."}
        </p>
        <p className="mt-2.5 text-xs tracking-[0.04em] text-[rgba(243,217,139,0.7)]">{messages.signature || "— Team Canaan Global"}</p>
        {day === "nye" && <NyeCountdown newYear={newYear} />}
      </div>
      <button
        type="button"
        aria-label="Close greeting"
        onClick={() => { writeFlag(closedKey(uid, greeting, date)); setClosed(true); }}
        className="absolute right-4 top-3.5 rounded-full p-1 text-[rgba(226,232,245,0.45)] transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}
