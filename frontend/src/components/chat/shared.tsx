"use client";

import { Users } from "lucide-react";

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
  { bg: "bg-rose-500", text: "text-rose-600" },
  { bg: "bg-orange-500", text: "text-orange-600" },
  { bg: "bg-amber-500", text: "text-amber-700" },
  { bg: "bg-emerald-500", text: "text-emerald-600" },
  { bg: "bg-teal-500", text: "text-teal-600" },
  { bg: "bg-cyan-600", text: "text-cyan-700" },
  { bg: "bg-blue-500", text: "text-blue-600" },
  { bg: "bg-indigo-500", text: "text-indigo-600" },
  { bg: "bg-violet-500", text: "text-violet-600" },
  { bg: "bg-fuchsia-500", text: "text-fuchsia-600" },
  { bg: "bg-pink-500", text: "text-pink-600" },
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
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-navy text-sm font-semibold text-white"
    >
      {group ? <Users className="h-1/2 w-1/2 text-brand-gold" /> : getInitials(name || "?")}
    </div>
  );
}
