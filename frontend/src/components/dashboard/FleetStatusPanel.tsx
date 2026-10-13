import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The dashboard's top line used to be six identical bordered, shadowed,
// color-washed cards — the generic "SaaS card kit" look, regardless of what
// each number actually meant. This is one instrument panel instead: a single
// bordered surface, cells separated by hairlines (via the bg-gray-200 +
// gap-px trick, so the dividers stay correct across the responsive column
// count instead of fighting Tailwind's divide-x/y utilities on a wrapping
// grid), with no per-cell shadow or background color.
//
// A ratio ("Fleet on Road: 0/42") gets a small ring instead of a second
// number — the same circular-fill device already used for monthly
// attendance elsewhere in this app (see Mark Attendance / the Profile
// modal), not a new motif invented just for this panel. A plain count
// doesn't get a ring; there's nothing to fill.
//
// Color lives only in the icon glyph itself — flat, no chip, no tint
// background — except the one segment actually flagged as an alert, which
// is also the only one allowed a pulsing dot and a colored number. That
// asymmetry is the point: it's how an alert reads as different from routine
// information instead of being one of six identically loud tiles.

export type FleetStatusSegment = {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
} & (
  | { kind: "count"; value: string; caption?: string; tone?: "neutral" | "good" | "warn" }
  | { kind: "ratio"; numerator: number; denominator: number; caption?: string; tone?: "neutral" | "good" | "warn" }
  | { kind: "alert"; value: string; caption?: string; active: boolean }
);

const TONE_TEXT: Record<"neutral" | "good" | "warn", string> = {
  neutral: "text-gray-400",
  good: "text-emerald-500",
  warn: "text-amber-500",
};

const RING_COLOR: Record<"neutral" | "good" | "warn", string> = {
  neutral: "#9CA3AF",
  good: "#10B981",
  warn: "#F59E0B",
};

function Ring({ fraction, color }: { fraction: number; color: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg className="h-9 w-9 -rotate-90 shrink-0" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r={r} fill="none" className="stroke-gray-100" strokeWidth="4" />
      <circle
        cx="18" cy="18" r={r} fill="none"
        stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
      />
    </svg>
  );
}

function Segment({ segment }: { segment: FleetStatusSegment }) {
  const Icon = segment.icon;
  const isAlert = segment.kind === "alert";
  const active = isAlert && segment.active;
  const tone = segment.kind !== "alert" ? segment.tone ?? "neutral" : undefined;

  const valueText =
    segment.kind === "ratio" ? `${segment.numerator}/${segment.denominator}` : segment.value;

  const body = (
    <div className="flex h-full flex-col gap-3 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-gray-500">
          {segment.label}
        </span>
        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-red-500" : tone ? TONE_TEXT[tone] : "text-gray-300")} />
      </div>

      <div className="flex items-center gap-3">
        {segment.kind === "ratio" && (
          <Ring
            fraction={segment.denominator > 0 ? segment.numerator / segment.denominator : 0}
            color={RING_COLOR[tone ?? "neutral"]}
          />
        )}
        <p className={cn(
          "text-3xl font-bold leading-none tabular-nums",
          active ? "text-red-600" : "text-gray-900"
        )}>
          {valueText}
        </p>
      </div>

      {segment.caption && (
        <p className={cn("mt-auto text-xs", active ? "text-red-500" : "text-gray-400")}>
          {segment.caption}
        </p>
      )}
    </div>
  );

  if (!segment.onClick) return body;
  return (
    <button
      type="button"
      onClick={segment.onClick}
      className="h-full w-full text-left transition-colors hover:bg-gray-50/80"
    >
      {body}
    </button>
  );
}

export function FleetStatusPanel({ segments }: { segments: FleetStatusSegment[] }) {
  return (
    <div
      className="grid gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 shadow-sm"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
    >
      {segments.map((s) => (
        <Segment key={s.key} segment={s} />
      ))}
    </div>
  );
}
