"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RiShieldCheckLine as ShieldCheck, RiArrowRightUpLine as OpenIcon } from "@remixicon/react";
import type { Truck } from "@/types/truck";
import { getComplianceStatus, isMissingCost, NO_COST_TAG, type ComplianceField } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import { PillSearch } from "@/components/ui/PillSearch";
import { useAuth } from "@/context/AuthContext";
import { ROLE_HREFS } from "@/lib/nav-config";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";

type Status = "valid" | "soon" | "expired" | "missing";
/** The header pills are the filter: click one to show only those trucks. */
type Filter = "all" | "valid" | "soon" | "expired" | "missing" | "nocost";

// All seven documents, the same set (and warning windows, lib/compliance) as
// Compliance & Renewals and the alert banner above this card — so every count agrees.
const DOCS: { label: string; title: string; field: keyof Truck; cost: keyof Truck; kind: ComplianceField }[] = [
  { label: "Insurance", title: "Insurance", field: "insuranceExpiryDate", cost: "insuranceExpenses", kind: "insurance" },
  { label: "FC", title: "Fitness Certificate", field: "fcExpiryDate", cost: "fcExpenses", kind: "fc" },
  { label: "RC", title: "Registration Certificate", field: "rcValidityDate", cost: "rcExpenses", kind: "rc" },
  { label: "Nat. Permit", title: "National Permit", field: "nationalPermitDate", cost: "nationalPermitExpenses", kind: "nationalPermit" },
  { label: "Local Permit", title: "Local Permit", field: "localPermitDate", cost: "localPermitExpenses", kind: "localPermit" },
  { label: "Road Tax", title: "Road Tax", field: "roadTaxDate", cost: "roadTaxExpenses", kind: "roadTax" },
  { label: "PUC", title: "Pollution Certificate", field: "pollutionCertificateDate", cost: "pollutionCertificateExpenses", kind: "pollution" },
];

const CHIP: Record<Status, { label: string; cls: string }> = {
  valid: { label: "Valid", cls: "bg-success-surface text-success-text" },
  soon: { label: "Expiring", cls: "bg-warning-surface text-warning-text" },
  expired: { label: "Expired", cls: "bg-danger-surface text-danger-text" },
  missing: { label: "Not Uploaded", cls: "bg-fill-2 text-text-secondary" },
};

const PILLS: { key: Exclude<Filter, "all">; word: string; on: string; off: string; dot: string }[] = [
  { key: "valid", word: "valid", on: "bg-success-solid text-on-solid", off: "bg-success-surface text-success-text", dot: "bg-success-solid" },
  { key: "soon", word: "expiring soon", on: "bg-warning-solid text-on-solid", off: "bg-warning-surface text-warning-text", dot: "bg-warning-solid" },
  { key: "expired", word: "expired", on: "bg-danger-solid text-on-solid", off: "bg-danger-surface text-danger-text", dot: "bg-danger-solid" },
  { key: "missing", word: "not uploaded", on: "bg-text-secondary text-on-solid", off: "bg-fill-2 text-text-secondary", dot: "bg-text-tertiary" },
  { key: "nocost", word: "no cost", on: "bg-accent-solid text-on-solid", off: NO_COST_TAG, dot: "bg-accent-solid" },
];

type Cell = { status: Status; date: string; noCost: boolean; days: number | null };
type Row = { truck: Truck; cells: Cell[]; counts: Record<Status | "nocost", number>; worst: Status };

const RANK: Record<Status, number> = { expired: 3, soon: 2, missing: 1, valid: 0 };

function daysFromToday(date: string): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

/** "today", "3 days ago", "in 5 days", "4 mo ago", "7 yrs ago". */
function when(days: number): string {
  const n = Math.abs(days);
  const span = n < 60 ? `${n} day${n === 1 ? "" : "s"}` : n < 730 ? `${Math.round(n / 30.4)} mo` : `${Math.floor(n / 365)} yrs`;
  if (days === 0) return "today";
  return days < 0 ? `${span} ago` : `in ${span}`;
}

