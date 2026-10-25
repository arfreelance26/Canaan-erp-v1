"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { birthdayApi, type BirthdayToday } from "@/lib/api";
import { PREVIEW_EVENT } from "@/lib/celebration-preview";
import { useAuth } from "./AuthContext";

/**
 * Staff birthdays. On any staff member's birthday the sidebar + topbar wear
 * party decorations for EVERYONE (the sidebar on every page, the topbar on the Dashboard), but only the birthday person
 * is told it's theirs (`mine`, `name`) — the server never sends anyone else's
 * name or date of birth. Anyone can hide the decorations for the rest of the
 * day from the profile menu (per browser).
 */
type BirthdayCtx = {
  /** Someone's birthday and not hidden today — the sidebar lights (every page). */
  festive: boolean;
  /** `festive` and on the Dashboard — all the other decorations. */
  decorated: boolean;
  /** It's the logged-in person's own birthday. */
  mine: boolean;
  name: string | null;
  /** IST date the answer is for — keys the "once a day" things. */
  date: string;
  /** Card text from Celebrations Management. */
  message: string;
  signature: string;
  hideForToday: () => void;
};

const BirthdayContext = createContext<BirthdayCtx>({
  festive: false, decorated: false, mine: false, name: null, date: "", message: "", signature: "", hideForToday: () => {},
});

const REFRESH_MS = 30 * 60 * 1000;   // picks up midnight without a reload
// Per person AND per day — several accounts can share one browser.
const hiddenKey = (uid: string, date: string) => `erp_bday_hidden_${uid}_${date}`;

function readHidden(uid: string, date: string): boolean {
  try { return localStorage.getItem(hiddenKey(uid, date)) === "1"; } catch { return false; }
}

export function BirthdayProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [info, setInfo] = useState<BirthdayToday | null>(null);
  const [hidden, setHidden] = useState(false);
  // The topbar flags only on the Dashboard — on every working page they'd get in the way.
  const pathname = usePathname();
  const onDashboard = pathname === "/" || pathname === "";
  const uid = user ? String(user.id ?? user.name) : "";

  useEffect(() => {
    setHidden(false);
    if (!uid) { setInfo(null); return; }
    let cancelled = false;
    const load = () => birthdayApi.today()
      .then((r) => { if (!cancelled) { setInfo(r); setHidden(readHidden(uid, r.date)); } })
      .catch(() => {});
    load();
    const id = window.setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    window.addEventListener(PREVIEW_EVENT, load);
    return () => {
      cancelled = true; window.clearInterval(id);
      window.removeEventListener("focus", load); window.removeEventListener(PREVIEW_EVENT, load);
    };
  }, [uid]);

  const hideForToday = useCallback(() => {
    if (!info) return;
    try { localStorage.setItem(hiddenKey(uid, info.date), "1"); } catch {}
    setHidden(true);
  }, [info, uid]);

  return (
    <BirthdayContext.Provider value={{
      festive: !!info?.celebrating && !hidden,
      decorated: !!info?.celebrating && !hidden && onDashboard,
      mine: !!info?.mine,
      name: info?.name ?? null,
      date: info?.date ?? "",
      message: info?.message ?? "",
      signature: info?.signature ?? "",
      hideForToday,
    }}>
      {children}
    </BirthdayContext.Provider>
  );
}

export function useBirthday() {
  return useContext(BirthdayContext);
}
