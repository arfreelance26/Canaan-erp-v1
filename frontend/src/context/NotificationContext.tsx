"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { notificationsApi, remindersApi, type Reminder } from "@/lib/api";
import { subscribeRealtime } from "@/lib/realtime";
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
  reminders: Reminder[];
  pushSheetAlert: (alert: Omit<SheetAlertNotif, "alertedAt">) => void;
  dismissSheetAlert: (index: number) => void;
  clearSheetAlerts: () => void;
};

const NotificationContext = createContext<NotificationCtx | null>(null);

const POLL_MS = 10000;
const REALTIME_DEBOUNCE_MS = 1500;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sheetAlerts, setSheetAlerts] = useState<SheetAlertNotif[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const alertsRef = useRef(sheetAlerts);
  alertsRef.current = sheetAlerts;

  const isAdmin = user?.softwareDesignation === "Admin";
  const canReceive = isAdmin || user?.softwareDesignation === "Fleet Manager";

  // Server-backed: fetch on login, poll every 20s, and refetch instantly when
  // the WebSocket reports a data change — works even if the socket is down.
  useEffect(() => {
    if (!canReceive) return;
    let cancelled = false;

    const load = () => {
      notificationsApi
        .list(true)
        .then((rows) => {
          if (cancelled) return;
          setSheetAlerts((prev) => {
            const fromServer = rows.map((r) => ({
              serverId: r.id,
              tripDbId: 0,
              tripIdStr: r.tripIdStr,
              bookingRef: r.bookingRef,
              reportedBy: r.createdBy,
              alertedAt: r.createdAt,
            }));
            // keep local (WS-pushed) alerts only if the server copy hasn't arrived yet
            const localOnly = prev.filter(
              (a) =>
                a.serverId === undefined &&
                !fromServer.some((s) => s.tripIdStr === a.tripIdStr && s.bookingRef === a.bookingRef)
            );
            return [...fromServer, ...localOnly];
          });
        })
        .catch(() => {});
      remindersApi
        .list()
        .then((rows) => {
          if (!cancelled) setReminders(rows);
        })
        .catch(() => {});
    };

    load();
    const id = setInterval(load, POLL_MS);

    // Realtime: any data change (truck edited, EMI added, sheet unmarked…)
    // triggers an immediate refetch, debounced against bursts.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeRealtime((event) => {
      if (event.type !== "data_changed" && !event.type.startsWith("sheet_")) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(load, REALTIME_DEBOUNCE_MS);
    });

    // Refetch the moment the tab regains focus (user switches back to Admin tab)
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(id);
      if (debounce) clearTimeout(debounce);
      unsub();
      window.removeEventListener("focus", onFocus);
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
    <NotificationContext.Provider
      value={{ sheetAlerts, reminders, pushSheetAlert, dismissSheetAlert, clearSheetAlerts }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
