"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { notificationsApi } from "@/lib/api";
import { useAuth } from "./AuthContext";

export type SheetAlertNotif = {
  serverId?: number;          // present when persisted in the DB
  tripDbId: number;
  tripIdStr: string;
  bookingRef: string;
  reportedBy: string;
  alertedAt: string;
};

type NotificationCtx = {
  sheetAlerts: SheetAlertNotif[];
  pushSheetAlert: (alert: Omit<SheetAlertNotif, "alertedAt">) => void;
  dismissSheetAlert: (index: number) => void;
  clearSheetAlerts: () => void;
};

const NotificationContext = createContext<NotificationCtx | null>(null);

const POLL_MS = 20000;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sheetAlerts, setSheetAlerts] = useState<SheetAlertNotif[]>([]);
  const alertsRef = useRef(sheetAlerts);
  alertsRef.current = sheetAlerts;

  const canReceive =
    user?.softwareDesignation === "Admin" || user?.softwareDesignation === "Fleet Manager";

  // Server-backed: fetch unread notifications on login and poll — works even
  // when the WebSocket is down (proxy limitations, backend restarts, late login).
  useEffect(() => {
    if (!canReceive) return;
    let cancelled = false;

    const load = () =>
      notificationsApi
        .list(true)
        .then((rows) => {
          if (cancelled) return;
          setSheetAlerts((prev) => {
            const localOnly = prev.filter((a) => a.serverId === undefined);
            const fromServer = rows.map((r) => ({
              serverId: r.id,
              tripDbId: 0,
              tripIdStr: r.tripIdStr,
              bookingRef: r.bookingRef,
              reportedBy: r.createdBy,
              alertedAt: r.createdAt,
            }));
            return [...fromServer, ...localOnly];
          });
        })
        .catch(() => {});

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [canReceive]);

  const pushSheetAlert = useCallback((alert: Omit<SheetAlertNotif, "alertedAt">) => {
    setSheetAlerts((prev) => {
      // avoid duplicates (WS event + server poll for the same trip)
      if (prev.some((a) => a.tripIdStr === alert.tripIdStr && a.bookingRef === alert.bookingRef)) {
        return prev;
      }
      return [{ ...alert, alertedAt: new Date().toISOString() }, ...prev];
    });
  }, []);

  const dismissSheetAlert = useCallback((index: number) => {
    const alert = alertsRef.current[index];
    if (alert?.serverId !== undefined) {
      notificationsApi.markRead(alert.serverId).catch(() => {});
    }
    setSheetAlerts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearSheetAlerts = useCallback(() => {
    if (alertsRef.current.some((a) => a.serverId !== undefined)) {
      notificationsApi.markAllRead().catch(() => {});
    }
    setSheetAlerts([]);
  }, []);

  return (
    <NotificationContext.Provider value={{ sheetAlerts, pushSheetAlert, dismissSheetAlert, clearSheetAlerts }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
