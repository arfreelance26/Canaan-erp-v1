"use client";

import { RiGroupLine as Users } from "@remixicon/react";

/** Shared between the real Canaan Chat UI (app/connect/chat/page.tsx) and the
 * read-only Owner View dialog, so both render people/messages identically
 * instead of OwnerViewDialog slowly drifting into its own look. */

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Deterministic per-sender color for group/multi-party threads — so at a
 * glance you can tell senders apart by avatar/name color alone. */
export const SENDER_PALETTE = [
  { bg: "bg-danger-solid", text: "text-danger-text" },
  { bg: "bg-orange-solid", text: "text-orange-text" },
  { bg: "bg-warning-solid", text: "text-warning-text" },
  { bg: "bg-success-solid", text: "text-success-text" },
  { bg: "bg-teal-solid", text: "text-teal-text" },
  { bg: "bg-teal-solid", text: "text-teal-text" },
  { bg: "bg-accent-solid", text: "text-accent-text" },
  { bg: "bg-purple-solid", text: "text-purple-text" },
  { bg: "bg-purple-solid", text: "text-purple-text" },
  // Fuchsia/pink aren't remapped by the dark theme, so they pick their own light shade.
  { bg: "bg-purple-solid", text: "text-purple-text" },
  { bg: "bg-purple-solid", text: "text-purple-text" },
] as const;

export function senderColor(id: number | null): (typeof SENDER_PALETTE)[number] {
  const key = id ?? 0;
  return SENDER_PALETTE[Math.abs(key) % SENDER_PALETTE.length];
}

export function Avatar({
  name,
  photoUrl,
  size = 44,
  group = false,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  group?: boolean;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-solid text-body-semibold text-on-solid"
    >
      {group ? <Users className="h-1/2 w-1/2 text-gold-text" /> : getInitials(name || "?")}
    </div>
  );
}
