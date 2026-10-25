"use client";

import { useEffect, useState } from "react";
import { CakeSlice, X } from "lucide-react";
import { useBirthday } from "@/context/BirthdayContext";
import { useAuth } from "@/context/AuthContext";
import { fireConfetti } from "@/lib/confetti";

const closedKey = (uid: string, date: string) => `erp_bday_card_closed_${uid}_${date}`;
const poppedKey = (uid: string, date: string) => `erp_bday_card_popped_${uid}_${date}`;

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string) {
  try { localStorage.setItem(key, "1"); } catch {}
}

/** Top of the birthday person's own Dashboard (every role's). Confetti once a
 *  day; closing it keeps it closed for the rest of the day. */
export function BirthdayCard() {
  const { mine, name, date, message, signature } = useBirthday();
  const { user } = useAuth();
  const uid = String(user?.id ?? "");
  const [closed, setClosed] = useState(true);   // decided after mount (localStorage)

  useEffect(() => {
    if (!mine || !date) return;
    const isClosed = readFlag(closedKey(uid, date));
    setClosed(isClosed);
    if (!isClosed && !readFlag(poppedKey(uid, date))) {
      writeFlag(poppedKey(uid, date));
      const t = window.setTimeout(() => fireConfetti({ x: 0.5, y: 0.25 }, 180), 400);
      return () => window.clearTimeout(t);
    }
  }, [mine, date, uid]);

  if (!mine || closed || !name) return null;

  const pretty = new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long" });

  return (
    <section className="relative mb-6 flex items-center gap-6 overflow-hidden rounded-[20px] px-7 py-6 shadow-[0_18px_40px_-18px_rgba(13,22,51,0.55)] [background:radial-gradient(120%_140%_at_0%_0%,#23356f_0%,#15224a_45%,#0d1633_100%)]">
      {/* gold hairline border */}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[20px] p-px [background:linear-gradient(120deg,rgba(243,217,139,0),rgba(243,217,139,0.75),rgba(201,162,39,0.15)_60%,rgba(243,217,139,0.6))] [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)]" />
      <span aria-hidden className="bday-card-shine pointer-events-none absolute -top-1/2 h-[200%] w-28 rotate-[18deg] bg-gradient-to-r from-transparent via-[rgba(255,240,200,0.12)] to-transparent" />
      <div className="relative flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-full text-[#2a1e04] shadow-[0_6px_18px_-6px_rgba(201,162,39,0.7),inset_0_1px_0_rgba(255,255,255,0.5)] [background:radial-gradient(circle_at_35%_30%,#fbe9b0,#c9a227_55%,#8a6610)]">
        <CakeSlice className="h-8 w-8" strokeWidth={1.6} />
      </div>
      <div className="relative min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[rgba(243,217,139,0.75)]">{pretty} · Your day</p>
        <h2 className="bday-gold-text mt-1.5 font-serif text-[30px] leading-tight sm:text-[34px]">Happy Birthday, {name}</h2>
        <p className="mt-2 text-sm text-[rgba(226,232,245,0.82)]">
          {message || "Wishing you a wonderful year ahead — thank you for everything you bring to the team."}
        </p>
        <p className="mt-2.5 text-xs tracking-[0.04em] text-[rgba(243,217,139,0.7)]">{signature || "— Team Canaan Global"}</p>
      </div>
      <button
        type="button"
        aria-label="Close birthday card"
        onClick={() => { writeFlag(closedKey(uid, date)); setClosed(true); }}
        className="absolute right-4 top-3.5 rounded-full p-1 text-[rgba(226,232,245,0.45)] transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}
