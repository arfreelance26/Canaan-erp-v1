"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Reminder } from "@/lib/api";

/** A flat-list counterpart to ComplianceAlertBanner (which groups by
 * document-type across trucks) — for reminder feeds that are already one
 * item per entity (a driver, a recurring payment), with nothing to group
 * by beyond overdue/due-soon. Same visual language, on purpose: this is the
 * same "status card lives on the page it's about" pattern (see Our Fleet),
 * just reused for the other reminder categories that used to only exist as
 * "Renewals & Payments" in the Topbar bell. */
export function ReminderAlertBanner({
  items,
  href,
  actionLabel,
  onAction,
}: {
  items: Reminder[];
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
  if (items.length === 0) return null;

  const overdue = items.filter((i) => i.severity === "overdue");
  const dueSoon = items.filter((i) => i.severity === "due_soon");
  const hasOverdue = overdue.length > 0;
  const main = hasOverdue ? overdue : dueSoon;
  const sections = [
    { key: "overdue", title: "Overdue", rows: overdue, chip: "border-red-200 bg-white text-red-700", dot: "bg-red-500" },
    { key: "soon", title: "Due soon", rows: dueSoon, chip: "border-amber-200 bg-white text-amber-700", dot: "bg-amber-400" },
  ].filter((sec) => sec.rows.length > 0);

  return (
    <div className={cn(
      "dk-inset overflow-hidden rounded-2xl border bg-gradient-to-r to-white shadow-sm",
      hasOverdue ? "border-red-200/80 from-red-50" : "border-amber-200/80 from-amber-50"
    )}>
      <div className="flex items-center gap-3 px-5 py-3.5">
        <span className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          hasOverdue ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
        )}>
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {main.length} {main.length === 1 ? "item" : "items"} {hasOverdue ? "overdue" : "due soon"}
          </p>
          <p className="text-xs text-gray-500">{hasOverdue ? "Action required" : "Renew or settle soon"}</p>
        </div>
        {actionLabel && (onAction || href) && (
          <button
            type="button"
            onClick={() => (onAction ? onAction() : router.push(href!))}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md",
              hasOverdue ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
            )}
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className={cn("flex flex-col gap-2 border-t px-5 py-3", hasOverdue ? "border-red-100" : "border-amber-100")}>
        {sections.map((sec) => (
          <div key={sec.key} className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
            <span className="flex w-20 shrink-0 items-center gap-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {sec.title}
            </span>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {sec.rows.map((r, i) => (
                <span
                  key={`${sec.key}-${i}`}
                  title={r.detail}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", sec.chip)}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", sec.dot)} />
                  {r.entity}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
