"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock } from "lucide-react";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";

/**
 * Receiving end of the Events button's scheduled meetings — mounted once at
 * the app shell (same pattern as RoomSummonListener/useChatMessageToasts) so
 * it fires regardless of which page a participant is on. Purely a live
 * "event_starting" WebSocket push from event_reminder_worker.py, sent the
 * moment a meeting's stored start time arrives.
 */
export function EventReminderListener() {
  const [starting, setStarting] = useState<{ title: string; location: string | null } | null>(null);

  useWebSocketEvent("event_starting", (payload) => {
    const title = typeof payload.title === "string" && payload.title ? payload.title : "Meeting";
    const location = typeof payload.location === "string" && payload.location ? payload.location : null;
    setStarting({ title, location });
  });

  if (!starting) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm animate-dialog-enter rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <CalendarClock className="h-7 w-7" />
        </div>
        <p className="text-base font-semibold text-gray-900">&quot;{starting.title}&quot; is starting now.</p>
        {starting.location && <p className="mt-1 text-xs text-gray-400">{starting.location}</p>}
        <button
          type="button"
          onClick={() => setStarting(null)}
          className="mt-5 w-full rounded-full bg-brand-navy py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:scale-[1.02] hover:bg-brand-navy/90"
        >
          OK
        </button>
      </div>
    </div>,
    document.body
  );
}
