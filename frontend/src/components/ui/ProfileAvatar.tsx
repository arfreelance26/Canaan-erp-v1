"use client";

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import * as notionists from "@dicebear/notionists";
import * as shapes from "@dicebear/shapes";
import { cn } from "@/lib/utils";

// Soft pastel backgrounds that sit well on both the light and the dark card.
const BACKGROUNDS = ["dbeafe", "e0e7ff", "ede9fe", "fce7f3", "ffedd5", "dcfce7", "e0f2fe", "fef3c7"];

type Look = notionists.Options;
const variants = <T,>(from: number, to: number, skip: number[]) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .filter((n) => !skip.includes(n))
    .map((n) => `variant${String(n).padStart(2, "0")}` as T);

// Hand-picked for a professional look: no spiky or bleached hair, hats or
// space buns; no swirly, dotted or lightning-bolt shirts; only clear glasses.
const HAIR = variants<NonNullable<Look["hair"]>[number]>(1, 63, [14, 42, 50, 51, 53, 59]);
const BODY = variants<NonNullable<Look["body"]>[number]>(1, 25, [12, 15, 18, 22, 23, 24]);
const GLASSES: Look["glasses"] = ["variant03", "variant08", "variant11"];

export type AvatarLook = "notionists" | "shapes";

/** A new random picture for Shuffle; saved with the record (avatar_seed). */
export function newAvatarSeed(): string {
  return Math.random().toString(36).slice(2, 12);
}

/**
 * A vendor's or customer's picture, drawn in the browser (DiceBear — nothing
 * is sent anywhere): an illustrated face ("notionists"), or abstract shapes
 * for No Characters. The same look and seed always draw the same picture; a
 * record that never picked one uses a face seeded by its id. Faces are kept tidy: no
 * waving or pointing hands or space-themed shirt icons, fewer beards and
 * glasses, and only the hairstyles, shirts and clear glasses listed above.
 */
export function ProfileAvatar({ seed, look, className }: { seed: string; look?: AvatarLook | null; className?: string }) {
  const svg = useMemo(
    () =>
      look === "shapes"
        ? createAvatar(shapes, { seed, backgroundColor: BACKGROUNDS, backgroundType: ["solid"] }).toString()
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
          }).toString(),
    [seed, look],
  );
  return (
    <span
      aria-hidden
      className={cn("block overflow-hidden rounded-xl shadow-sm [&>svg]:h-full [&>svg]:w-full", className)}
      // A generated SVG from DiceBear, not user input.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
