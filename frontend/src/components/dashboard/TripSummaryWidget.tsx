"use client";

import { useEffect, useState } from "react";
import { RiCheckboxCircleLine as CheckCircle2, RiFileWarningLine as FileWarning, RiNavigationLine as Navigation, RiArrowRightLine as ArrowRight, RiPulseLine as Activity } from "@remixicon/react";
import { dashboardApi, type TripsOverview, type TripOverviewRow } from "@/lib/api";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

/* ── Status badges — same pill pattern used across the app ─────────────────── */
const STATUS_PILL: Record<string, string> = {
  Assigned:     "bg-teal-surface-strong text-teal-text",
  Started:      "bg-accent-surface-strong text-accent-text",
  Loaded:       "bg-purple-surface-strong text-purple-text",
  "On-Transit": "bg-purple-surface-strong text-purple-text",
  Reached:      "bg-teal-surface-strong text-teal-text",
  Unloaded:     "bg-teal-surface-strong text-teal-text",
  Completed:    "bg-success-surface-strong text-success-text",
};

const STATUS_DOT: Record<string, string> = {
  Assigned:     "bg-teal-solid",
  Started:      "bg-accent-solid",
  Loaded:       "bg-purple-solid",
  "On-Transit": "bg-purple-solid",
  Reached:      "bg-teal-solid",
  Unloaded:     "bg-teal-solid",
  Completed:    "bg-success-solid",
};

/* ── Section config — mirrors StatCard variants ────────────────────────────── */
const SECTIONS = [
  {
    key:      "currentTrips"        as const,
    icon:     Navigation,
    label:    "Current Trips",
    sublabel: "trips on road",
    /* StatCard "blue" variant */
    card:     "border-accent-border bg-accent-surface",
    iconCls:  "text-accent-text",
    titleCls: "text-accent-text",
    valueCls: "text-accent-text-strong",
    capCls:   "text-accent-text/80",
    /* section header in table */
    headCls:  "text-accent-text",
  },
  {
    key:      "completedTrips"      as const,
    icon:     CheckCircle2,
    label:    "Completed",
    sublabel: "total finished",
    /* StatCard "emerald" variant */
    card:     "border-success-border bg-success-surface",
    iconCls:  "text-success-text",
    titleCls: "text-success-text",
    valueCls: "text-success-text-strong",
    capCls:   "text-success-text/80",
    headCls:  "text-success-text",
  },
  {
    key:      "pendingInvoiceTrips" as const,
    icon:     FileWarning,
    label:    "Pending Invoice",
    sublabel: "awaiting billing",
    /* StatCard "amber" variant */
    card:     "border-warning-border bg-warning-surface",
    iconCls:  "text-warning-text",
    titleCls: "text-warning-text",
    valueCls: "text-warning-text-strong",
    capCls:   "text-warning-text/80",
    headCls:  "text-warning-text",
  },
] as const;

function fmtDate(d?: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/* ── Stat tile (matches StatCard layout exactly) ───────────────────────────── */
function StatTile({
  icon: Icon, label, sublabel, value, card, iconCls, titleCls, valueCls, capCls,
}: {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  value: number | string;
  card: string;
  iconCls: string;
  titleCls: string;
  valueCls: string;
  capCls: string;
}) {
  return (
    <div className={cn("rounded-xl border p-5", card)}>
      <div className="flex items-center justify-between">
        <p className={cn("text-caption-1-semibold", titleCls)}>{label}</p>
        <Icon className={cn("h-5 w-5", iconCls)} />
      </div>
      <p className={cn("mt-2 text-display-4-semibold", valueCls)}><AnimatedNumber value={value} /></p>
      <p className={cn("mt-1 text-sm", capCls)}>{sublabel}</p>
    </div>
  );
}

/* ── Section header row inside table ───────────────────────────────────────── */
function SectionHeader({ icon: Icon, label, count, headCls }: {
  icon: React.ElementType; label: string; count: number; headCls: string;
}) {
  return (
    <tr>
      <td colSpan={5} className="px-5 pt-5 pb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-3.5 w-3.5", headCls)} />
          <span className={cn("text-caption-2-semibold", headCls)}>{label}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-caption-2-semibold leading-none", headCls, "bg-current/10")}>
            {count}
          </span>
          <div className="ml-1 flex-1 border-t border-separator-border" />
        </div>
      </td>
    </tr>
  );
}

