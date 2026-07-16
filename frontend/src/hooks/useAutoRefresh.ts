"use client";

import { useEffect, useRef } from "react";
import { useWebSocket } from "@/context/WebSocketContext";
import { onRevalidated } from "@/lib/api-cache";

/**
 * Realtime-first refresh hook.
 *
 * Primary: subscribes to "data_changed" events on the shared WebSocket
 * (WebSocketContext) — reuses the single connection already open, no second socket.
 *
 * Fallback: polling interval, activated only when no WS event has been
 * received for FALLBACK_MS (60s). If the socket drops, polling resumes at
 * the requested intervalMs so the app degrades gracefully.
 *
 * @param callback  Function to execute on refresh
 * @param intervalMs  Polling interval used when WS is unavailable (default 5 s)
 */
const FALLBACK_MS = 60_000; // how long without a WS event before polling kicks in
const DEBOUNCE_MS = 300;    // merge rapid bursts of events into one refresh

export function useAutoRefresh(callback: () => void, intervalMs: number = 5000) {
  const savedCallback = useRef(callback);
  const lastWsEvent   = useRef(0); // tracks last received data_changed event
  const { subscribe } = useWebSocket();

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Realtime — subscribe via the shared WebSocket; no extra connection
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribe("data_changed", () => {
      lastWsEvent.current = Date.now();
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => savedCallback.current(), DEBOUNCE_MS);
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      unsub();
    };
  }, [subscribe]);

  // Cache revalidation — when a background SWR refresh discovers changed data,
  // re-run the callback so the component pulls the now-fresh cached value.
  useEffect(() => {
    return onRevalidated(() => savedCallback.current());
  }, []);

  // Fallback polling — only fires when WS has been silent for FALLBACK_MS
  useEffect(() => {
    if (intervalMs <= 0) return;
    const id = setInterval(() => {
      if (Date.now() - lastWsEvent.current >= FALLBACK_MS) {
        lastWsEvent.current = Date.now(); // prevent burst firing
        savedCallback.current();
      }
    }, Math.min(intervalMs, 5000));
    return () => clearInterval(id);
  }, [intervalMs]);
}
