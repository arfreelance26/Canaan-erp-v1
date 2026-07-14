"use client";

/**
 * Singleton WebSocket client for realtime updates.
 * Gives up after MAX_RETRIES consecutive failures (e.g. hosting doesn't support WS).
 * Pages fall back to useAutoRefresh polling automatically.
 */

type RealtimeEvent = { type: string; payload: Record<string, unknown> };
type Listener = (event: RealtimeEvent) => void;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const WS_URL = API_URL.replace(/^http/, "ws") + "/ws";

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const MAX_RETRIES = 5;
const HEARTBEAT_MS = 30000;

let socket: WebSocket | null = null;
const listeners: Set<Listener> = new Set();
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
  if (failCount > MAX_RETRIES) return; // server doesn't support WS — give up, polling takes over
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
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