/* ── Trip row ──────────────────────────────────────────────────────────────── */
function TripRow({ row }: { row: TripOverviewRow }) {
  return (
    <tr className="transition-colors hover:bg-fill-2">
      <td className="px-5 py-3">
        <span className="text-caption-1-semibold text-text-primary">{row.tripId}</span>
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <span className="max-w-[100px] truncate">{row.origin || "—"}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-text-tertiary" />
          <span className="max-w-[100px] truncate">{row.destination || "—"}</span>
        </div>
      </td>
      <td className="px-5 py-3">
        <p className="text-caption-1-medium text-text-primary">{row.truckRegistration || "—"}</p>
        <p className="text-[10px] text-text-tertiary">{row.driverName || ""}</p>
      </td>
      <td className="px-5 py-3">
        <span className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption-2-semibold",
          STATUS_PILL[row.status] ?? "bg-fill-2 text-text-secondary",
        )}>
          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[row.status] ?? "bg-fill-4")} />
          {row.status}
        </span>
      </td>
      <td className="px-5 py-3 text-[11px] text-text-tertiary whitespace-nowrap">
        {fmtDate(row.scheduledDate)}
      </td>
    </tr>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={5} className="px-5 py-3 text-center text-xs text-text-tertiary">No trips</td>
    </tr>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 p-5">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="h-4 w-16 animate-pulse rounded bg-fill-2" />
          <div className="h-4 flex-1 animate-pulse rounded bg-fill-2" />
          <div className="h-4 w-20 animate-pulse rounded bg-fill-2" />
        </div>
      ))}
    </div>
  );
}

/* ── Main widget ───────────────────────────────────────────────────────────── */
export function TripSummaryWidget() {
  const [data, setData] = useState<TripsOverview | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    dashboardApi.tripsOverview().then(setData).catch(() => {});
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey((k) => k + 1), 30000);
  useWebSocketEvent("trip_created", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_updated", () => setRefreshKey((k) => k + 1));
  useWebSocketEvent("trip_closed",  () => setRefreshKey((k) => k + 1));

  return (
    <div className="flex flex-col gap-4">

      {/* ── Widget title ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5">
        <Activity className="h-5 w-5 text-text-tertiary" />
        <div>
          <p className="text-caption-2-semibold text-text-tertiary">Live Dashboard</p>
          <h2 className="text-headline-semibold leading-tight text-text-primary">Trip Status Overview</h2>
        </div>
      </div>

      {/* ── Stat tiles — same layout as dashboard StatCards ─────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SECTIONS.map((sec) => (
          <StatTile
            key={sec.key}
            icon={sec.icon}
            label={sec.label}
            sublabel={sec.sublabel}
            value={data ? (data[sec.key] as TripOverviewRow[]).length : "—"}
            card={sec.card}
            iconCls={sec.iconCls}
            titleCls={sec.titleCls}
            valueCls={sec.valueCls}
            capCls={sec.capCls}
          />
        ))}
      </div>

      {/* ── Table card ──────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-separator-border bg-background-primary-default">
        {!data ? (
          <Skeleton />
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-separator-border bg-fill-1">
                  {["Trip ID", "Route", "Vehicle / Driver", "Status", "Date"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-5 py-3 text-caption-2-semibold text-text-tertiary">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-separator-border">
                {SECTIONS.map((sec) => {
                  const rows = data[sec.key] as TripOverviewRow[];
                  return (
                    <SectionGroup
                      key={sec.key}
                      icon={sec.icon}
                      label={sec.label}
                      headCls={sec.headCls}
                      rows={rows}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionGroup({ icon, label, headCls, rows }: {
  icon: React.ElementType; label: string; headCls: string; rows: TripOverviewRow[];
}) {
  return (
    <>
      <SectionHeader icon={icon} label={label} count={rows.length} headCls={headCls} />
      {rows.length === 0 ? <EmptyRow /> : rows.map((r) => <TripRow key={r.tripId} row={r} />)}
    </>
  );
}
