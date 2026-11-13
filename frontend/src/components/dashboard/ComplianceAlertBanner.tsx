"use client";

import { useState } from "react";
import { RiAlertLine as AlertTriangle, RiArrowRightLine as ArrowRight, RiArrowDownSLine as ChevronDown } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Item = { truckId: string; label: string };

/** Short names so the document column never wraps. */
const SHORT: Record<string, string> = {
  "Fitness Certificate (FC)": "FC",
  "Pollution Certificate (PUC)": "PUC",
  "Registration Certificate (RC)": "RC",
};

function groupByLabel(items: Item[]): [string, string[]][] {
  const map = new Map<string, string[]>();
  for (const it of items) {
    const label = SHORT[it.label] ?? it.label;
    map.set(label, [...(map.get(label) ?? []), it.truckId]);
  }
  return [...map.entries()].sort((x, y) => y[1].length - x[1].length);
}

type Section = {
  key: string;
  title: string;
  items: Item[];
  /** Gaps to fill (not uploaded / no cost) start folded: a one-line summary. */
  folded: boolean;
  chip: string;
  dot: string;
};

const SHOWN = 8;

/** Document banner, grouped by document type within each status: Expired,
 *  Expiring soon, and (optionally) Not uploaded and No cost. Each document
 *  row shows its first few trucks with "+N more"; the two "gap" sections
 *  start folded to a one-line summary so the banner stays calm. */
