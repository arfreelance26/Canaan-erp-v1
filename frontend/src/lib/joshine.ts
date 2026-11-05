"use client";

/**
 * Joshine — the in-app assistant's look and preferences.
 *
 * Joshine is drawn in components/joshine/ (JoshineFace, JoshinePet,
 * JoshineCreator). This file is the data: body shapes, eye expressions,
 * colours, size, preferences, and a small per-user store in localStorage.
 * The creator only shows the look (expression, shape, colour, size); name,
 * label, description and the preferences keep their defaults for the AI,
 * which comes later and will read them from here.
 */
import { useSyncExternalStore } from "react";

// ── Body shapes (400 × 400 viewBox) ─────────────────────────────────────────
// "joshine" is the original drawing; the rest share its soft, hand-made curve.
export const JOSHINE_SHAPES = {
  joshine:
    "M 355.34 200.00 C 358.28 245.16 326.43 327.33 287.03 350.74 C 247.62 374.14 158.95 365.57 118.91 340.45 C 78.88 315.32 42.26 238.93 46.81 200.00 C 51.36 161.07 109.11 126.87 146.21 106.84 C 183.31 86.80 234.55 64.27 269.40 79.80 C 304.25 95.32 352.40 154.84 355.34 200.00 Z",
  pebble:
    "M 360.00 215.00 C 358.81 260.14 338.25 288.15 304.65 319.65 C 271.05 351.15 245.44 363.52 200.00 365.00 C 154.56 366.48 122.30 358.22 88.28 326.72 C 54.26 295.22 36.81 260.74 38.00 215.00 C 39.19 169.26 59.91 139.59 93.93 108.93 C 127.95 78.27 154.56 69.89 200.00 69.00 C 245.44 68.11 276.71 74.03 310.31 104.69 C 343.91 135.35 361.19 169.86 360.00 215.00 Z",
  bean:
    "M 365.00 215.00 C 363.52 258.06 333.64 282.49 298.99 313.99 C 264.34 345.49 246.03 360.55 200.00 365.00 C 153.97 369.45 111.29 366.71 79.79 335.21 C 48.29 303.71 44.80 260.29 50.00 215.00 C 55.20 169.71 73.04 153.14 104.54 119.54 C 136.04 85.94 157.68 57.23 200.00 55.00 C 242.32 52.77 271.42 75.33 306.07 108.93 C 340.72 142.53 366.48 171.94 365.00 215.00 Z",
  drop:
    "M 350.00 215.00 C 347.77 261.78 337.57 289.57 306.07 321.07 C 274.57 352.57 244.55 365.00 200.00 365.00 C 155.45 365.00 125.43 352.57 93.93 321.07 C 62.43 289.57 52.23 261.78 50.00 215.00 C 47.77 168.22 51.83 136.55 83.33 98.33 C 114.83 60.11 151.00 33.00 200.00 33.00 C 249.00 33.00 285.17 60.11 316.67 98.33 C 348.17 136.55 352.23 168.22 350.00 215.00 Z",
  cloud:
    "M 359.20 230.97 C 355.71 265.80 336.49 263.14 313.65 296.75 C 290.80 330.37 299.73 351.03 267.82 365.42 C 235.92 379.80 226.34 359.43 186.02 354.30 C 145.71 349.17 134.98 365.32 106.57 344.89 C 78.15 324.45 90.06 309.14 72.37 272.55 C 54.69 235.96 32.33 233.35 35.82 198.53 C 39.32 163.70 61.75 165.59 86.35 133.25 C 110.95 100.90 102.33 83.53 134.23 69.14 C 166.14 54.75 173.45 72.72 213.98 75.70 C 254.51 78.68 267.94 60.62 296.35 81.06 C 324.77 101.49 311.91 119.97 327.63 157.45 C 343.34 194.93 362.69 196.15 359.20 230.97 Z",
  puff:
    "M 200.00 383.00 C 144.57 383.00 125.52 342.00 89.15 279.00 C 52.78 216.00 26.79 179.00 54.51 131.00 C 82.22 83.00 127.25 87.00 200.00 87.00 C 272.75 87.00 317.78 83.00 345.49 131.00 C 373.21 179.00 347.22 216.00 310.85 279.00 C 274.48 342.00 255.43 383.00 200.00 383.00 Z",
} as const;
export type JoshineShape = keyof typeof JOSHINE_SHAPES;
export const SHAPE_LABELS: Record<JoshineShape, string> = {
  joshine: "Joshine", pebble: "Pebble", bean: "Bean", drop: "Drop", cloud: "Cloud", puff: "Puff",
};

