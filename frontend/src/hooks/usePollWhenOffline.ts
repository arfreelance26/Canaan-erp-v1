"use client";

import { useEffect, useRef } from "react";
import { useWebSocket } from "@/context/WebSocketContext";
import { isUserEditing } from "@/hooks/useAutoRefresh";

/**
 * Backup refresh for pages that update from live "data changed" messages:
 * calls `callback` every `intervalMs` — but ONLY while the live connection is
 * down (e.g. it gave up reconnecting on a flaky network), and never while the
 * user is typing in a field. With the connection up it does nothing, so a
 * healthy page makes no extra requests.
 */
export function usePollWhenOffline(callback: () => void, intervalMs = 30_000) {
  const { isConnected } = useWebSocket();
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);

  useEffect(() => {
    const id = setInterval(() => {
      if (isConnected() || isUserEditing()) return;
      saved.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, isConnected]);
}
