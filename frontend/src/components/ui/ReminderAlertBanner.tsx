"use client";

import { useState } from "react";
import { RiAlertLine as AlertTriangle, RiArrowRightLine as ArrowRight } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Reminder } from "@/lib/api";

/** A flat-list counterpart to ComplianceAlertBanner (which groups by
 * document-type across trucks) — for reminder feeds that are already one
 * item per entity (a driver, a recurring payment), with nothing to group
 * by beyond overdue/due-soon. Same visual language, on purpose: this is the
 * same "status card lives on the page it's about" pattern (see Our Fleet),
 * just reused for the other reminder categories that used to only exist as
 * "Renewals & Payments" in the Topbar bell.
 *
 * Each row shows one chip per entity (a truck with two overdue documents is
 * one chip, "· 2", the documents on hover) and only the first few chips until
 * "+N more" is clicked, so a long list stays calm to read. */

/** One chip per entity with documents never entered / without cost (Compliance & Renewals). */
export type NotUploadedRow = { entity: string; count: number; detail: string };

type Chip = { entity: string; count: number; detail: string };
type Row = { key: string; title: string; total: number; chips: Chip[]; chip: string; dot: string };

const SHOWN = 8;

/** Reminders → one chip per entity, most items first. */
function byEntity(items: Reminder[]): Chip[] {
  const map = new Map<string, Chip>();
  for (const r of items) {
    const c = map.get(r.entity);
    if (c) {
      c.count += 1;
      c.detail += `\n${r.detail}`;
    } else {
      map.set(r.entity, { entity: r.entity, count: 1, detail: r.detail });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function ReminderAlertBanner({
  items,
  notUploaded = [],
  noCost = [],
  href,
  actionLabel,
  onAction,
}: {
  items: Reminder[];
  /** Optional grey "Not uploaded" row under Overdue / Due soon: a gap to
   * fill, not an expiry, so it never counts towards "overdue". */
  notUploaded?: NotUploadedRow[];
  /** Optional blue "No cost" row: uploaded documents with no cost entered. */
  noCost?: NotUploadedRow[];
  /** Omit both href and actionLabel to render without an action button —
   * for a page the reminder already lives on, where "go here" would just
   * point at itself. */
  href?: string;
  actionLabel?: string;
  /** Overrides the default router.push(href) — for a page where the "fix
   * this" action is a dialog already on this page, not a navigation. */
  onAction?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (items.length === 0 && notUploaded.length === 0 && noCost.length === 0) return null;

  const overdue = items.filter((i) => i.severity === "overdue");
  const dueSoon = items.filter((i) => i.severity === "due_soon");
  const hasOverdue = overdue.length > 0;
  const main = hasOverdue ? overdue : dueSoon;
  // Only gaps to fill (nothing overdue or due): a calm grey card, not a warning.
  const onlyGaps = items.length === 0;
  const sum = (rows: NotUploadedRow[]) => rows.reduce((n, r) => n + r.count, 0);
  const missingDocs = sum(notUploaded);
  const noCostDocs = sum(noCost);
  const gapNote = [missingDocs ? `${missingDocs} not uploaded` : "", noCostDocs ? `${noCostDocs} without cost` : ""]
    .filter(Boolean).join(" · ");

  const rows: Row[] = ([
    { key: "overdue", title: "Overdue", total: overdue.length, chips: byEntity(overdue),
      chip: "border border-danger-border bg-background-primary-default text-danger-text", dot: "bg-danger-solid" },
    { key: "soon", title: "Due soon", total: dueSoon.length, chips: byEntity(dueSoon),
      chip: "border border-warning-border bg-background-primary-default text-warning-text", dot: "bg-warning-solid" },
    { key: "missing", title: "Not uploaded", total: missingDocs, chips: notUploaded,
      chip: "bg-fill-2 text-text-secondary", dot: "bg-text-tertiary" },
    { key: "nocost", title: "No cost", total: noCostDocs, chips: noCost,
      chip: "bg-accent-surface text-accent-text", dot: "bg-accent-solid" },
  ] as Row[]).filter((r) => r.chips.length > 0);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className={cn(
      "overflow-hidden rounded-2xl border bg-background-primary-default shadow-sm",
      hasOverdue ? "border-danger-border/80" : onlyGaps ? "border-separator-border" : "border-warning-border/80"
    )}>
      <div className="flex items-center gap-3 px-5 py-4">
        <span className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          hasOverdue ? "bg-danger-surface-strong text-danger-text" : onlyGaps ? "bg-fill-2 text-text-secondary" : "bg-warning-surface-strong text-warning-text"
        )}>
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-semibold text-text-primary">
            {onlyGaps
              ? `${missingDocs + noCostDocs} ${missingDocs + noCostDocs === 1 ? "document needs" : "documents need"} details`
              : `${main.length} ${main.length === 1 ? "item" : "items"} ${hasOverdue ? "overdue" : "due soon"}`}
          </p>
          <p className="text-xs text-text-secondary">
            {onlyGaps ? gapNote : `${hasOverdue ? "Action required" : "Renew or settle soon"}${gapNote ? ` · ${gapNote}` : ""}`}
          </p>
        </div>
        {actionLabel && (onAction || href) && (
          <button
            type="button"
            onClick={() => (onAction ? onAction() : router.push(href!))}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-4 text-caption-1-semibold text-on-solid shadow-sm transition duration-300 hover:shadow-md",
              hasOverdue ? "bg-danger-solid hover:bg-danger-solid-hover" : "bg-warning-solid hover:bg-warning-solid-hover"
            )}
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="divide-y divide-separator-border border-t border-separator-border">
        {rows.map((row) => {
          const expanded = open.has(row.key);
          const shown = expanded ? row.chips : row.chips.slice(0, SHOWN);
          const hidden = row.chips.length - shown.length;
          return (
            <div key={row.key} className="flex flex-col gap-2.5 px-5 py-3.5 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex w-32 shrink-0 items-center gap-2 sm:pt-1">
                <span className={cn("h-2 w-2 rounded-full", row.dot)} />
                <span className="text-caption-1-semibold text-text-primary">{row.title}</span>
                <span className="text-caption-1-medium tabular-nums text-text-tertiary">{row.total}</span>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {shown.map((c) => (
                  <span
                    key={`${row.key}-${c.entity}`}
                    title={c.detail}
                    className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption-1-medium", row.chip)}
                  >
                    {c.entity}
                    {c.count > 1 && <span className="tabular-nums opacity-60">×{c.count}</span>}
                  </span>
                ))}
                {(hidden > 0 || expanded) && row.chips.length > SHOWN && (
                  <button
                    type="button"
                    onClick={() => toggle(row.key)}
                    className="rounded-full px-2.5 py-1 text-caption-1-semibold text-text-secondary transition-colors hover:bg-fill-2 hover:text-text-primary"
                  >
                    {expanded ? "Show less" : `+${hidden} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
