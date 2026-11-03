"use client";

import { useSyncExternalStore } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  RiAlertLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiInformationLine,
  RiLoader4Line,
} from "@remixicon/react";

/**
 * App-wide toasts (sonner). Mounted once in app/layout.tsx; trigger them with
 * `notify` from "@/lib/feedback".
 *
 * Quiet surface + hairline from the BoardUI tokens; only the icon carries the
 * status color. <Toaster/> sits outside ThemeProvider, so the theme is read
 * from the `dark` class ThemeContext puts on <html>.
 */
const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
};
const isDark = () => document.documentElement.classList.contains("dark");

const ICON = "size-4";

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
        success: <RiCheckboxCircleLine className={`${ICON} text-notification-success-foreground`} aria-hidden />,
        error: <RiCloseCircleLine className={`${ICON} text-foreground-icon-error`} aria-hidden />,
        warning: <RiAlertLine className={`${ICON} text-status-yellow-text`} aria-hidden />,
        info: <RiInformationLine className={`${ICON} text-foreground-icon-secondary`} aria-hidden />,
        loading: <RiLoader4Line className={`${ICON} animate-spin text-foreground-icon-tertiary`} aria-hidden />,
      }}
      style={
        {
          "--normal-bg": "var(--color-background-primary-default)",
          "--normal-text": "var(--color-text-primary)",
          "--normal-border": "var(--color-separator-border)",
          "--border-radius": "0.75rem",
          zIndex: "var(--z-toast)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "w-80 gap-3 shadow-lg",
          title: "text-body-medium text-text-primary",
          description: "!text-text-secondary text-caption-1-regular",
          closeButton:
            "!bg-background-primary-default !border-separator-border !text-foreground-icon-tertiary hover:!text-foreground-icon-primary",
        },
      }}
      {...props}
    />
  );
}
