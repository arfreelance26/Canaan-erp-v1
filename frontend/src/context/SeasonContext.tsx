"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { seasonApi, type FestiveSeason } from "@/lib/api";
import { PREVIEW_EVENT } from "@/lib/celebration-preview";
import { useAuth } from "./AuthContext";

/**
 * December festive season — same shape as BirthdayContext: the sidebar's
 * Christmas lights on every page (`festive`), the garland / snow / red menu
 * item only on the Dashboard (`decorated`), and a greeting card on 24–25 Dec
 * and 31 Dec – 4 Jan. Anyone can hide it for today or for the whole season
 * (per person, per browser); an Admin switches it on/off for everyone from
 * Celebrations Management.
 */
type SeasonCtx = {
  festive: boolean;
  decorated: boolean;
  greeting: FestiveSeason["greeting"];
  newYear: number;
  date: string;
  /** Card text from Celebrations Management. */
  messages: FestiveSeason["messages"];
  /** The special days: Christmas Day, New Year's Eve, the New Year welcome (1–4 Jan). */
  day: "christmas" | "nye" | "newyearday" | null;
  /** Re-ask the server (e.g. right after midnight on New Year's Eve). */
  refresh: () => void;
  hideForToday: () => void;
  hideForSeason: () => void;
};

const SeasonContext = createContext<SeasonCtx>({
  festive: false, decorated: false, greeting: null, newYear: 0, date: "",
  messages: { christmas: "", newyear: "", signature: "" },
  day: null, refresh: () => {}, hideForToday: () => {}, hideForSeason: () => {},
});

const REFRESH_MS = 30 * 60 * 1000;
const dayKey = (uid: string, date: string) => `erp_season_hidden_${uid}_${date}`;
const seasonKey = (uid: string, key: string) => `erp_season_hidden_${uid}_${key}`;

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string) {
  try { localStorage.setItem(key, "1"); } catch {}
}

export function SeasonProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [info, setInfo] = useState<FestiveSeason | null>(null);
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname();
  const onDashboard = pathname === "/" || pathname === "";
  const uid = user ? String(user.id ?? user.name) : "";

  const load = useCallback(() => {
    if (!uid) return Promise.resolve();
    return seasonApi.get()
      .then((r) => {
        setInfo(r);
        setHidden(readFlag(dayKey(uid, r.date)) || readFlag(seasonKey(uid, r.seasonKey)));
      })
      .catch(() => {});
  }, [uid]);

  useEffect(() => {
    setHidden(false);
    if (!uid) { setInfo(null); return; }
    load();
    const id = window.setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    window.addEventListener(PREVIEW_EVENT, load);
    return () => { window.clearInterval(id); window.removeEventListener("focus", load); window.removeEventListener(PREVIEW_EVENT, load); };
  }, [uid, load]);

  const hideForToday = useCallback(() => {
    if (!info) return;
    writeFlag(dayKey(uid, info.date));
    setHidden(true);
  }, [info, uid]);

  const hideForSeason = useCallback(() => {
    if (!info) return;
    writeFlag(seasonKey(uid, info.seasonKey));
    setHidden(true);
  }, [info, uid]);

  const on = !!info?.active && !hidden;
  const md = (info?.date ?? "").slice(5);
  const day = !on ? null : md === "12-25" ? "christmas" : md === "12-31" ? "nye" : ["01-01", "01-02", "01-03", "01-04"].includes(md) ? "newyearday" : null;
  return (
    <SeasonContext.Provider value={{
      festive: on,
      decorated: on && onDashboard,
      greeting: on ? info?.greeting ?? null : null,
      newYear: info?.newYear ?? 0,
      date: info?.date ?? "",
      messages: info?.messages ?? { christmas: "", newyear: "", signature: "" },
      day, refresh: load,
      hideForToday, hideForSeason,
    }}>
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  return useContext(SeasonContext);
}
