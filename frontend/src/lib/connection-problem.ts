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

export type ConnectionStatus = { internet: boolean; server: boolean };

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

async function reachable(url: string, method: "GET" | "HEAD"): Promise<boolean> {
  try {
    const res = await fetch(url, { method, cache: "no-store", signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

/** The server's health check; when that fails, a file on the site's own host
 *  tells a dead internet connection from a dead server. */
export async function checkConnection(): Promise<ConnectionStatus> {
  if (!navigator.onLine) return { internet: false, server: false };
  if (await reachable(`${API_URL}/`, "GET")) return { internet: true, server: true };
  return { internet: await reachable("/speedtest.bin", "HEAD"), server: false };
}
