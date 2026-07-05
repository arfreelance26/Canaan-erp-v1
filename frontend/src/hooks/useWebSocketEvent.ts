"use client";

import { useEffect, useRef } from "react";
import { useWebSocket } from "@/context/WebSocketContext";

type Payload = Record<string, unknown>;

export function useWebSocketEvent(eventType: string, handler: (payload: Payload) => void) {
  const { subscribe } = useWebSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribe(eventType, (payload) => handlerRef.current(payload));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType]);
}
