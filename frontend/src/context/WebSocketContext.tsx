"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { cacheInvalidate } from "@/lib/api-cache";

type EventHandler = (payload: Record<string, unknown>) => void;
type Unsubscribe = () => void;

type WSContextType = {
  subscribe: (eventType: string, handler: EventHandler) => Unsubscribe;
  /** True while the live connection is open (read at call time, no re-render). */
  isConnected: () => boolean;
};

const WebSocketContext = createContext<WSContextType | null>(null);

const WS_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "").replace(/^http/, "ws");
const MAX_RETRIES = 5;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const wsRef        = useRef<WebSocket | null>(null);
  const handlersRef  = useRef<Map<string, Set<EventHandler>>>(new Map());
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef     = useRef<string | undefined>(undefined);
  const failCountRef = useRef(0);

  function isConnected(): boolean {
    return wsRef.current?.readyState === WebSocket.OPEN;
  }

  function subscribe(eventType: string, handler: EventHandler): Unsubscribe {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set());
    }
    handlersRef.current.get(eventType)!.add(handler);
    return () => handlersRef.current.get(eventType)?.delete(handler);
  }

  useEffect(() => {
    tokenRef.current = user?.token;

    if (!user?.token) {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    function connect() {
      if (process.env.NEXT_PUBLIC_DISABLE_WEBSOCKET === "true") return;
      if (failCountRef.current > MAX_RETRIES) return; // server doesn't support WS — polling takes over
      const token = tokenRef.current;
      if (!token) return;
      const ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const { type, payload } = JSON.parse(e.data) as { type: string; payload: Record<string, unknown> };
          // The server announces every change (by anyone). Drop this browser's
          // cached copy of that resource — and the cost figures built from it —
          // before any page reloads, so nobody is shown pre-change data.
          if (type === "data_changed" && typeof payload?.resource === "string" && payload.resource) {
            cacheInvalidate(`/${payload.resource}`);
          }
          handlersRef.current.get(type)?.forEach((h) => h(payload));
        } catch {}
      };

      ws.onopen = () => { failCountRef.current = 0; };

      ws.onclose = () => {
        wsRef.current = null;
        if (reconnectRef.current) clearTimeout(reconnectRef.current);
        failCountRef.current += 1;
        if (failCountRef.current > MAX_RETRIES) return; // give up — no more retries
        reconnectRef.current = setTimeout(() => {
          if (tokenRef.current) connect();
        }, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user?.token]);

  return (
    <WebSocketContext.Provider value={{ subscribe, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocket must be used within WebSocketProvider");
  return ctx;
}
