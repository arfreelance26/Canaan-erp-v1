"use client";

/**
 * Stale-While-Revalidate (SWR) cache for GET API requests.
 *
 * Why: on slow connections the app blocked on every `Promise.all([...list()])`
 * before it could paint, and every WebSocket/autorefresh tick re-hit the
 * network (and therefore the DB) even when nothing had changed. This layer:
 *
 *   1. Serves a persisted cache instantly (localStorage) so pages paint
 *      immediately after a reload, even offline / on a slow link.
 *   2. Skips the network entirely inside a short "fresh" window — the biggest
 *      win for "don't hit the DB all the time": rapid refetches within
 *      FRESH_MS return the cached value with zero requests.
 *   3. De-duplicates concurrent identical GETs into a single in-flight request.
 *   4. Revalidates stale entries in the background and, when the data actually
 *      changed, notifies subscribers (useAutoRefresh) to re-render with fresh data.
 *   5. Invalidates affected entries on any mutation (POST/PUT/PATCH/DELETE).
 */

type Entry = { data: unknown; ts: number };

const LS_PREFIX = "canaan_cache:";

// Within this window a GET is served from cache with NO network call at all.
// Keep it short so realtime feel is preserved while killing redundant bursts.
export const FRESH_MS = 12_000;
// Beyond this, a persisted entry is considered too old to show and is fetched fresh.
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Cap how many entries we persist to avoid blowing the localStorage quota.
const MAX_LS_ENTRIES = 120;

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const revalListeners = new Set<() => void>();

function lsKey(key: string) {
  return LS_PREFIX + key;
}

function readLS(key: string): Entry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lsKey(key));
    return raw ? (JSON.parse(raw) as Entry) : null;
  } catch {
    return null;
  }
}

function writeLS(key: string, entry: Entry) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(key), JSON.stringify(entry));
  } catch {
    // Quota hit — evict the oldest half of our cache entries and retry once.
    evictOldest();
    try {
      window.localStorage.setItem(lsKey(key), JSON.stringify(entry));
    } catch {
      /* give up silently; in-memory cache still works */
    }
  }
}

function evictOldest() {
  if (typeof window === "undefined") return;
  const entries: Array<{ k: string; ts: number }> = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k || !k.startsWith(LS_PREFIX)) continue;
    try {
      const e = JSON.parse(window.localStorage.getItem(k) || "{}") as Entry;
      entries.push({ k, ts: e.ts ?? 0 });
    } catch {
      entries.push({ k, ts: 0 });
    }
  }
  entries.sort((a, b) => a.ts - b.ts);
  const removeCount = Math.max(entries.length - Math.floor(MAX_LS_ENTRIES / 2), Math.ceil(entries.length / 2));
  for (let i = 0; i < removeCount; i++) window.localStorage.removeItem(entries[i].k);
}

/** Retrieve a cached entry (in-memory first, then persisted). Returns null if absent/expired. */
export function cacheGet(key: string): Entry | null {
  let entry = mem.get(key);
  if (!entry) {
    const persisted = readLS(key);
    if (persisted) {
      mem.set(key, persisted);
      entry = persisted;
    }
  }
  if (!entry) return null;
  if (Date.now() - entry.ts > MAX_AGE_MS) return null;
  return entry;
}

/** Store a value; returns true if the value actually changed vs. what was cached. */
export function cacheSet(key: string, data: unknown): boolean {
  const prev = mem.get(key);
  const changed = !prev || JSON.stringify(prev.data) !== JSON.stringify(data);
  const entry: Entry = { data, ts: Date.now() };
  mem.set(key, entry);
  writeLS(key, entry);
  return changed;
}

/** Deduplicate concurrent identical GETs into one in-flight promise. */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * Invalidate cache entries touched by a mutation on `path`.
 * Clears everything sharing the top-level resource segment (e.g. a POST to
 * "/trips/123/status" drops all "/trips..." GETs) so the next read is fresh.
 */
export function cacheInvalidate(path: string) {
  const seg = "/" + (path.replace(/^\//, "").split(/[/?]/)[0] ?? "");
  const drop = (k: string) => k === seg || k.startsWith(seg + "/") || k.startsWith(seg + "?");
  for (const k of Array.from(mem.keys())) if (drop(k)) mem.delete(k);
  if (typeof window !== "undefined") {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const raw = window.localStorage.key(i);
      if (raw && raw.startsWith(LS_PREFIX) && drop(raw.slice(LS_PREFIX.length))) {
        window.localStorage.removeItem(raw);
      }
    }
  }
}

/** Wipe the entire cache (call on logout / user switch). */
export function cacheClear() {
  mem.clear();
  inflight.clear();
  if (typeof window === "undefined") return;
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(LS_PREFIX)) window.localStorage.removeItem(k);
  }
}

/** Subscribe to background-revalidation events (data changed). Returns unsubscribe. */
export function onRevalidated(cb: () => void): () => void {
  revalListeners.add(cb);
  return () => revalListeners.delete(cb);
}

export function emitRevalidated() {
  revalListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* one bad listener shouldn't break the rest */
    }
  });
}
