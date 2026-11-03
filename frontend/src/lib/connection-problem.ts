// What failed when a request couldn't finish. showError() and the download
// buttons report here; ProblemCardHost shows the card.

export const UNREACHABLE_MESSAGE = "We couldn't reach the server. Please check your internet and try again.";
export const DOWNLOAD_TIMEOUT_MESSAGE = "This record is taking too long. Try a shorter date range, or try again.";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const CHECK_TIMEOUT_MS = 8_000;
const EVENT = "canaan:connection-problem";

export type Problem = {
  kind: "connection" | "timeout" | "server";
  /** ERR-7F3A — also in the server log (backend: _unexpected_error). */
  reference?: string;
  /** Only for safe-to-repeat actions: a repeated upload could save twice. */
  onRetry?: () => void;
};

/** "slow": replies came back, or timed out, too slowly for a request to
 *  finish. `server` is null when a slow link means we can't tell. */
export type ConnectionStatus = {
  internet: "ok" | "slow" | "offline";
  server: boolean | null;
};

export function problemFromMessage(message: string): Problem | null {
  if (message === UNREACHABLE_MESSAGE) return { kind: "connection" };
  if (message === DOWNLOAD_TIMEOUT_MESSAGE) return { kind: "timeout" };
  const reference = message.match(/Reference: (ERR-[0-9A-F]{4})/)?.[1];
  return reference ? { kind: "server", reference } : null;
}

export function reportProblem(problem: Problem): void {
  window.dispatchEvent(new CustomEvent<Problem>(EVENT, { detail: problem }));
}

export function onProblem(listener: (problem: Problem) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<Problem>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

// Same line as the Topbar pill (useConnectionQuality SLOW_MS): a reply slower
// than this reads as a slow internet, not a slow server.
const SLOW_REPLY_MS = 1_000;

type Probe = { ok: boolean; ms: number; timedOut: boolean };

async function probe(url: string, method: "GET" | "HEAD"): Promise<Probe> {
  const started = performance.now();
  try {
    const res = await fetch(url, { method, cache: "no-store", signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    return { ok: res.ok, ms: performance.now() - started, timedOut: false };
  } catch (err) {
    const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, ms: performance.now() - started, timedOut };
  }
}

/** 2G / slow-2G as the browser reports it (Chrome / Edge / Electron only). */
function deviceSaysSlow(): boolean {
  const type = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
  return type === "slow-2g" || type === "2g";
}

/**
 * Which side a failed request broke on. A server that doesn't answer in time
 * is almost always a slow or shaky internet connection, so only a server that
 * refuses twice, quickly, on a connection that is otherwise fine counts as
 * "server down".
 */
export async function checkConnection(): Promise<ConnectionStatus> {
  if (!navigator.onLine) return { internet: "offline", server: null };
  const slowDevice = deviceSaysSlow();
  const healthUrl = `${API_URL}/`;

  const first = await probe(healthUrl, "GET");
  if (first.ok) return { internet: slowDevice || first.ms > SLOW_REPLY_MS ? "slow" : "ok", server: true };
  if (first.timedOut || slowDevice) return { internet: "slow", server: null };

  // Failed fast. A file from the app's own host shows whether this device's
  // connection works at all, then ask the server once more: on a shaky link a
  // dropped connection fails fast too.
  const local = await probe("/speedtest.bin", "HEAD");
  if (!local.ok) return { internet: local.timedOut ? "slow" : "offline", server: null };
  const second = await probe(healthUrl, "GET");
  if (second.ok) return { internet: "slow", server: true };
  if (second.timedOut) return { internet: "slow", server: null };
  return { internet: local.ms > SLOW_REPLY_MS ? "slow" : "ok", server: false };
}
