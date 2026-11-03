"use client";

import { useAvatarSvg, type AvatarLook } from "@/lib/avatar";
import { cx } from "@/utils/cx";

type AvatarProps = {
  /** The uploaded photo; when missing, a generated picture is drawn instead. */
  photoUrl?: string | null;
  /** Name for the photo's alt text; also the seed when `seed` isn't given. */
  label: string;
  /** Keeps the picture stable when the name changes, e.g. `driver-12`. */
  seed?: string;
  /** "group" draws abstract shapes instead of a face (group chats). */
  kind?: "person" | "group";
  size?: number;
  className?: string;
};

/**
 * Round profile picture for people and groups: the uploaded photo, or a
 * DiceBear face (people) / shapes (groups) seeded by who it is, so the same
 * person always gets the same picture.
 */
export function Avatar({ photoUrl, label, seed, kind = "person", size = 36, className }: AvatarProps) {
  const look: AvatarLook = kind === "group" ? "shapes" : "notionists";
  const key = seed || label || "?";
  const svg = useAvatarSvg(key, look, !photoUrl);

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={label}
        className={cx("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={label}
      className={cx("block shrink-0 overflow-hidden rounded-full [&>svg]:h-full [&>svg]:w-full", className)}
      // The avatar's own background colour while DiceBear loads.
      style={{ width: size, height: size, background: svg ? undefined : "var(--avatar-bg-1)" }}
      // A generated SVG from DiceBear, not user input.
      dangerouslySetInnerHTML={{ __html: svg ?? "" }}
    />
  );
}
