"use client";

/**
 * Singleton WebSocket client for realtime updates.
 *
 * - Connects to the backend /ws endpoint with the JWT from sessionStorage (per-tab session)
 * - Auto-reconnects with exponential backoff (1s → 30s max)
 * - Sends a "ping" heartbeat every 30s to keep proxies (cPanel/LiteSpeed) from
 *   dropping the idle connection
 * - Dispatches "data_changed" events to subscribers; pages refetch instantly
 */

type RealtimeEvent = { type: string; payload: Record<string, unknown> };
type Listener = (event: RealtimeEvent) => void;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const WS_URL = API_URL.replace(/^http/, "ws") + "/ws";

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_GIVE_UP_MS = 5 * 60 * 1000; // after MAX_RETRIES failures, back off to 5 min
const MAX_RETRIES = 5;
const HEARTBEAT_MS = 30000;

let socket: WebSocket | null = null;
let listeners: Set<Listener> = new Set();
let reconnectDelay = RECONNECT_MIN_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let connected = false;
let failCount = 0;

function getToken(): string | null {
  try {
    const stored = sessionStorage.getItem("canaan_erp_user");
    return stored ? (JSON.parse(stored).token ?? null) : null;
  } catch {
    return null;
  }
}

function cleanup() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  connected = false;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  failCount += 1;
  const delay = failCount > MAX_RETRIES ? RECONNECT_GIVE_UP_MS : reconnectDelay;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
  if (failCount <= MAX_RETRIES) {
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  }
}

function connect() {
  if (typeof window === "undefined") return;
  if (process.env.NEXT_PUBLIC_DISABLE_WEBSOCKET === "true") return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const token = getToken();
  if (!token) {
    // Not logged in yet — retry later (login page, or rehydration in flight)
    scheduleReconnect();
    return;
  }

  try {
    socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    connected = true;
    reconnectDelay = RECONNECT_MIN_MS;
    failCount = 0;
    heartbeatTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send("ping");
    }, HEARTBEAT_MS);
  };

  socket.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as RealtimeEvent;
      if (event.type === "pong") return;
      listeners.forEach((fn) => {
        try {
          fn(event);
        } catch {
          /* one bad listener shouldn't break the rest */
        }
      });
    } catch {
      /* ignore malformed frames */
    }
  };

  socket.onclose = () => {
    cleanup();
    socket = null;
    // 4001 = session expired (server-initiated); 1008 = bad token.
    // Reconnect anyway — getToken() picks up a fresh token after re-login.
    scheduleReconnect();
  };

  socket.onerror = () => {
    socket?.close();
  };
}

/** Subscribe to realtime events. Returns an unsubscribe function. */
export function subscribeRealtime(listener: Listener): () => void {
  listeners.add(listener);
  connect(); // lazy-connect on first subscriber
  return () => {
    listeners.delete(listener);
  };
}

/** True when the socket is currently open. */
export function isRealtimeConnected(): boolean {
  return connected;
}

/** Force-close (e.g. on logout) so the next login reconnects with the new token. */
export function disconnectRealtime(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  cleanup();
  socket?.close();
  socket = null;
  reconnectDelay = RECONNECT_MIN_MS;
}
