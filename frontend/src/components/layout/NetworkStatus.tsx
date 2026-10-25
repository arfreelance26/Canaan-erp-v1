"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloudOff, Wifi, WifiLow, WifiOff, WifiZero, X } from "lucide-react";
import { showToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { type ConnectionQuality, useConnectionQuality } from "@/hooks/useConnectionQuality";

const LOOK: Record<ConnectionQuality, { label: string; icon: typeof Wifi; tone: string; dot: string }> = {
  checking:    { label: "Checking…", icon: Wifi,     tone: "text-gray-400",    dot: "bg-gray-300" },
  good:        { label: "Good",      icon: Wifi,     tone: "text-emerald-500", dot: "bg-emerald-500" },
  fair:        { label: "Fair",      icon: WifiLow,  tone: "text-amber-500",   dot: "bg-amber-500" },
  slow:        { label: "Slow",      icon: WifiZero, tone: "text-red-500",     dot: "bg-red-500" },
  offline:     { label: "Offline",   icon: WifiOff,  tone: "text-red-500",     dot: "bg-red-500 animate-pulse" },
  unreachable: { label: "No server", icon: CloudOff, tone: "text-red-500",     dot: "bg-red-500 animate-pulse" },
};

function OfflineBanner({ unreachable, onDismiss }: { unreachable: boolean; onDismiss: () => void }) {
  const Icon = unreachable ? CloudOff : WifiOff;
  return createPortal(
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 bg-red-600 px-4 py-3 text-white shadow-lg"
    >
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 animate-pulse" />
        <div>
          <p className="text-sm font-bold leading-tight">
            {unreachable ? "Can't reach the server" : "No internet connection"}
          </p>
          <p className="text-xs font-medium text-red-100">
            {unreachable
              ? "Your internet is on, but the ERP server isn't answering. Retrying…"
              : "You are currently offline. Please check your network and try again."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 hover:bg-red-700 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>,
    document.body
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-semibold tabular-nums text-gray-800">{children}</span>
    </div>
  );
}

/** Tiny line chart of the last 20 results. */
function Spark({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return <div className="h-8 rounded bg-gray-100" />;
  const max = Math.max(...values) || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - (v / max) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={cn("h-8 w-full", className)} aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function NetworkStatus() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Fast checks and the Mbps test run only while the panel is open.
  const net = useConnectionQuality(open);
  const look = LOOK[net.quality];
  const Icon = look.icon;
  const down = net.quality === "offline" || net.quality === "unreachable";
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Bring the banner back on every new outage, and say so when it's over.
  const wasDown = useRef(false);
  useEffect(() => {
    if (down) {
      if (!wasDown.current) setBannerDismissed(false);
      wasDown.current = true;
    } else if (wasDown.current && net.quality !== "checking") {
      wasDown.current = false;
      showToast("Your internet connection has been restored.", "success", "Back online");
    }
  }, [down, net.quality]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref} data-no-track>
      {down && !bannerDismissed && (
        <OfflineBanner unreachable={net.quality === "unreachable"} onDismiss={() => setBannerDismissed(true)} />
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Internet status: ${look.label}`}
        title={`Internet: ${look.label}${net.latency != null && !down ? ` · ${net.latency} ms` : ""}`}
        className="group relative flex h-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4 focus:ring-blue-500/10 px-2.5 gap-1.5"
      >
        <Icon className={cn("h-4 w-4 transition-transform duration-300 group-hover:scale-110", look.tone, down && "animate-pulse")} />
        <span className={cn("hidden whitespace-nowrap text-[12px] font-semibold lg:inline", look.tone)}>
          {look.label}
          {net.latency != null && !down && <span className="hidden font-medium tabular-nums text-gray-500 xl:inline"> · {net.latency} ms</span>}
        </span>
        <span className={cn("h-1.5 w-1.5 rounded-full", look.dot)} />
      </button>

      {open && (
        <div className="absolute right-0 z-[100] mt-3 w-72 origin-top-right rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_10px_40px_rgba(0,0,0,0.12)]">
          <div className="mb-2 flex items-center gap-2">
            <Icon className={cn("h-4 w-4", look.tone)} />
            <p className="text-sm font-semibold text-gray-800">Connection: {look.label}</p>
            {!down && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
              </span>
            )}
          </div>

          <div className="divide-y divide-gray-100">
            <Row label="Internet">{net.online ? "Online" : "Offline"}</Row>
            <Row label="Download speed">{net.mbps != null ? `${net.mbps} Mbps` : down ? "—" : "measuring…"}</Row>
            <Row label="Server reply">
              {net.quality === "unreachable" ? "Not reachable" : net.lastReply != null ? `${net.lastReply} ms` : "checking…"}
            </Row>
            <Row label="Jitter">{net.jitter != null ? `± ${net.jitter} ms` : "—"}</Row>
            {net.networkType && (
              <Row label="Network">{net.networkType.toUpperCase()}{net.saveData ? " · data saver" : ""}</Row>
            )}
            <Row label="Last check">{net.checkedAt ? new Date(net.checkedAt).toLocaleTimeString() : "—"}</Row>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-500">
            <div className="space-y-1"><p>Mbps</p><Spark values={net.mbpsHistory} className="text-blue-600" /></div>
            <div className="space-y-1"><p>Reply ms</p><Spark values={net.history} className={look.tone} /></div>
          </div>
          <p className="mt-3 text-[11px] text-gray-400">Speed is tested only while this panel is open.</p>
        </div>
      )}
    </div>
  );
}
