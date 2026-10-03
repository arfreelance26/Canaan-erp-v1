"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Circle, LogIn, Zap, Moon, ListChecks } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { usageApi, type UsageOverviewRow, type UsageDetail } from "@/lib/api";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { Dialog } from "@/components/ui/Dialog";
import { todayIst, formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

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
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
          <Monitor className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">SW Usage Analytics</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Login/active/idle time, module usage, and actions performed per employee — a utilization view, not a performance score
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Online Now</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{totals.online}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Active Time</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{formatDuration(totals.active)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Total Idle Time</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{formatDuration(totals.idle)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Actions Performed</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{totals.actions}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search by name or role…" value={search} onChange={setSearch} />
        <div className="ml-auto">
          <DateRangePill from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Monitor className="h-8 w-8 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">
              {rows.length === 0 ? "No usage data for this range yet." : "No employees match this search."}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Role</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Login Time</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Active</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Idle</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr
                  key={r.staffId}
                  onClick={() => openDetail(r)}
                  className="cursor-pointer transition-colors hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Circle className={cn("h-2 w-2 shrink-0", r.isOnline ? "fill-emerald-500 text-emerald-500" : "fill-gray-300 text-gray-300")} />
                      <span className="font-medium text-gray-900">{r.staffName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.staffRole ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatDuration(r.totalLoginSeconds)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-blue-700">{formatDuration(r.totalActiveSeconds)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-600">{formatDuration(r.totalIdleSeconds)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.actionCount}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{r.lastSeenAt ? formatDateTime(r.lastSeenAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
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
          <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400"><LogIn className="h-3 w-3" /> Login</p>
                <p className="mt-1 text-lg font-bold text-gray-800">{formatDuration(detail.totalLoginSeconds)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400"><Zap className="h-3 w-3" /> Active</p>
                <p className="mt-1 text-lg font-bold text-blue-700">{formatDuration(detail.totalActiveSeconds)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400"><Moon className="h-3 w-3" /> Idle</p>
                <p className="mt-1 text-lg font-bold text-amber-600">{formatDuration(detail.totalIdleSeconds)}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400"><ListChecks className="h-3 w-3" /> Actions</p>
                <p className="mt-1 text-lg font-bold text-gray-800">{detail.actionCount}</p>
              </div>
            </div>

            {/* Module usage breakdown */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Module Usage (active time)</p>
              {detail.modules.length === 0 ? (
                <p className="text-sm text-gray-400">No module activity logged in this range.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {(() => {
                    const max = Math.max(...detail.modules.map((m) => m.activeSeconds), 1);
                    return detail.modules.map((m) => (
                      <div key={m.module} className="flex items-center gap-3">
                        <span className="w-44 shrink-0 truncate text-sm text-gray-700">{m.module}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${Math.max((m.activeSeconds / max) * 100, 2)}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right text-xs font-semibold text-gray-600">{formatDuration(m.activeSeconds)}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* Recent actions */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Recent Actions</p>
              {detail.recentActions.length === 0 ? (
                <p className="text-sm text-gray-400">No actions logged in this range.</p>
              ) : (
                <div className="max-h-56 overflow-auto rounded-lg border border-gray-100">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="border-b border-gray-100">
                        <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Area</th>
                        <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Action</th>
                        <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detail.recentActions.map((a, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-gray-600">{sourceLabel(a.source)}</td>
                          <td className="px-3 py-2 font-medium text-gray-800">{a.event}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDateTime(a.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Sessions */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Sessions</p>
              {detail.sessions.length === 0 ? (
                <p className="text-sm text-gray-400">No sessions in this range.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {detail.sessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                      <span className="text-gray-700">
                        {formatDateTime(s.loginAt)} → {s.logoutAt ? formatDateTime(s.logoutAt) : "still open"}
                      </span>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        s.endedReason === "timeout" ? "bg-amber-100 text-amber-700" : s.endedReason === "logout" ? "bg-gray-100 text-gray-600" : "bg-emerald-100 text-emerald-700"
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
