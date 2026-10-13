"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { BellRing } from "lucide-react";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";

/**
 * Receiving end of the Admin-only "Summon" button (AlertsButton) — mounted
 * once at the app shell so it fires no matter which page the recipient is on,
 * the same way useChatMessageToasts does for chat popups. Purely a live
 * "room_summon" WebSocket event; the backend only ever sends this to the
 * people actually picked (see routers/room_summon.py), so anything this
 * receives is a genuine summon for this viewer.
 */
export function RoomSummonListener() {
  const [summonedBy, setSummonedBy] = useState<string | null>(null);

  useWebSocketEvent("room_summon", (payload) => {
    const name = typeof payload.summonedByName === "string" && payload.summonedByName ? payload.summonedByName : "The owner";
    setSummonedBy(name);
  });

  if (!summonedBy) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm animate-dialog-enter rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <BellRing className="h-7 w-7" />
        </div>
        <p className="text-base font-semibold text-gray-900">
          The owner has requested your presence in their room.
        </p>
        <p className="mt-1 text-xs text-gray-400">— {summonedBy}</p>
        <button
          type="button"
          onClick={() => setSummonedBy(null)}
          className="mt-5 w-full rounded-full bg-brand-navy py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:scale-[1.02] hover:bg-brand-navy/90"
        >
          OK
        </button>
      </div>
    </div>,
    document.body
  );
}
