"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNetwork } from "react-haiku";
import { Wifi, WifiOff, X } from "lucide-react";
import { showToast } from "@/lib/swal";

function OfflineBanner({ onDismiss }: { onDismiss: () => void }) {
  return createPortal(
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 bg-red-600 px-4 py-3 text-white shadow-lg"
    >
      <div className="flex items-center gap-3">
        <WifiOff className="h-5 w-5 shrink-0 animate-pulse" />
        <div>
          <p className="text-sm font-bold leading-tight">No internet connection</p>
          <p className="text-xs font-medium text-red-100">
            You are currently offline. Please check your network and try again.
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

export function NetworkStatus() {
  const isOnline = useNetwork();
  const prevOnline = useRef<boolean | null>(null);
  const [showLabel, setShowLabel] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (prevOnline.current === null) {
      prevOnline.current = isOnline;
      if (!isOnline) setBannerDismissed(false);
      return;
    }
    if (prevOnline.current !== isOnline) {
      prevOnline.current = isOnline;
      if (isOnline) {
        setBannerDismissed(false);
        showToast("Your internet connection has been restored.", "success", "Back online");
      } else {
        setBannerDismissed(false);
      }
    }
  }, [isOnline]);

  return (
    <>
      {!isOnline && !bannerDismissed && (
        <OfflineBanner onDismiss={() => setBannerDismissed(true)} />
      )}

      <button
        type="button"
        onClick={() => setShowLabel((v) => !v)}
        title={isOnline ? "Connected" : "No internet connection"}
        className="group relative flex h-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] focus:outline-none focus:ring-4 focus:ring-blue-500/10 px-2.5 gap-1.5"
      >
        {isOnline ? (
          <Wifi className="h-4 w-4 text-emerald-500 transition-transform duration-300 group-hover:scale-110" />
        ) : (
          <WifiOff className="h-4 w-4 text-red-500 animate-pulse" />
        )}
        <span
          className={`text-[12px] font-semibold transition-all duration-200 overflow-hidden whitespace-nowrap ${
            showLabel ? "max-w-[60px] opacity-100" : "max-w-0 opacity-0"
          } ${isOnline ? "text-emerald-600" : "text-red-600"}`}
        >
          {isOnline ? "Online" : "Offline"}
        </span>
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isOnline ? "bg-emerald-500" : "bg-red-500 animate-pulse"
          }`}
        />
      </button>
    </>
  );
}
