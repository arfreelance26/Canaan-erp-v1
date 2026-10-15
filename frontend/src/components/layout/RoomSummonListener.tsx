"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BellRing } from "lucide-react";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAuth } from "@/context/AuthContext";
import { roomSummonApi } from "@/lib/api";

const POLL_MS = 8000;

type Invite = { id: number; summonedBy: string };

/**
 * Receiving end of the Admin-only Invite button (AlertsButton) — mounted once
 * at the app shell so it fires no matter which page the recipient is on.
 *
 * Two delivery paths, deduped by invite id:
 * - the "room_summon" WebSocket push (instant, but only where WebSockets
 *   work — local dev);
 * - polling /room-summon/inbox every few seconds, because production (cPanel/
 *   Passenger) can't carry WebSockets at all, so the push never arrives there.
 * The last invite id seen is remembered per person in localStorage, so a
 * refresh never replays invites already shown. Several invites queue up
 * rather than replacing one another.
 */
export function RoomSummonListener() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [queue, setQueue] = useState<Invite[]>([]);
  const seenIds = useRef(new Set<number>());
  const lastSeen = useRef<number | null>(null);
  const storageKey = userId != null ? `canaan_summon_seen:${userId}` : null;

  const remember = useCallback((id: number) => {
    if (lastSeen.current == null || id > lastSeen.current) {
      lastSeen.current = id;
      try {
        if (storageKey) localStorage.setItem(storageKey, String(id));
      } catch {
        /* storage blocked — dedupe still works for this session */
      }
    }
  }, [storageKey]);

  const enqueue = useCallback((items: Invite[]) => {
    const fresh = items.filter((i) => !seenIds.current.has(i.id));
    if (fresh.length === 0) return;
    fresh.forEach((i) => seenIds.current.add(i.id));
    setQueue((prev) => [...prev, ...fresh]);
  }, []);

  // Load where this person left off whenever the signed-in user changes.
  useEffect(() => {
    seenIds.current = new Set();
    lastSeen.current = null;
    setQueue([]);
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      lastSeen.current = raw ? Number(raw) || null : null;
    } catch {
      lastSeen.current = null;
    }
  }, [storageKey]);

  const poll = useCallback(async () => {
    if (userId == null || (typeof document !== "undefined" && document.hidden)) return;
    try {
      const { items, latestId } = await roomSummonApi.inbox(lastSeen.current);
      enqueue(items.map((i) => ({ id: i.id, summonedBy: i.summonedByName })));
      if (latestId) remember(latestId);
    } catch {
      /* next poll retries */
    }
  }, [userId, enqueue, remember]);

  useEffect(() => {
    if (userId == null) return;
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    // Check straight away when someone comes back to the tab — an invite sent
    // while they were elsewhere shows the moment they return.
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [userId, poll]);

  useWebSocketEvent("room_summon", (payload) => {
    const name = typeof payload.summonedByName === "string" && payload.summonedByName ? payload.summonedByName : "The owner";
    const id = typeof payload.id === "number" ? payload.id : null;
    if (id == null) {
      // Older server without ids — show it, there's nothing to dedupe against.
      setQueue((prev) => [...prev, { id: -Date.now(), summonedBy: name }]);
      return;
    }
    enqueue([{ id, summonedBy: name }]);
    remember(id);
  });

  const current = queue[0];
  if (!current) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm animate-dialog-enter rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <BellRing className="h-7 w-7" />
        </div>
        <p className="text-base font-semibold text-gray-900">
          The owner has requested your presence in their room.
        </p>
        <p className="mt-1 text-xs text-gray-400">— {current.summonedBy}</p>
        {queue.length > 1 && (
          <p className="mt-2 text-xs font-medium text-amber-600">+{queue.length - 1} more invite{queue.length > 2 ? "s" : ""}</p>
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
