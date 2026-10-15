"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock } from "lucide-react";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAuth } from "@/context/AuthContext";
import { eventsApi } from "@/lib/api";

const POLL_MS = 30_000;
// A meeting that started longer ago than this isn't announced as "starting now".
const START_WINDOW_MS = 10 * 60_000;
const REMEMBER_MAX = 100;

type Reminder = { id: number; title: string; location: string | null };

/**
 * The "<meeting> is starting now" dialog for the Events button — mounted once
 * at the app shell so it fires regardless of which page a participant is on.
 *
 * Two delivery paths, deduped by meeting id:
 * - the "event_starting" WebSocket push from event_reminder_worker.py
 *   (instant, but only where WebSockets work — local dev);
 * - checking the person's upcoming meetings every 30s for one whose start
 *   time has just passed, because production (cPanel/Passenger) can't carry
 *   WebSockets, so the push never arrives there.
 * Meetings already announced are remembered per person in localStorage, so a
 * refresh never repeats a reminder.
 */
export function EventReminderListener() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [queue, setQueue] = useState<Reminder[]>([]);
  const shown = useRef(new Set<number>());
  const storageKey = userId != null ? `canaan_event_reminded:${userId}` : null;

  useEffect(() => {
    shown.current = new Set();
    setQueue([]);
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      const ids = raw ? (JSON.parse(raw) as number[]) : [];
      shown.current = new Set(Array.isArray(ids) ? ids : []);
    } catch {
      shown.current = new Set();
    }
  }, [storageKey]);

  const announce = useCallback((items: Reminder[]) => {
    const fresh = items.filter((r) => !shown.current.has(r.id));
    if (fresh.length === 0) return;
    fresh.forEach((r) => shown.current.add(r.id));
    try {
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(Array.from(shown.current).slice(-REMEMBER_MAX)));
    } catch {
      /* storage blocked — dedupe still works for this session */
    }
    setQueue((prev) => [...prev, ...fresh]);
  }, [storageKey]);

  const check = useCallback(async () => {
    if (userId == null || (typeof document !== "undefined" && document.hidden)) return;
    try {
      const upcoming = await eventsApi.listUpcoming();
      const now = Date.now();
      announce(
        upcoming
          .filter((ev) => {
            if (!ev.startsAt) return false;
            const start = new Date(ev.startsAt).getTime();
            return start <= now && now - start <= START_WINDOW_MS;
          })
          .map((ev) => ({ id: ev.id, title: ev.title || "Meeting", location: ev.location })),
      );
    } catch {
      /* next check retries */
    }
  }, [userId, announce]);

  useEffect(() => {
    if (userId == null) return;
    void check();
    const id = window.setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [userId, check]);

  useWebSocketEvent("event_starting", (payload) => {
    const title = typeof payload.title === "string" && payload.title ? payload.title : "Meeting";
    const location = typeof payload.location === "string" && payload.location ? payload.location : null;
    const id = typeof payload.eventId === "number" ? payload.eventId : -Date.now();
    announce([{ id, title, location }]);
  });

  const current = queue[0];
  if (!current) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm animate-dialog-enter rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 text-orange-600">
          <CalendarClock className="h-7 w-7" />
        </div>
        <p className="text-base font-semibold text-gray-900">&quot;{current.title}&quot; is starting now.</p>
        {current.location && <p className="mt-1 text-xs text-gray-400">{current.location}</p>}
        {queue.length > 1 && (
          <p className="mt-2 text-xs font-medium text-orange-600">+{queue.length - 1} more meeting{queue.length > 2 ? "s" : ""} starting</p>
        )}
        <button
          type="button"
          onClick={() => setQueue((prev) => prev.slice(1))}
          className="mt-5 w-full rounded-full bg-brand-navy py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:scale-[1.02] hover:bg-brand-navy/90"
        >
          OK
        </button>
      </div>
    </div>,
    document.body
  );
}
