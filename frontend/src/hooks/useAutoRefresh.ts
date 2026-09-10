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
 * received for FALLBACK_MS. If the socket drops (e.g. the host can't do
 * WebSockets), polling resumes automatically so the app degrades gracefully.
 *
 * FALLBACK_MS is intentionally short (~4s) so that when WS is unavailable the
 * screens still refresh every 3–5s and feel near-realtime. When WS is healthy
 * and delivering events, lastWsEvent keeps updating and this polling stays idle.
 *
 * @param callback  Function to execute on refresh
 * @param intervalMs  Polling interval used when WS is unavailable (default 5 s)
 */
const FALLBACK_MS = 3_500;  // WS silence before polling kicks in → ~4s poll cadence when WS is down
const CHECK_MS    = 2_000;  // how often the fallback timer re-checks the silence window
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
    const runWhenIdle = () => {
      // Same rule as the polling path: if the user is mid-entry, wait and
      // retry shortly rather than refetch and clobber their input.
      if (isUserEditing()) {
        debounce = setTimeout(runWhenIdle, DEBOUNCE_MS);
        return;
      }
      savedCallback.current();
    };
    const unsub = subscribe("data_changed", () => {
      lastWsEvent.current = Date.now();
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(runWhenIdle, DEBOUNCE_MS);
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
      if (Date.now() - lastWsEvent.current < FALLBACK_MS) return;
      // Never refresh while the user is actively typing/editing a field — a
      // background refetch here would re-render the open form and wipe what
      // they're entering. Skip this cycle without advancing the timer, so the
      // refresh fires on the very next tick after they click away / blur.
      if (isUserEditing()) return;
      lastWsEvent.current = Date.now(); // prevent burst firing
      savedCallback.current();
    }, Math.min(intervalMs, CHECK_MS));
    return () => clearInterval(id);
  }, [intervalMs]);
}

/**
 * True when focus is in an editable field (text input, textarea, select, or any
 * contenteditable/combobox), meaning the user is mid-entry and a background
 * refresh must be deferred so their input isn't lost.
 */
function isUserEditing(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    // Ignore non-editable inputs (buttons, checkboxes) — they hold no typed text.
    if (tag === "INPUT") {
      const type = (el as HTMLInputElement).type;
      if (type === "button" || type === "submit" || type === "reset" || type === "checkbox" || type === "radio") {
        return false;
      }
    }
    return true;
  }
  if (el.isContentEditable) return true;
  // Radix / shadcn selects and comboboxes render a focused role element while open.
  const role = el.getAttribute("role");
  if (role === "combobox" || role === "textbox" || role === "searchbox") return true;
  return false;
}
