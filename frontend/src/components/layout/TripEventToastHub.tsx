"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { notificationsApi } from "@/lib/api";
import { RiNavigationLine as Navigation, RiCheckboxCircleLine as CheckCircle2, RiCloseLine as X, RiArrowRightLine as ArrowRight } from "@remixicon/react";

type Toast = {
  id: number;
  type: "assigned" | "closed";
  tripId: string;
  origin: string;
  destination: string;
  by: string;
};

let _counter = 0;
const AUTO_DISMISS_MS = 7000;

export function TripEventToastHub() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Cleanup all timers on unmount
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // On mount: replay up to 5 unread trip-event notifications the user missed while offline
  // Show them staggered so they don't all appear at once, then mark them read.
  const push = useCallback(
    (type: Toast["type"], tripId: string, origin: string, destination: string, by: string) => {
      const id = ++_counter;
      setToasts((prev) => [{ id, type, tripId, origin, destination, by }, ...prev].slice(0, 6));
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  // Replay persisted unread notifications on mount (catches events missed while offline).
  // Stagger by 600ms so toasts stack visibly one by one.
  useEffect(() => {
    notificationsApi.list(true).then((rows) => {
      const TRIP_TYPES = new Set(["trip_assigned", "trip_closed"]);
      const missed = rows
        .filter((r) => TRIP_TYPES.has(r.eventType))
        .slice(0, 5)
        .reverse(); // oldest first → newest lands on top
      missed.forEach((r, i) => {
        const type: Toast["type"] = r.eventType === "trip_assigned" ? "assigned" : "closed";
        let origin = "", destination = "", by = r.createdBy;
        try {
          const parsed = JSON.parse(r.message) as { origin?: string; destination?: string; by?: string };
          origin      = parsed.origin      ?? "";
          destination = parsed.destination ?? "";
          by          = parsed.by          ?? r.createdBy;
        } catch { /* non-JSON message — leave fields empty */ }
        setTimeout(() => {
          push(type, r.tripIdStr, origin, destination, by);
          notificationsApi.markRead(r.id).catch(() => {});
        }, i * 600);
      });
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useWebSocketEvent("trip_assigned", (p) => {
    push(
      "assigned",
      String(p.trip_id ?? ""),
      String(p.origin ?? ""),
      String(p.destination ?? ""),
      String(p.assigned_by ?? ""),
    );
  });

  useWebSocketEvent("trip_closed", (p) => {
    push(
      "closed",
      String(p.trip_id_str ?? p.trip_id ?? ""),
      String(p.origin ?? ""),
      String(p.destination ?? ""),
      String(p.closed_by ?? ""),
    );
  });

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes toast-shrink {
          from { width: 100%; }
          to   { width: 0%;   }
        }
        .trip-toast { animation: toast-slide-in 0.28s cubic-bezier(0.22,1,0.36,1) both; }
        .trip-toast-bar { animation: toast-shrink ${AUTO_DISMISS_MS}ms linear forwards; }
      `}</style>

      <div
        role="region"
        aria-label="Trip notifications"
        className="fixed bottom-5 right-5 z-[9999] flex flex-col-reverse gap-3 pointer-events-none"
      >
        {toasts.map((toast) => {
          const isAssigned = toast.type === "assigned";
          return (
            <div
              key={toast.id}
              className={`trip-toast pointer-events-auto w-80 overflow-hidden rounded-2xl border shadow-2xl ${
                isAssigned
                  ? "border-accent-border bg-accent-surface "
                  : "border-success-border "
              }`}
            >
              {/* Shrinking progress bar */}
              <div className={`trip-toast-bar h-0.5 ${isAssigned ? "bg-accent-solid" : "bg-success-solid"}`} />

              <div className="px-4 py-3">
                {/* Title row */}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isAssigned ? "bg-accent-surface-strong" : "bg-success-surface-strong"}`}>
                      {isAssigned
                        ? <Navigation  className="h-3.5 w-3.5 text-accent-text"    />
                        : <CheckCircle2 className="h-3.5 w-3.5 text-success-text" />}
                    </div>
                    <span className={`text-caption-1-semibold ${isAssigned ? "text-accent-text" : "text-success-text"}`}>
                      {isAssigned ? "Trip Assigned" : "Trip Completed"}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => dismiss(toast.id)}
                    className="shrink-0 rounded-full p-0.5 text-text-tertiary transition-colors hover:bg-scrim/10 hover:text-text-secondary"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Trip ID */}
                <p className="mb-1 text-body-semibold text-text-primary">{toast.tripId || "—"}</p>

                {/* Route */}
                <div className="mb-2 flex items-center gap-1.5 text-xs text-text-secondary">
                  <span className="max-w-[110px] truncate font-medium">{toast.origin || "—"}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-text-tertiary" />
                  <span className="max-w-[110px] truncate font-medium">{toast.destination || "—"}</span>
                </div>

                {/* Actor */}
                <p className="text-[11px] text-text-secondary">
                  {isAssigned ? "Assigned by" : "Completed by"}{" "}
                  <span className="font-semibold text-text-primary">{toast.by || "—"}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
