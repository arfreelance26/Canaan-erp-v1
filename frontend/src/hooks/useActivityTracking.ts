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

async function flush(keepalive = false) {
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    await activityApi.sendBatch(batch, keepalive);
  } catch {
    /* dropped on purpose */
  }
}

/** Sentinel click label for the pagehide ping below — describeActivity (in
 * the Activity Log) renders it as its own sentence instead of the generic
 * "Clicked ..." phrasing. */
export const TAB_CLOSED_LABEL = "(left the page)";

function clickLabel(el: Element): string {
  const raw =
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    (el as HTMLElement).innerText ||
    "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 120) || "(unlabelled)";
}

/** A checkbox/radio/select has no innerText of its own — its meaning lives in
 * a <label>, not the element. Reads only the label's visible wording (never a
 * typed value), same privacy rule as the rest of this tracker. */
function fieldLabel(el: HTMLInputElement | HTMLSelectElement): string {
  if (el.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const text = lbl?.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  const wrapping = el.closest("label")?.textContent?.replace(/\s+/g, " ").trim();
  if (wrapping) return wrapping;
  return el.getAttribute("aria-label") || el.name || "(unlabelled)";
}

function installOnce() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // One listener for the whole app. Free-text inputs are never read — only a
  // fixed-choice element's own label/option text, never anything typed.
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as Element | null;
      const el = target?.closest?.("button, a, [role='button'], summary, input[type='checkbox'], input[type='radio']");
      if (!el || el.closest("[data-no-track]")) return;
      const route = routeTemplate(window.location.pathname);
      if (el instanceof HTMLInputElement) {
        const verb = el.type === "checkbox" ? (el.checked ? "Checked" : "Unchecked") : "Selected";
        push({ kind: "click", route, label: `${verb} "${fieldLabel(el)}"`.slice(0, 120) });
        return;
      }
      push({ kind: "click", route, label: clickLabel(el) });
    },
    true,
  );

  // <select> fires "change", not "click" — picking a filter/status value is a
  // real choice someone made, not just a dropdown opening.
  document.addEventListener(
    "change",
    (e) => {
      const el = e.target as Element | null;
      if (!(el instanceof HTMLSelectElement) || el.closest("[data-no-track]")) return;
      const chosen = el.options[el.selectedIndex]?.text?.trim() || el.value;
      push({
        kind: "click",
        route: routeTemplate(window.location.pathname),
        label: `Set "${fieldLabel(el)}" to "${chosen}"`.slice(0, 120),
      });
    },
    true,
  );

  window.setInterval(() => void flush(), FLUSH_MS);
  // A closed tab (or any other page-leaving navigation) is the one moment
  // that most needs a precise, un-stale timestamp — e.g. it's what an open
  // shift's eventual check-out time gets measured against (see backend's
  // last_activity_at). Push one fresh marker right here rather than relying
  // on whatever was last queued, which could be several minutes stale by now.
  window.addEventListener("pagehide", () => {
    push({ kind: "click", route: routeTemplate(window.location.pathname), label: TAB_CLOSED_LABEL });
    void flush(true);
  });
}

/** Tracks page views and clicks for the signed-in user. Mount once, in the app shell. */
export function useActivityTracking(enabled: boolean, pathname: string) {
  useEffect(() => {
    if (!enabled) return;
    installOnce();
    push({ kind: "view", route: routeTemplate(pathname) });
  }, [enabled, pathname]);
}
