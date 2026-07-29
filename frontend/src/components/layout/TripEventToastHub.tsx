"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { notificationsApi } from "@/lib/api";
import { Navigation, CheckCircle2, X, ArrowRight } from "lucide-react";

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
                  ? "border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50"
                  : "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50"
              }`}
            >
              {/* Shrinking progress bar */}
              <div className={`trip-toast-bar h-0.5 ${isAssigned ? "bg-blue-400" : "bg-emerald-500"}`} />

              <div className="px-4 py-3">
                {/* Title row */}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isAssigned ? "bg-blue-100" : "bg-emerald-100"}`}>
                      {isAssigned
                        ? <Navigation  className="h-3.5 w-3.5 text-blue-600"    />
                        : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-wider ${isAssigned ? "text-blue-700" : "text-emerald-700"}`}>
                      {isAssigned ? "Trip Assigned" : "Trip Completed"}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => dismiss(toast.id)}
                    className="shrink-0 rounded-full p-0.5 text-gray-400 transition-colors hover:bg-black/10 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Trip ID */}
                <p className="mb-1 text-sm font-bold text-gray-900">{toast.tripId || "—"}</p>

                {/* Route */}
                <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="max-w-[110px] truncate font-medium">{toast.origin || "—"}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-gray-400" />
                  <span className="max-w-[110px] truncate font-medium">{toast.destination || "—"}</span>
                </div>

                {/* Actor */}
                <p className="text-[11px] text-gray-500">
                  {isAssigned ? "Assigned by" : "Completed by"}{" "}
                  <span className="font-semibold text-gray-700">{toast.by || "—"}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