export function ComplianceOverviewCard({ trucks }: { trucks: Truck[] }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // A truck opens Compliance & Renewals (where documents are renewed) for those who can open it.
  const hrefs = ROLE_HREFS[user?.softwareDesignation ?? ""];
  const canOpen = hrefs === "all" || (Array.isArray(hrefs) && hrefs.includes("/maintenance/compliance"));

  const { rows, totals } = useMemo(() => {
    const totals: Record<Status | "nocost", number> = { valid: 0, soon: 0, expired: 0, missing: 0, nocost: 0 };
    const list: Row[] = trucks.map((truck) => {
      const counts: Record<Status | "nocost", number> = { valid: 0, soon: 0, expired: 0, missing: 0, nocost: 0 };
      const cells = DOCS.map(({ field, cost, kind }): Cell => {
        const date = (truck[field] as string | undefined) ?? "";
        const s = getComplianceStatus(date, kind);
        const status: Status = s === "Expired" ? "expired" : s === "Expiring Soon" ? "soon" : s === "Not Uploaded" ? "missing" : "valid";
        const noCost = isMissingCost(date, truck[cost] as string | number | undefined);
        counts[status] += 1;
        if (noCost) counts.nocost += 1;
        return { status, date, noCost, days: date ? daysFromToday(date) : null };
      });
      for (const k of Object.keys(totals) as (Status | "nocost")[]) totals[k] += counts[k];
      const worst = (Object.keys(RANK) as Status[]).filter((s) => counts[s] > 0).sort((a, b) => RANK[b] - RANK[a])[0] ?? "valid";
      return { truck, cells, counts, worst };
    });
    list.sort(
      (a, b) =>
        b.counts.expired - a.counts.expired ||
        b.counts.soon - a.counts.soon ||
        b.counts.missing - a.counts.missing ||
        (a.truck.registrationNumber || "").localeCompare(b.truck.registrationNumber || "")
    );
    return { rows: list, totals };
  }, [trucks]);

  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (filter !== "all" && r.counts[filter] === 0) return false;
    if (!q) return true;
    return (
      (r.truck.registrationNumber || "").toLowerCase().includes(q) ||
      (r.truck.truckId || "").toLowerCase().includes(q)
    );
  });

  const trucksWithExpired = rows.filter((r) => r.counts.expired > 0).length;
  const pillLabel = PILLS.find((p) => p.key === filter)?.word;

  return (
    <div data-tour="compliance" className="overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
      {/* Header: the totals, which are also the filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator-border bg-accent-surface/70 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-surface-strong text-accent-text">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-body-semibold text-text-primary">Compliance Overview</h2>
            <p className="text-xs text-text-secondary">
              {trucksWithExpired === 0
                ? `No expired documents across ${rows.length} trucks`
                : `${trucksWithExpired} of ${rows.length} trucks have an expired document`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-caption-1-semibold" role="group" aria-label="Show trucks with">
          {PILLS.filter((p) => totals[p.key] > 0 || filter === p.key).map((p) => {
            const active = filter === p.key;
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(active ? "all" : p.key)}
                title={active ? "Show all trucks" : `Show only trucks with ${p.word} documents`}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all duration-200 hover:shadow-sm",
                  active ? p.on : p.off,
                  !active && filter !== "all" && "opacity-60 hover:opacity-100",
                )}
              >
                <i className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-on-solid" : p.dot)} />
                <span className="tabular-nums">{totals[p.key]}</span> {p.word}
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <p className="text-caption-1-medium text-text-secondary">
          {filter === "all" ? "All trucks · worst first" : (
            <>
              Trucks with <span className="font-semibold text-text-primary">{pillLabel}</span> documents ·{" "}
              <button type="button" onClick={() => setFilter("all")} className="font-semibold text-accent-text hover:underline">show all</button>
            </>
          )}
        </p>
        <PillSearch size="sm" value={query} onChange={setQuery} placeholder="Search truck…" />
      </div>

      {/* Table */}
      <div className="p-4">
        <div className="overflow-hidden rounded-xl border border-separator-border">
          <div className="custom-scrollbar max-h-96 overflow-auto">
            <table className="w-full min-w-[880px] text-left text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-separator-border bg-fill-1">
                  <th className="px-4 py-2.5 text-caption-2-semibold text-text-secondary">Truck</th>
                  {DOCS.map((d) => (
                    <th key={d.label} title={d.title} className="px-3 py-2.5 text-caption-2-semibold text-text-secondary">
                      {d.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <PagedTbody className="divide-y divide-separator-border" items={visible} head={<>{visible.length === 0 ? (
                  <tr>
                    <td colSpan={DOCS.length + 1} className="p-0"><EmptyState size="compact" illustration={rows.length === 0 ? "logistics" : "not-found"} title={rows.length === 0 ? "No trucks in the fleet yet" : "No trucks match this filter"} /></td>
                  </tr>
                ) : null}</>}>
                {(r) => {
                  const reg = r.truck.registrationNumber || r.truck.truckId;
                  return (
                    <tr key={r.truck.id} className="transition-colors hover:bg-fill-2">
                      <td className="relative px-4 py-2.5">
                        {r.worst !== "valid" && (
                          <span
                            className={cn(
                              "absolute inset-y-2 left-0 w-1 rounded-r-full",
                              r.worst === "expired" ? "bg-danger-solid" : r.worst === "soon" ? "bg-warning-solid" : "bg-fill-4",
                            )}
                          />
                        )}
                        {canOpen ? (
                          <Link
                            href={`/maintenance/compliance?search=${encodeURIComponent(reg)}`}
                            title="Open in Compliance & Renewals"
                            className="group inline-flex items-center gap-1 text-caption-1-semibold text-text-primary hover:text-accent-text"
                          >
                            {reg}
                            <OpenIcon className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                          </Link>
                        ) : (
                          <p className="text-caption-1-semibold text-text-primary">{reg}</p>
                        )}
                        <p className="text-[11px] text-text-tertiary">{r.truck.truckId}</p>
                      </td>
                      {r.cells.map((c, i) => (
                        <td key={DOCS[i].label} className="px-3 py-2.5">
                          <div className="flex flex-col items-start gap-0.5" title={c.date ? `${DOCS[i].title}: ${formatDate(c.date)}` : `${DOCS[i].title}: not uploaded`}>
                            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption-2-semibold", CHIP[c.status].cls)}>
                              <i className="h-1 w-1 rounded-full bg-current" />
                              {CHIP[c.status].label}
                            </span>
                            {c.days !== null && c.status !== "valid" && (
                              <span className={cn("pl-1 text-[10px] tabular-nums", c.status === "expired" ? "text-danger-text" : "text-warning-text")}>
                                {when(c.days)}
                              </span>
                            )}
                            {c.status === "valid" && <span className="pl-1 text-[10px] tabular-nums text-text-tertiary">{formatDate(c.date)}</span>}
                            {c.noCost && (
                              <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", NO_COST_TAG)}>No Cost</span>
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                }}
              </PagedTbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-text-secondary">
          Showing <span className="font-semibold tabular-nums text-text-primary">{visible.length}</span> of {rows.length} trucks
          {canOpen && " · click a truck to renew its documents"}
        </p>
      </div>
    </div>
  );
}
