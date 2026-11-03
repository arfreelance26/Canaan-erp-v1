"use client";

import type { ComponentType, ReactNode } from "react";
import { RiArrowRightSLine } from "@remixicon/react";
import { cx } from "@/utils/cx";

type WorkspaceTileProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  /** One quiet line about what's inside, e.g. "2 meetings coming up". */
  summary: ReactNode;
  /** A count worth noticing (due to-dos, upcoming meetings); hidden at 0. */
  count?: number;
  /** Tone of the count: "attention" for things due, "neutral" otherwise. */
  countTone?: "attention" | "neutral";
  onClick: () => void;
  "aria-label"?: string;
};

/**
 * A card on My profile that opens one of the personal tools (Meetings,
 * To-do, Notes). The tools keep their own panels; this is only the way in.
 */
export function WorkspaceTile({ icon: Icon, title, summary, count = 0, countTone = "neutral", onClick, "aria-label": ariaLabel }: WorkspaceTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? title}
      className="group flex w-full items-center gap-4 rounded-3xl border border-separator-border bg-background-primary-default p-5 text-start outline-none transition-colors hover:bg-background-secondary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-surface text-accent-text">
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-headline-semibold text-text-primary">
          {title}
          {count > 0 && (
            <span
              className={cx(
                "rounded-full px-2 py-0.5 text-caption-1-semibold tabular-nums",
                countTone === "attention" ? "bg-danger-surface-strong text-danger-text" : "bg-accent-surface-strong text-accent-text",
              )}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </span>
        <span className="truncate text-body-regular text-text-secondary">{summary}</span>
      </span>
      <RiArrowRightSLine className="size-5 shrink-0 text-foreground-icon-tertiary transition-colors group-hover:text-foreground-icon-primary" />
    </button>
  );
}
