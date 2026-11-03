"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiComputerLine as Monitor, RiCheckboxBlankCircleLine as Circle, RiLoginBoxLine as LogIn, RiFlashlightLine as Zap, RiMoonLine as Moon, RiListCheck3 as ListChecks } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { usageApi, type UsageOverviewRow, type UsageDetail } from "@/lib/api";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { Dialog } from "@/components/ui/Dialog";
import { todayIst, formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0 && m === 0) return "0m";
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function sourceLabel(source: string): string {
  // "driver_edit_events" -> "Driver"
  return source
    .replace(/_edit_events$|_events$/, "")
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export default function UsageAnalyticsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.softwareDesignation === "Admin";

  useEffect(() => {
    if (user && !isAdmin) router.replace("/");
  }, [user, isAdmin, router]);

  const [rows, setRows] = useState<UsageOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(todayIst());
  const [dateTo, setDateTo] = useState(todayIst());
  const [viewing, setViewing] = useState<UsageOverviewRow | null>(null);
  const [detail, setDetail] = useState<UsageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  function load() {
    if (!isAdmin) return;
    setLoading(true);
    usageApi
      .getOverview(dateFrom, dateTo)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, [isAdmin, dateFrom, dateTo]);

  function openDetail(row: UsageOverviewRow) {
    setViewing(row);
    setDetail(null);
    setDetailLoading(true);
    usageApi
      .getDetail(row.staffId, dateFrom, dateTo)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }

  if (!user || !isAdmin) return null;
  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || r.staffName.toLowerCase().includes(q) || (r.staffRole ?? "").toLowerCase().includes(q));

  const totals = rows.reduce(
    (acc, r) => ({
      active: acc.active + r.totalActiveSeconds,
      idle: acc.idle + r.totalIdleSeconds,
      actions: acc.actions + r.actionCount,
      online: acc.online + (r.isOnline ? 1 : 0),
    }),
    { active: 0, idle: 0, actions: 0, online: 0 }
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
          <Monitor className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">SW Usage Analytics</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Login/active/idle time, module usage, and actions performed per employee — a utilization view, not a performance score
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Online Now</p>
          <p className="mt-1 text-title-1-semibold text-success-text">{totals.online}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Total Active Time</p>
          <p className="mt-1 text-title-1-semibold text-accent-text">{formatDuration(totals.active)}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Total Idle Time</p>
          <p className="mt-1 text-title-1-semibold text-warning-text">{formatDuration(totals.idle)}</p>
        </div>
        <div className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <p className="text-caption-1-medium text-text-secondary">Actions Performed</p>
          <p className="mt-1 text-title-1-semibold text-text-primary">{totals.actions}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by name or role…" value={search} onChange={setSearch} />
        <div className="ml-auto">
          <DateRangePill from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-separator-border bg-background-primary-default">
        {filtered.length === 0 ? (
          <EmptyState size="compact" illustration="not-found" title={rows.length === 0 ? "No usage data for this range yet" : "No employees match this search"} />
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="border-b border-separator-border bg-fill-1">
              <tr>
                <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary">Employee</th>
                <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary">Role</th>
                <th className="px-4 py-3 text-right text-caption-1-semibold text-text-secondary">Login Time</th>
                <th className="px-4 py-3 text-right text-caption-1-semibold text-text-secondary">Active</th>
                <th className="px-4 py-3 text-right text-caption-1-semibold text-text-secondary">Idle</th>
                <th className="px-4 py-3 text-right text-caption-1-semibold text-text-secondary">Actions</th>
                <th className="px-4 py-3 text-right text-caption-1-semibold text-text-secondary">Last Seen</th>
              </tr>
            </thead>
            <PagedTbody className="divide-y divide-separator-border" items={filtered}>
              {(r) => (
                <tr
                  key={r.staffId}
                  onClick={() => openDetail(r)}
                  className="cursor-pointer transition-colors hover:bg-fill-2"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Circle className={cn("h-2 w-2 shrink-0", r.isOnline ? "fill-success-solid text-success-text" : "fill-foreground-icon-quaternary text-text-tertiary")} />
                      <span className="font-medium text-text-primary">{r.staffName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{r.staffRole ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-primary">{formatDuration(r.totalLoginSeconds)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-accent-text">{formatDuration(r.totalActiveSeconds)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-warning-text">{formatDuration(r.totalIdleSeconds)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-primary">{r.actionCount}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{r.lastSeenAt ? formatDateTime(r.lastSeenAt) : "—"}</td>
                </tr>
              )}
            </PagedTbody>
          </table>
        )}
      </div>

      {/* Detail drill-down */}
      <Dialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.staffName} — Usage Detail` : "Usage Detail"}
        className="sm:max-w-2xl"
      >
        {detailLoading || !detail ? (
          <p className="py-8 text-center text-sm text-text-tertiary">Loading…</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-separator-border bg-fill-1 p-3">
                <p className="flex items-center gap-1 text-caption-2-semibold text-text-tertiary"><LogIn className="h-3 w-3" /> Login</p>
                <p className="mt-1 text-title-3-semibold text-text-primary">{formatDuration(detail.totalLoginSeconds)}</p>
              </div>
              <div className="rounded-lg border border-separator-border bg-fill-1 p-3">
                <p className="flex items-center gap-1 text-caption-2-semibold text-text-tertiary"><Zap className="h-3 w-3" /> Active</p>
                <p className="mt-1 text-title-3-semibold text-accent-text">{formatDuration(detail.totalActiveSeconds)}</p>
              </div>
              <div className="rounded-lg border border-separator-border bg-fill-1 p-3">
                <p className="flex items-center gap-1 text-caption-2-semibold text-text-tertiary"><Moon className="h-3 w-3" /> Idle</p>
                <p className="mt-1 text-title-3-semibold text-warning-text">{formatDuration(detail.totalIdleSeconds)}</p>
              </div>
              <div className="rounded-lg border border-separator-border bg-fill-1 p-3">
                <p className="flex items-center gap-1 text-caption-2-semibold text-text-tertiary"><ListChecks className="h-3 w-3" /> Actions</p>
                <p className="mt-1 text-title-3-semibold text-text-primary">{detail.actionCount}</p>
              </div>
            </div>

            {/* Module usage breakdown */}
            <div>
              <p className="mb-2 text-caption-1-semibold text-text-tertiary">Module Usage (active time)</p>
              {detail.modules.length === 0 ? (
                <p className="text-sm text-text-tertiary">No module activity logged in this range.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {(() => {
                    const max = Math.max(...detail.modules.map((m) => m.activeSeconds), 1);
                    return detail.modules.map((m) => (
                      <div key={m.module} className="flex items-center gap-3">
                        <span className="w-44 shrink-0 truncate text-sm text-text-primary">{m.module}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-fill-2">
                          <div
                            className="h-full rounded-full bg-accent-solid"
                            style={{ width: `${Math.max((m.activeSeconds / max) * 100, 2)}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right text-caption-1-semibold text-text-secondary">{formatDuration(m.activeSeconds)}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* Recent actions */}
            <div>
              <p className="mb-2 text-caption-1-semibold text-text-tertiary">Recent Actions</p>
              {detail.recentActions.length === 0 ? (
                <p className="text-sm text-text-tertiary">No actions logged in this range.</p>
              ) : (
                <div className="max-h-56 overflow-auto rounded-lg border border-separator-border">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="sticky top-0 bg-fill-1">
                      <tr className="border-b border-separator-border">
                        <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Area</th>
                        <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                        <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                      </tr>
                    </thead>
                    <PagedTbody className="divide-y divide-separator-border" items={detail.recentActions}>
                      {(a, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-text-secondary">{sourceLabel(a.source)}</td>
                          <td className="px-3 py-2 font-medium text-text-primary">{a.event}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(a.createdAt)}</td>
                        </tr>
                      )}
                    </PagedTbody>
                  </table>
                </div>
              )}
            </div>

            {/* Sessions */}
            <div>
              <p className="mb-2 text-caption-1-semibold text-text-tertiary">Sessions</p>
              {detail.sessions.length === 0 ? (
                <p className="text-sm text-text-tertiary">No sessions in this range.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {detail.sessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-separator-border bg-fill-1 px-3 py-2 text-xs">
                      <span className="text-text-primary">
                        {formatDateTime(s.loginAt)} → {s.logoutAt ? formatDateTime(s.logoutAt) : "still open"}
                      </span>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-caption-2-semibold",
                        s.endedReason === "timeout" ? "bg-warning-surface-strong text-warning-text" : s.endedReason === "logout" ? "bg-fill-2 text-text-secondary" : "bg-success-surface-strong text-success-text"
                      )}>
                        {s.endedReason === "timeout" ? "Closed without logout" : s.endedReason === "logout" ? "Logged out" : "Open"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
