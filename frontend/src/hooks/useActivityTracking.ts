"use client";

import { useEffect } from "react";
import { activityApi } from "@/lib/api";

// Page views and clicks are queued in memory and sent in batches, so the app never
// waits on tracking. A failed batch is dropped: tracking must never disturb the user.
type Pending = { kind: "view" | "click"; route: string; label?: string };

const FLUSH_MS = 10_000;
const MAX_QUEUE = 500;
const MAX_BATCH = 200;

const queue: Pending[] = [];
let installed = false;

// /trips/1438/invoice -> /trips/{id}/invoice (matches the server's templating).
export function routeTemplate(path: string): string {
  return path
    .replace(/\/\d+(?=\/|$)/g, "/{id}")
    .replace(/\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?=\/|$)/g, "/{id}");
}

function push(item: Pending) {
  if (queue.length < MAX_QUEUE) queue.push(item);
}

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    await activityApi.sendBatch(batch);
  } catch {
    /* dropped on purpose */
  }
}

function clickLabel(el: Element): string {
  const raw =
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    (el as HTMLElement).innerText ||
    "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 120) || "(unlabelled)";
}

function installOnce() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // One listener for the whole app. Inputs are never read, so typed values are never recorded.
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as Element | null;
      const el = target?.closest?.("button, a, [role='button'], summary");
      if (!el || el.closest("[data-no-track]")) return;
      push({ kind: "click", route: routeTemplate(window.location.pathname), label: clickLabel(el) });
    },
    true,
  );

  window.setInterval(() => void flush(), FLUSH_MS);
  window.addEventListener("pagehide", () => void flush());
}

/** Tracks page views and clicks for the signed-in user. Mount once, in the app shell. */
export function useActivityTracking(enabled: boolean, pathname: string) {
  useEffect(() => {
    if (!enabled) return;
    installOnce();
    push({ kind: "view", route: routeTemplate(pathname) });
  }, [enabled, pathname]);
}
