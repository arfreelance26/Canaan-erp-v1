"use client";

/**
 * Chat bubble primitives, after shadcn/ui's Bubble
 * (https://ui.shadcn.com/docs/components/base/bubble).
 *
 * Ported by hand: this project has no radix Slot / class-variance-authority, and
 * its colours come from the app palette (amber "mine", white "theirs", both
 * auto-darkened by the html.dark gray remap) instead of shadcn's tokens.
 *
 *   <Bubble align="end" variant="mine">
 *     <BubbleContent>Hello</BubbleContent>
 *     <BubbleReactions align="end">…chips…</BubbleReactions>
 *   </Bubble>
 */
import * as React from "react";

import { cn } from "@/lib/utils";

type Align = "start" | "end";

const VARIANT = {
  mine: "bg-warning-surface-strong text-text-primary",
  theirs: "bg-background-primary-default text-text-primary",
  plain: "",
} as const;

export function BubbleGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="bubble-group" className={cn("flex min-w-0 flex-col gap-1", className)} {...props} />;
}

export function Bubble({
  className,
  align = "start",
  variant = "plain",
  ...props
}: React.ComponentProps<"div"> & { align?: Align; variant?: keyof typeof VARIANT }) {
  return (
    <div
      data-slot="bubble"
      data-align={align}
      data-variant={variant}
      className={cn("group/bubble relative flex w-fit min-w-0 flex-col", VARIANT[variant], className)}
      {...props}
    />
  );
}

export function BubbleContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="bubble-content" className={cn("min-w-0", className)} {...props} />;
}

/** A small pill pinned to the bubble's bottom (or top) edge, holding reaction chips. */
export function BubbleReactions({
  className,
  align = "start",
  side = "bottom",
  ...props
}: React.ComponentProps<"div"> & { align?: Align; side?: "top" | "bottom" }) {
  return (
    <div
      data-slot="bubble-reactions"
      data-align={align}
      data-side={side}
      className={cn(
        "absolute z-10 flex w-fit shrink-0 items-center gap-0.5 rounded-full border border-separator-border bg-background-primary-default p-0.5 text-sm shadow-sm",
        side === "bottom" ? "bottom-0 translate-y-3/4" : "top-0 -translate-y-3/4",
        align === "end" ? "right-2" : "left-2",
        className,
      )}
      {...props}
    />
  );
}
