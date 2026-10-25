"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useNetwork } from "react-haiku";

/**
 * Live connection quality for the Topbar's internet status pill.
 *
 * - Server reply: pings the API's public "/" health check (tiny JSON, no DB)
 *   every 10s, or every 3s while the details panel is open. Skipped while the
 *   tab is hidden; re-checked as soon as it's shown again or goes online.
 * - Download speed: fetches /speedtest.bin (256 KB of random bytes, so it
 *   can't be compressed) from the frontend host — ONLY while the panel is
 *   open, since every test downloads 256 KB.
 * - Quality uses the median of the last 3 replies so one slow request
 *   doesn't flip the colour.
 */

export type ConnectionQuality = "checking" | "good" | "fair" | "slow" | "offline" | "unreachable";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const HEALTH_URL = `${API_URL}/`;
const SPEED_FILE_URL = "/speedtest.bin";

const BACKGROUND_MS = 10_000;
const LIVE_MS = 3_000;
const TIMEOUT_MS = 10_000;
const FAIR_MS = 400;
const SLOW_MS = 1000;
const HISTORY = 20;
const SMOOTH = 3;
// Two failed checks in a row before "Can't reach the server" — one dropped
// request on a shaky mobile link shouldn't flash a red banner.
const FAILS_FOR_UNREACHABLE = 2;

interface NetworkInformation extends EventTarget {
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  downlink?: number;
  saveData?: boolean;
}

// Network Information API — Chrome/Edge/Android only, so it's optional.
const connection = () =>
  typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { connection?: NetworkInformation }).connection;
const subscribe = (cb: () => void) => {
  const c = connection();
  c?.addEventListener("change", cb);
  return () => c?.removeEventListener("change", cb);
};
// A string, not an object — a new object on every read would make React
// re-render forever.
const snapshot = () => {
  const c = connection();
  return c ? JSON.stringify({ type: c.effectiveType, downlink: c.downlink, saveData: c.saveData }) : "";
};

const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : null);

export function useConnectionQuality(live = false) {
  const deviceOnline = useNetwork();
  const info = useSyncExternalStore(subscribe, snapshot, () => "");
  const [samples, setSamples] = useState<number[]>([]);
  const [speeds, setSpeeds] = useState<number[]>([]);
  const [fails, setFails] = useState(0);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    let stopped = false;
    const visible = () => document.visibilityState === "visible";

    const check = async () => {
      if (!visible()) return;
      const t0 = performance.now();
      try {
        const r = await fetch(HEALTH_URL, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!r.ok) throw new Error(String(r.status));
        if (stopped) return;
        setSamples((s) => [...s, Math.round(performance.now() - t0)].slice(-HISTORY));
        setFails(0);
      } catch {
        if (stopped) return;
        setFails((n) => n + 1);
      }
      setCheckedAt(Date.now());
    };

    const measure = async () => {
      if (!live || !visible()) return;
      const t0 = performance.now();
      try {
        const r = await fetch(`${SPEED_FILE_URL}?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
        const bytes = (await r.arrayBuffer()).byteLength;
        const secs = (performance.now() - t0) / 1000;
        if (stopped || !r.ok || !bytes) return;
        setSpeeds((s) => [...s, Math.round(((bytes * 8) / secs / 1e6) * 10) / 10].slice(-HISTORY));
      } catch {
        /* the health check reports a dead connection */
      }
    };

    let busy = false;
    const tick = async () => {
      if (busy) return; // a slow check is still running — don't stack them
      busy = true;
      try {
        await check();
        await measure(); // one after the other, so they don't compete for bandwidth
      } finally {
        busy = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), live ? LIVE_MS : BACKGROUND_MS);
    const wake = () => { if (visible()) void tick(); };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [live]);

  return useMemo(() => {
    const net = info ? (JSON.parse(info) as { type?: string; downlink?: number; saveData?: boolean }) : {};
    const reachable = fails < FAILS_FOR_UNREACHABLE;
    const latency = median(samples.slice(-SMOOTH));
    const gaps = samples.slice(1).map((ms, i) => Math.abs(ms - samples[i]));
    const jitter = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
    let quality: ConnectionQuality;
    if (!deviceOnline) quality = "offline";
    else if (!reachable) quality = "unreachable";
    else if (latency == null) quality = "checking";
    else if (net.type === "slow-2g" || net.type === "2g" || latency > SLOW_MS) quality = "slow";
    else if (latency > FAIR_MS) quality = "fair";
    else quality = "good";
    return {
      quality,
      online: deviceOnline && reachable,
      latency,                               // median of the last 3 (pill + colour)
      lastReply: samples.at(-1) ?? null,     // latest (panel)
      history: samples,
      jitter,
      mbps: speeds.at(-1) ?? null,
      mbpsHistory: speeds,
      checkedAt,
      networkType: net.type ?? null,
      saveData: !!net.saveData,
    };
  }, [deviceOnline, fails, samples, speeds, info, checkedAt]);
}