// ── Eyes ────────────────────────────────────────────────────────────────────
// Drawn by JoshineFace; the order here is the order around the creator ring.
export const JOSHINE_EXPRESSIONS = [
  "calm", "happy", "curious", "wink", "sparkle", "surprised", "focused",
  "love", "sleepy", "sideeye", "determined", "sad", "grumpy", "dots",
] as const;
export type JoshineExpression = (typeof JOSHINE_EXPRESSIONS)[number];
export const EXPRESSION_LABELS: Record<JoshineExpression, string> = {
  calm: "Calm", happy: "Happy", curious: "Curious", wink: "Wink", sparkle: "Bright",
  surprised: "Surprised", focused: "Focused", love: "Fond", sleepy: "Sleepy",
  sideeye: "Side-eye", determined: "Determined", sad: "Sad", grumpy: "Grumpy", dots: "Simple",
};

// ── Colours ─────────────────────────────────────────────────────────────────
// Body colours are data the user picks (like a chart series), not UI chrome.
export const JOSHINE_COLORS = [
  { name: "Sky", value: "#7fb2ff" },
  { name: "Navy", value: "#4f6fc4" },
  { name: "Lagoon", value: "#5cc2c0" },
  { name: "Sage", value: "#8fc79a" },
  { name: "Lime", value: "#bcd86a" },
  { name: "Sun", value: "#f5c95c" },
  { name: "Apricot", value: "#f6a574" },
  { name: "Coral", value: "#f08a8a" },
  { name: "Blossom", value: "#ef9ac6" },
  { name: "Lilac", value: "#b09cf2" },
] as const;

// ── Preferences ─────────────────────────────────────────────────────────────
export const VOICES = ["Friendly", "Professional", "Brief"] as const;
export const LANGUAGES = ["English", "Tamil", "Hindi", "Malayalam", "Kannada", "Telugu"] as const;

/** Size of the pet in the corner, in px. */
export const JOSHINE_SIZE = { min: 48, max: 140, step: 4, default: 76 } as const;

export type JoshineSettings = {
  name: string;
  label: string;
  description: string;
  color: string;
  shape: JoshineShape;
  expression: JoshineExpression;
  voice: (typeof VOICES)[number];
  language: (typeof LANGUAGES)[number];
  /** Tips and nudges about pending work, once the AI is in. */
  nudges: boolean;
  /** Eyes follow the cursor and blink. */
  lively: boolean;
  /** "Tea time, right?" at 11 AM and 4 PM (lib/greetings.ts teaTimeDue). */
  teaTime: boolean;
  /** Tucked into the corner, only the top peeking out. */
  tucked: boolean;
  /** Pet size in px, JOSHINE_SIZE.min–max. */
  size: number;
};

export const JOSHINE_DEFAULTS: JoshineSettings = {
  name: "Joshine",
  label: "Your assistant",
  description: "Helps you find trips, trucks and records, and keeps an eye on what needs your attention.",
  color: JOSHINE_COLORS[0].value,
  shape: "joshine",
  expression: "calm",
  voice: "Friendly",
  language: "English",
  nudges: true,
  lively: true,
  teaTime: true,
  tucked: false,
  size: JOSHINE_SIZE.default,
};

// ── Store: one record per signed-in user, in this browser ───────────────────
const keyFor = (userId: string | number | null | undefined) => `canaan.joshine.v1.${userId ?? "guest"}`;
const listeners = new Set<() => void>();
const cache = new Map<string, JoshineSettings>();

function read(key: string): JoshineSettings {
  const hit = cache.get(key);
  if (hit) return hit;
  let value = JOSHINE_DEFAULTS;
  try {
    const raw = localStorage.getItem(key);
    if (raw) value = { ...JOSHINE_DEFAULTS, ...(JSON.parse(raw) as Partial<JoshineSettings>) };
  } catch {
    /* a broken record falls back to the defaults */
  }
  if (!(value.shape in JOSHINE_SHAPES)) value = { ...value, shape: JOSHINE_DEFAULTS.shape };
  if (!JOSHINE_EXPRESSIONS.includes(value.expression)) value = { ...value, expression: JOSHINE_DEFAULTS.expression };
  if (!Number.isFinite(value.size)) value = { ...value, size: JOSHINE_SIZE.default };
  value = { ...value, size: Math.min(JOSHINE_SIZE.max, Math.max(JOSHINE_SIZE.min, value.size)) };
  cache.set(key, value);
  return value;
}

function write(key: string, value: JoshineSettings) {
  cache.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: keep it for this session */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Joshine's settings for this user, and a setter that saves as you go. */
export function useJoshine(userId: string | number | null | undefined) {
  const key = keyFor(userId);
  const settings = useSyncExternalStore(subscribe, () => read(key), () => JOSHINE_DEFAULTS);
  const update = (patch: Partial<JoshineSettings>) => write(key, { ...read(key), ...patch });
  const reset = () => write(key, { ...JOSHINE_DEFAULTS, tucked: read(key).tucked });
  return { settings, update, reset };
}
