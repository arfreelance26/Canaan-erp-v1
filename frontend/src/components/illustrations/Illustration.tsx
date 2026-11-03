"use client";

import { useEffect, useSyncExternalStore } from "react";
import { cx } from "@/utils/cx";
import type { IllustrationName } from "./assets";

type IllustrationProps = {
  name: IllustrationName;
  className?: string;
};

// The SVG art (./assets.ts, ~136 KB) loads on first use in its own chunk
// instead of shipping with every page; the app-wide problem card alone used to
// pull it in. Until it arrives the illustration keeps its size, empty.
type Art = typeof import("./assets").ILLUSTRATIONS;
let art: Art | null = null;
let loading: Promise<Art> | null = null;
const listeners = new Set<() => void>();

function loadArt(): Promise<Art> {
  loading ??= import("./assets").then((m) => {
    art = m.ILLUSTRATIONS;
    listeners.forEach((l) => l());
    return art;
  });
  return loading;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Theme-aware unDraw illustration. Decorative (aria-hidden): the text next to
 * it carries the meaning. Use for empty states, errors, login, onboarding;
 * never as decoration on working screens.
 *
 *   <Illustration name="no-data" className="h-32" />
 */
export function Illustration({ name, className }: IllustrationProps) {
  const ready = useSyncExternalStore(subscribe, () => art !== null, () => false);
  useEffect(() => {
    if (!art) void loadArt();
  }, []);

  return (
    <span
      aria-hidden
      className={cx("inline-flex [&>svg]:h-full [&>svg]:w-auto", className)}
      // Local, sanitised SVG generated into ./assets.ts (no scripts, no handlers).
      dangerouslySetInnerHTML={{ __html: ready && art ? art[name] : "" }}
    />
  );
}

export type { IllustrationName };
