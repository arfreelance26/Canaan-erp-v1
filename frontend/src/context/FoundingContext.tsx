"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { foundingApi, type FoundingDay } from "@/lib/api";
import { PREVIEW_EVENT } from "@/lib/celebration-preview";
import { useAuth } from "./AuthContext";

/**
 * Founding Day (5 January, founded 2015) — same shape as SeasonContext: navy
 * and gold string lights in the sidebar on every page (`festive`), the gold
 * wave / "EST. 2015" mark / logo shine only on the Dashboard (`decorated`),
 * and an anniversary card with the company's running totals. Anyone can hide
 * it for today; an Admin switches it on/off for everyone from Celebrations
 * Management.
 */
type FoundingCtx = {
  festive: boolean;
  decorated: boolean;
  years: number;
  ordinal: string;
  milestone: boolean;
  date: string;
  stats: FoundingDay["stats"];
  /** Card text from Celebrations Management. */
  message: string;
  signature: string;
  hideForToday: () => void;
};

const FoundingContext = createContext<FoundingCtx>({
  festive: false, decorated: false, years: 0, ordinal: "", milestone: false, date: "", stats: null,
  message: "", signature: "", hideForToday: () => {},
});

const REFRESH_MS = 30 * 60 * 1000;
const dayKey = (uid: string, date: string) => `erp_founding_hidden_${uid}_${date}`;

export function FoundingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [info, setInfo] = useState<FoundingDay | null>(null);
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname();
  const onDashboard = pathname === "/" || pathname === "";
  const uid = user ? String(user.id ?? user.name) : "";

  const load = useCallback(() => {
    if (!uid) return Promise.resolve();
    return foundingApi.get()
      .then((r) => {
        setInfo(r);
        try { setHidden(localStorage.getItem(dayKey(uid, r.date)) === "1"); } catch { setHidden(false); }
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
    try { localStorage.setItem(dayKey(uid, info.date), "1"); } catch {}
    setHidden(true);
  }, [info, uid]);

  const on = !!info?.active && !hidden;
  return (
    <FoundingContext.Provider value={{
      festive: on,
      decorated: on && onDashboard,
      years: info?.years ?? 0,
      ordinal: info?.ordinal ?? "",
      milestone: !!info?.milestone,
      date: info?.date ?? "",
      stats: info?.stats ?? null,
      message: info?.message ?? "",
      signature: info?.signature ?? "",
      hideForToday,
    }}>
      {children}
    </FoundingContext.Provider>
  );
}

export function useFounding() {
  return useContext(FoundingContext);
}
