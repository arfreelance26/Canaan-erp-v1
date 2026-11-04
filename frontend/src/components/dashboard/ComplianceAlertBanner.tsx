"use client";

import { RiAlertLine as AlertTriangle, RiArrowRightLine as ArrowRight } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Item = { truckId: string; label: string };

function groupByLabel(items: Item[]) {
  const map = new Map<string, string[]>();
  for (const it of items) map.set(it.label, [...(map.get(it.label) ?? []), it.truckId]);
  return [...map.entries()].sort((x, y) => y[1].length - x[1].length);
}

/** Expired / expiring-soon document banner, grouped by document type. */
export function ComplianceAlertBanner({
  expired,
  expiringSoon,
  href,
  actionLabel,
}: {
  expired: Item[];
  expiringSoon: Item[];
  /** Omit both href and actionLabel to render without an action button —
   * for a page the alert already lives on. */
  href?: string;
  actionLabel?: string;
}) {
  const router = useRouter();
  if (expired.length === 0 && expiringSoon.length === 0) return null;

  const hasExpired = expired.length > 0;
  const sections = [
    { key: "expired", title: "Expired", groups: groupByLabel(expired), chip: "border-danger-border bg-background-primary-default text-danger-text", dot: "bg-danger-solid", count: "bg-danger-surface-strong text-danger-text" },
    { key: "soon", title: "Expiring soon", groups: groupByLabel(expiringSoon), chip: "border-warning-border bg-background-primary-default text-warning-text", dot: "bg-warning-solid", count: "bg-warning-surface-strong text-warning-text" },
  ].filter((sec) => sec.groups.length > 0);
  const main = hasExpired ? expired : expiringSoon;
  const total = main.length;
  const truckCount = new Set(main.map((i) => i.truckId)).size;

  return (
    <div data-tour="compliance-banner" className={cn(
      "overflow-hidden rounded-2xl border bg-background-primary-default shadow-sm",
      hasExpired ? "border-danger-border/80" : "border-warning-border/80"
    )}>
      <div className="flex items-center gap-3 px-5 py-3.5">
        <span className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          hasExpired ? "bg-danger-surface-strong text-danger-text" : "bg-warning-surface-strong text-warning-text"
        )}>
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-semibold text-text-primary">
            {hasExpired
              ? `${total} document${total === 1 ? " has" : "s have"} expired`
              : `${total} document${total === 1 ? " is" : "s are"} expiring soon`}
          </p>
          <p className="text-xs text-text-secondary">
            {hasExpired ? "Renewal required" : "Renew soon"} · {truckCount} truck{truckCount === 1 ? "" : "s"} affected
          </p>
        </div>
        {actionLabel && href && (
          <button
            type="button"
            onClick={() => router.push(href)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-4 text-caption-1-semibold text-on-solid shadow-sm transition duration-300 hover:shadow-md",
              hasExpired ? "bg-danger-solid hover:bg-danger-solid-hover" : "bg-warning-solid hover:bg-warning-solid-hover"
            )}
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className={cn("flex flex-col gap-2.5 border-t px-5 py-3", hasExpired ? "border-danger-border" : "border-warning-border")}>
        {sections.map((sec) =>
          sec.groups.map(([label, trucks]) => (
            <div key={`${sec.key}-${label}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="flex w-40 shrink-0 items-center gap-2 text-caption-2-semibold text-text-secondary">
                {label}
                <span className={cn("rounded-full px-1.5 py-0.5 text-caption-2-semibold tabular-nums", sec.count)}>{trucks.length}</span>
                {sections.length > 1 && <span className="font-medium normal-case tracking-normal text-text-tertiary">· {sec.title.toLowerCase()}</span>}
              </span>
              <div className="flex flex-1 flex-wrap gap-1.5">
                {trucks.map((truckId, i) => (
                  <span key={`${truckId}-${i}`} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-caption-2-medium", sec.chip)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", sec.dot)} />
                    {truckId}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
