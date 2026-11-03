/**
 * Toast notifications (sonner, rendered by <Toaster/> in the root layout).
 *
 *   notify.success("Trip saved")
 *   notify.error("Couldn't save the trip", { description: err.message })
 *
 * Success and info dismiss themselves; errors stay until closed, so a message
 * isn't missed. Connection and server failures go to the checking card
 * (<ProblemCardHost/>) instead of a toast.
 */
import { createElement } from "react";
import { toast } from "sonner";
import { RiMessage3Line } from "@remixicon/react";
import { problemFromMessage, reportProblem } from "@/lib/connection-problem";

export type NotifyOptions = {
  description?: string;
  /** Milliseconds before auto-dismiss. `Infinity` keeps it until closed. */
  duration?: number;
};

const SUCCESS_MS = 4000;

export const notify = {
  success(title: string, options: NotifyOptions = {}) {
    toast.success(title, { duration: SUCCESS_MS, ...options });
  },
  info(title: string, options: NotifyOptions = {}) {
    toast.info(title, options);
  },
  warning(title: string, options: NotifyOptions = {}) {
    toast.warning(title, options);
  },
  error(title: string, options: NotifyOptions = {}) {
    const problem = problemFromMessage(options.description ?? title);
    if (problem) {
      reportProblem(problem);
      return;
    }
    toast.error(title, { duration: Infinity, ...options });
  },
  /** Chat message arrived: neutral toast with the chat icon. */
  chat(title: string, options: NotifyOptions = {}) {
    toast(title, {
      ...options,
      icon: createElement(RiMessage3Line, { className: "size-4 text-foreground-icon-secondary", "aria-hidden": true }),
    });
  },
};

/* -------------------------------------------------------------------------- */
/*  Legacy-shaped helpers (former SweetAlert API)                              */
/*  `showX(message, title?)`: the message is the toast text; a custom title    */
/*  becomes the heading with the message under it. The old generic defaults    */
/*  ("Success", "Error", "Info") are dropped — the icon already says that.     */
/* -------------------------------------------------------------------------- */

type Level = "success" | "info" | "warning" | "error";
const GENERIC_TITLES = new Set(["Success", "Error", "Info", "Warning"]);

function legacy(level: Level, message: string, title?: string, duration?: number) {
  const withDuration = duration != null ? { duration } : {};
  if (title && !GENERIC_TITLES.has(title)) {
    notify[level](title, { description: message, ...withDuration });
  } else {
    notify[level](message, withDuration);
  }
}

export async function showSuccess(message: string, title?: string): Promise<void> {
  legacy("success", message, title);
}

export async function showError(message: string, title?: string): Promise<void> {
  legacy("error", message, title);
}

export async function showInfo(message: string, title?: string): Promise<void> {
  legacy("info", message, title);
}

/** Non-blocking toast for realtime events. `durationMs` overrides the default. */
export function showToast(
  message: string,
  icon: Level | "chat" = "info",
  title?: string,
  durationMs?: number,
): void {
  if (icon === "chat") {
    notify.chat(title ?? message, {
      description: title ? message : undefined,
      ...(durationMs != null ? { duration: durationMs } : {}),
    });
    return;
  }
  // showToast titles are always meaningful (never the generic defaults).
  const withDuration = durationMs != null ? { duration: durationMs } : {};
  if (title) notify[icon](title, { description: message, ...withDuration });
  else notify[icon](message, withDuration);
}