export function ComplianceAlertBanner({
  expired,
  expiringSoon,
  notUploaded = [],
  noCost = [],
  href,
  actionLabel,
}: {
  expired: Item[];
  expiringSoon: Item[];
  /** Documents with no expiry date entered (a gap, never counted as expired). */
  notUploaded?: Item[];
  /** Documents uploaded with no cost entered (they count as ₹0 in Profitability). */
  noCost?: Item[];
  /** Omit both href and actionLabel to render without an action button —
   * for a page the alert already lives on. */
  href?: string;
  actionLabel?: string;
}) {
  const router = useRouter();
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  if (expired.length === 0 && expiringSoon.length === 0 && notUploaded.length === 0 && noCost.length === 0) return null;

  const hasExpired = expired.length > 0;
  const onlyGaps = expired.length === 0 && expiringSoon.length === 0;
  const main = hasExpired ? expired : expiringSoon;
  const total = main.length;
  const truckCount = new Set(main.map((i) => i.truckId)).size;
  const gapNote = [notUploaded.length ? `${notUploaded.length} not uploaded` : "", noCost.length ? `${noCost.length} without cost` : ""]
    .filter(Boolean).join(" · ");

  const sections: Section[] = ([
    { key: "expired", title: "Expired", items: expired, folded: false,
      chip: "border border-danger-border bg-background-primary-default text-danger-text", dot: "bg-danger-solid" },
    { key: "soon", title: "Expiring soon", items: expiringSoon, folded: false,
      chip: "border border-warning-border bg-background-primary-default text-warning-text", dot: "bg-warning-solid" },
    { key: "missing", title: "Not uploaded", items: notUploaded, folded: true,
      chip: "bg-fill-2 text-text-secondary", dot: "bg-text-tertiary" },
    { key: "nocost", title: "No cost", items: noCost, folded: true,
      chip: "bg-accent-surface text-accent-text", dot: "bg-accent-solid" },
  ] as Section[]).filter((s) => s.items.length > 0);

  const flip = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  return (
    <div data-tour="compliance-banner" className={cn(
      "overflow-hidden rounded-2xl border bg-background-primary-default shadow-sm",
      hasExpired ? "border-danger-border/80" : onlyGaps ? "border-separator-border" : "border-warning-border/80"
    )}>
      <div className="flex items-center gap-3 px-5 py-4">
        <span className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          hasExpired ? "bg-danger-surface-strong text-danger-text" : onlyGaps ? "bg-fill-2 text-text-secondary" : "bg-warning-surface-strong text-warning-text"
        )}>
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-semibold text-text-primary">
            {onlyGaps
              ? `${notUploaded.length + noCost.length} documents need details`
              : hasExpired
                ? `${total} document${total === 1 ? " has" : "s have"} expired`
                : `${total} document${total === 1 ? " is" : "s are"} expiring soon`}
          </p>
          <p className="text-xs text-text-secondary">
            {onlyGaps
              ? gapNote
              : `${hasExpired ? "Renewal required" : "Renew soon"} · ${truckCount} truck${truckCount === 1 ? "" : "s"} affected${gapNote ? ` · ${gapNote}` : ""}`}
          </p>
        </div>
        {actionLabel && href && (
          <button
            type="button"
            onClick={() => router.push(href)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-4 text-caption-1-semibold text-on-solid shadow-sm transition duration-300 hover:shadow-md",
              hasExpired ? "bg-danger-solid hover:bg-danger-solid-hover" : onlyGaps ? "bg-accent-solid hover:bg-accent-solid-hover" : "bg-warning-solid hover:bg-warning-solid-hover"
            )}
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="divide-y divide-separator-border border-t border-separator-border">
        {sections.map((sec) => {
          const groups = groupByLabel(sec.items);
          const trucks = new Set(sec.items.map((i) => i.truckId)).size;
          const open = !sec.folded || openSections.has(sec.key);
          return (
            <div key={sec.key} className="px-5 py-3.5">
              {/* Section heading: what, how many documents, on how many trucks */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn("h-2 w-2 rounded-full", sec.dot)} />
                <span className="text-caption-1-semibold text-text-primary">{sec.title}</span>
                <span className="text-caption-1-medium tabular-nums text-text-tertiary">
                  {sec.items.length} document{sec.items.length === 1 ? "" : "s"} · {trucks} truck{trucks === 1 ? "" : "s"}
                </span>
                {sec.folded && (
                  <>
                    {!open && (
                      <span className="hidden min-w-0 truncate text-caption-1-regular text-text-tertiary md:inline">
                        — {groups.map(([label, t]) => `${label} ${t.length}`).join(" · ")}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpenSections((s) => flip(s, sec.key))}
                      aria-expanded={open}
                      className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-caption-1-semibold text-text-secondary transition-colors hover:bg-fill-2 hover:text-text-primary"
                    >
                      {open ? "Hide trucks" : "Show trucks"}
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                    </button>
                  </>
                )}
              </div>

              {open && (
                <div className="mt-3 flex flex-col gap-2.5">
                  {groups.map(([label, list]) => {
                    const rowKey = `${sec.key}-${label}`;
                    const expanded = openRows.has(rowKey);
                    const shown = expanded ? list : list.slice(0, SHOWN);
                    return (
                      <div key={rowKey} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
                        <div className="flex w-40 shrink-0 items-center gap-2 whitespace-nowrap pl-4 sm:pt-1">
                          <span className="text-caption-1-medium text-text-secondary">{label}</span>
                          <span className="text-caption-1-medium tabular-nums text-text-tertiary">{list.length}</span>
                        </div>
                        <div className="flex flex-1 flex-wrap items-center gap-2 pl-4 sm:pl-0">
                          {shown.map((truckId, i) => (
                            <span key={`${truckId}-${i}`} className={cn("inline-flex items-center rounded-full px-3 py-1 text-caption-1-medium", sec.chip)}>
                              {truckId}
                            </span>
                          ))}
                          {list.length > SHOWN && (
                            <button
                              type="button"
                              onClick={() => setOpenRows((s) => flip(s, rowKey))}
                              className="rounded-full px-2.5 py-1 text-caption-1-semibold text-text-secondary transition-colors hover:bg-fill-2 hover:text-text-primary"
                            >
                              {expanded ? "Show less" : `+${list.length - SHOWN} more`}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
