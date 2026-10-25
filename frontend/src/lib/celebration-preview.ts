/**
 * Celebrations Management → Preview. An Admin can pretend "today" is any date
 * (and/or that it's their own birthday) to see that day's decorations on THEIR
 * screen only: kept in this browser's localStorage and sent as ?preview=…
 * on the celebration requests, which the server honours for Admin only.
 */
export type CelebrationPreview = { date?: string; birthday?: boolean; label?: string };

const KEY = "erp_celebration_preview";
export const PREVIEW_EVENT = "erp-celebration-preview";

export function getPreview(): CelebrationPreview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as CelebrationPreview) : null;
    return p && (p.date || p.birthday) ? p : null;
  } catch {
    return null;
  }
}

export function setPreview(p: CelebrationPreview | null) {
  try {
    if (p && (p.date || p.birthday)) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(PREVIEW_EVENT));
}

/** "?preview=2026-12-25&preview_birthday=1" (or "") for the celebration requests. */
export function previewQuery(): string {
  const p = getPreview();
  if (!p) return "";
  const q = new URLSearchParams();
  if (p.date) q.set("preview", p.date);
  if (p.birthday) q.set("preview_birthday", "1");
  return `?${q.toString()}`;
}
