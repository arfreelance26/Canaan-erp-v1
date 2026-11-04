import type { ReactNode } from "react";
import Link from "next/link";
import { RiArrowRightLine, RiDraggable, RiTimeLine, type RemixiconComponentType } from "@remixicon/react";
import { cx } from "@/utils/cx";

/**
 * One "Needs your attention" item from the daily recap, drawn as a ticket
 * (Jira / ClickUp style): its area as a tag, the item as the title, and the
 * record it's about plus how old it is in the footer. Laid out and reordered
 * by SortableGrid in DailySummaryCard.
 */
export type TicketMeta = {
  /** Area tag: "Trips", "Documents"… */
  area: string;
  icon: RemixiconComponentType;
  /** Tone classes for the area tag. */
  tone: string;
  /** The record it's about, e.g. "TRP-1961" or "TN69AL8092". */
  ref: string | null;
  /** "46 days", "yesterday". */
  age: string | null;
};

export function AttentionTicket({ meta, href, dragging, children }: { meta: TicketMeta; href: string | null; dragging?: boolean; children: ReactNode }) {
  const Icon = meta.icon;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-caption-1-medium", meta.tone)}>
          <Icon className="size-3.5" />
          {meta.area}
        </span>
        <RiDraggable aria-hidden className="size-4 text-foreground-icon-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="mt-2.5 line-clamp-3 flex-1 text-body-regular text-text-primary">{children}</p>
      <div className="mt-3 flex items-center gap-2 border-t border-separator-border pt-2.5 text-caption-1-regular text-text-secondary">
        {meta.ref && <span className="rounded-md bg-fill-2 px-1.5 py-0.5 font-mono text-caption-1-medium text-text-primary">{meta.ref}</span>}
        {meta.age && (
          <span className="inline-flex items-center gap-1">
            <RiTimeLine className="size-3.5 text-foreground-icon-tertiary" />
            {meta.age}
          </span>
        )}
        {href && <RiArrowRightLine aria-hidden className="ms-auto size-4 text-foreground-icon-tertiary transition-colors group-hover:text-foreground-icon-primary" />}
      </div>
    </>
  );
  const card = cx(
    "group flex h-full flex-col rounded-xl border bg-background-primary-default p-3.5 transition-[border-color,box-shadow] duration-150",
    dragging ? "border-border-button-default shadow-sidebar" : "border-separator-border hover:border-border-button-default",
  );
  return href ? (
    <Link href={href} draggable={false} className={card}>
      {body}
    </Link>
  ) : (
    <div className={card}>{body}</div>
  );
}
