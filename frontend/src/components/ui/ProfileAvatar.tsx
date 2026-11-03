"use client";

import { useAvatarSvg, newAvatarSeed, type AvatarLook } from "@/lib/avatar";
import { cn } from "@/lib/utils";

export { newAvatarSeed, type AvatarLook };

/**
 * A vendor's or customer's chosen picture (look + seed saved with the record;
 * a record that never picked one uses a face seeded by its id). Drawing lives
 * in `@/lib/avatar`.
 */
export function ProfileAvatar({ seed, look, className }: { seed: string; look?: AvatarLook | null; className?: string }) {
  const svg = useAvatarSvg(seed, look ?? "notionists");
  return (
    <span
      aria-hidden
      className={cn("block overflow-hidden rounded-xl shadow-sm [&>svg]:h-full [&>svg]:w-full", className)}
      style={svg ? undefined : { background: "var(--avatar-bg-1)" }}
      // A generated SVG from DiceBear, not user input.
      dangerouslySetInnerHTML={{ __html: svg ?? "" }}
    />
  );
}
