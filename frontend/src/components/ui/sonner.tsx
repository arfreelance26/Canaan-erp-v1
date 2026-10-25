"use client";

import { useSyncExternalStore } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";

// shadcn/ui's toast component (Sonner), adapted to this app: <Toaster/> sits
// outside ThemeProvider in RootLayout, so the theme is read straight from the
// "dark" class ThemeContext puts on <html>.
const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
};
const isDark = () => document.documentElement.classList.contains("dark");

export function Toaster(props: ToasterProps) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      position="top-right"
      duration={6000}
      visibleToasts={5}
      closeButton
      className="toaster group"
      icons={{
        success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
        error: <XCircle className="h-4 w-4 text-red-500" />,
        warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
        info: <Info className="h-4 w-4 text-blue-500" />,
        loading: <Loader2 className="h-4 w-4 animate-spin text-gray-400" />,
      }}
      style={
        {
          "--normal-bg": dark ? "#141929" : "#ffffff",
          "--normal-text": "var(--color-gray-900)",
          "--normal-border": "var(--color-gray-200)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "w-80 shadow-lg",
          title: "text-sm font-semibold leading-snug",
          description: "!text-gray-500 text-xs leading-relaxed",
          success: "!border-emerald-200",
          error: "!border-red-200",
          warning: "!border-amber-200",
          info: "!border-blue-200",
          closeButton: "!bg-white !border-gray-200 !text-gray-400 hover:!text-gray-600",
        },
      }}
      {...props}
    />
  );
}
