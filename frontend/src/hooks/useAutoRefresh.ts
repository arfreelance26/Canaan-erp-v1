import { useEffect, useRef } from "react";
import { subscribeRealtime, isRealtimeConnected } from "@/lib/realtime";

/**
 * Realtime-first refresh hook.
 *
 * Primary: subscribes to the backend WebSocket — any data mutation on the server
 * triggers an immediate (debounced) refresh, so all users see changes live.
 *
 * Fallback: a polling interval. While the socket is connected the poll is
 * stretched to FALLBACK_MS (safety net only); if the socket drops, polling
 * resumes at the requested interval so the app degrades gracefully.
 *
 * @param callback The function to execute on refresh
 * @param intervalMs Poll interval when realtime is unavailable (default: 5000)
 */
const FALLBACK_MS = 60000;   // slow safety-net poll while realtime is healthy
const DEBOUNCE_MS = 300;     // merge bursts of events into one refresh

export function useAutoRefresh(callback: () => void, intervalMs: number = 5000) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Realtime: refresh immediately when the server broadcasts a change
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeRealtime((event) => {
      if (event.type !== "data_changed") return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => savedCallback.current(), DEBOUNCE_MS);
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      unsubscribe();
    };
  }, []);

  // Fallback polling — each tick decides based on live connection state:
  // socket healthy → only refresh if FALLBACK_MS has elapsed; socket down → poll normally
  useEffect(() => {
    if (intervalMs <= 0) return;
    let lastRun = Date.now();
    const id = setInterval(() => {
      const due = isRealtimeConnected() ? FALLBACK_MS : intervalMs;
      if (Date.now() - lastRun >= due) {
        lastRun = Date.now();
        savedCallback.current();
      }
    }, Math.min(intervalMs, 5000));
    return () => clearInterval(id);
  }, [intervalMs]);
}
