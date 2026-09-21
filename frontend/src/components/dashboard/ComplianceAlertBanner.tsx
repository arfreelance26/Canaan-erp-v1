"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
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
  href: string;
  actionLabel: string;
}) {
  const router = useRouter();
  if (expired.length === 0 && expiringSoon.length === 0) return null;

  const hasExpired = expired.length > 0;
  const sections = [
    { key: "expired", title: "Expired", groups: groupByLabel(expired), chip: "border-red-200 bg-white text-red-700", dot: "bg-red-500", count: "bg-red-100 text-red-700" },
    { key: "soon", title: "Expiring soon", groups: groupByLabel(expiringSoon), chip: "border-amber-200 bg-white text-amber-700", dot: "bg-amber-400", count: "bg-amber-100 text-amber-700" },
  ].filter((sec) => sec.groups.length > 0);
  const main = hasExpired ? expired : expiringSoon;
  const total = main.length;
  const truckCount = new Set(main.map((i) => i.truckId)).size;

  return (
    <div className={cn(
      "dk-inset overflow-hidden rounded-2xl border bg-gradient-to-r to-white shadow-sm",
      hasExpired ? "border-red-200/80 from-red-50" : "border-amber-200/80 from-amber-50"
    )}>
      <div className="flex items-center gap-3 px-5 py-3.5">
        <span className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          hasExpired ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
        )}>
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            {hasExpired
              ? `${total} document${total === 1 ? " has" : "s have"} expired`
              : `${total} document${total === 1 ? " is" : "s are"} expiring soon`}
          </p>
          <p className="text-xs text-gray-500">
            {hasExpired ? "Renewal required" : "Renew soon"} · {truckCount} truck{truckCount === 1 ? "" : "s"} affected
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push(href)}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md",
            hasExpired ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
          )}
        >
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className={cn("flex flex-col gap-2.5 border-t px-5 py-3", hasExpired ? "border-red-100" : "border-amber-100")}>
        {sections.map((sec) =>
          sec.groups.map(([label, trucks]) => (
            <div key={`${sec.key}-${label}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="flex w-40 shrink-0 items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                {label}
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums", sec.count)}>{trucks.length}</span>
                {sections.length > 1 && <span className="font-medium normal-case tracking-normal text-gray-400">· {sec.title.toLowerCase()}</span>}
              </span>
              <div className="flex flex-1 flex-wrap gap-1.5">
                {trucks.map((truckId, i) => (
                  <span key={`${truckId}-${i}`} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium", sec.chip)}>
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
