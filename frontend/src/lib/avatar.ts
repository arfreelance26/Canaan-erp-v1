import { useEffect, useMemo, useSyncExternalStore } from "react";
import type * as Collection from "@dicebear/collection";

/**
 * Generated profile pictures (DiceBear, drawn in the browser — nothing is sent
 * anywhere). The one place avatar styles and options live:
 *
 *   - people (customers, vendors, drivers, staff, chat members) without an
 *     uploaded photo get an illustrated face ("notionists");
 *   - groups, and records set to No Characters, get abstract "shapes".
 *
 * The same look and seed always draw the same picture.
 *
 * DiceBear is loaded on first use (lib/avatar-kit.ts, its own chunk), not
 * with every page; useAvatarSvg() returns null until it has arrived and then
 * re-renders, so components show a plain placeholder for that moment.
 */

export type AvatarLook = "notionists" | "shapes";

// DiceBear only takes hex colours, so it draws with these placeholders and
// toTheme() swaps each for a CSS variable from src/styles/brand.css (the same
// trick the unDraw illustrations use). That keeps every avatar on the brand
// palette and lets it flip with the light / dark theme.
const PLACEHOLDER: Record<string, string> = {
  "#a10001": "var(--avatar-bg-1)",
  "#a10002": "var(--avatar-bg-2)",
  "#a10003": "var(--avatar-bg-3)",
  "#b10001": "var(--avatar-shape-1)",
  "#b10002": "var(--avatar-shape-2)",
  "#b10003": "var(--avatar-shape-3)",
  "#000": "var(--avatar-ink)",
  "#000000": "var(--avatar-ink)",
  "#fff": "var(--avatar-face)",
  "#ffffff": "var(--avatar-face)",
};
const BACKGROUNDS = ["a10001", "a10002", "a10003"];
const toTheme = (svg: string) =>
  svg.replace(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi, (hex) => PLACEHOLDER[hex.toLowerCase()] ?? hex);

type Look = Collection.notionists.Options;
const variants = <T,>(from: number, to: number, skip: number[]) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .filter((n) => !skip.includes(n))
    .map((n) => `variant${String(n).padStart(2, "0")}` as T);

// Hand-picked for a professional look: no spiky or bleached hair, hats or
// space buns; no swirly, dotted or lightning-bolt shirts; only clear glasses.
// Faces are kept tidy: no waving or pointing hands, no shirt icons, fewer
// beards and glasses.
const HAIR = variants<NonNullable<Look["hair"]>[number]>(1, 63, [14, 42, 50, 51, 53, 59]);
const BODY = variants<NonNullable<Look["body"]>[number]>(1, 25, [12, 15, 18, 22, 23, 24]);
const GLASSES: Look["glasses"] = ["variant03", "variant08", "variant11"];

const cache = new Map<string, string>();

// ── On-demand loading ───────────────────────────────────────────────────────
type Kit = typeof import("./avatar-kit");
let kit: Kit | null = null;
let loading: Promise<Kit> | null = null;
const listeners = new Set<() => void>();

/** Start loading DiceBear (once); resolves when avatars can be drawn. */
export function loadAvatarKit(): Promise<Kit> {
  if (kit) return Promise.resolve(kit);
  loading ??= import("./avatar-kit").then((m) => {
    kit = m;
    listeners.forEach((l) => l());
    return m;
  });
  return loading;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * The avatar's SVG markup, or null while DiceBear is still loading (or when
 * `enabled` is false, e.g. a photo is shown instead).
 */
export function useAvatarSvg(seed: string, look: AvatarLook = "notionists", enabled = true): string | null {
  const ready = useSyncExternalStore(subscribe, () => kit !== null, () => false);
  useEffect(() => {
    if (enabled && !kit) void loadAvatarKit();
  }, [enabled]);
  return useMemo(() => (enabled && ready ? avatarSvg(seed, look) : null), [enabled, ready, seed, look]);
}

/** The SVG markup for one avatar (memoised per look + seed); null until loaded. */
function avatarSvg(seed: string, look: AvatarLook): string | null {
  if (!kit) return null;
  const { createAvatar, notionists, shapes } = kit;
  const key = `${look}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const svg =
    look === "shapes"
      ? createAvatar(shapes, {
          seed,
          backgroundColor: BACKGROUNDS,
          backgroundType: ["solid"],
          shape1Color: ["b10001"],
          shape2Color: ["b10002"],
          shape3Color: ["b10003"],
        }).toString()
      : createAvatar(notionists, {
          seed,
          backgroundColor: BACKGROUNDS,
          backgroundType: ["solid"],
          hair: HAIR,
          body: BODY,
          glasses: GLASSES,
          gestureProbability: 0,
          bodyIconProbability: 0,
          beardProbability: 15,
          glassesProbability: 25,
        }).toString();
  const themed = toTheme(svg);
  cache.set(key, themed);
  return themed;
}

/** A new random picture for Shuffle; saved with the record (avatar_seed). */
export function newAvatarSeed(): string {
  return Math.random().toString(36).slice(2, 12);
}
