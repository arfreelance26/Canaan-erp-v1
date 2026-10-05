"use client";

import { useEffect, useState } from "react";
import { Activity, X } from "lucide-react";
import { activityApi, type ActivityEventRow, type ActivitySummaryRow } from "@/lib/api";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { PillSearch } from "@/components/ui/PillSearch";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { todayIst, formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const KINDS = ["", "save", "delete", "export", "login", "login_failed", "logout", "view", "click"] as const;

const KIND_STYLE: Record<string, string> = {
  save: "bg-blue-50 text-blue-700",
  delete: "bg-red-50 text-red-700",
  export: "bg-violet-50 text-violet-700",
  login: "bg-emerald-50 text-emerald-700",
  login_failed: "bg-amber-50 text-amber-700",
  logout: "bg-gray-100 text-gray-600",
  view: "bg-sky-50 text-sky-700",
  click: "bg-indigo-50 text-indigo-700",
  reads: "bg-gray-100 text-gray-600",
};

type TimelineItem = {
  time: string;
  type: string;
  kind: string;
  method: string | null;
  route: string;
  label: string | null;
  status: number | null;
  count: number | null;
  last?: string | null;
};

// One readable line per timeline entry. Reads show how many times that screen was loaded in the minute.
function describe(item: TimelineItem): string {
  switch (item.kind) {
    case "login": return "Logged in";
    case "login_failed": return "Failed login attempt";
    case "logout": return "Logged out";
    case "save": return `Saved — ${item.method ?? ""} ${item.route}${item.status ? ` (${item.status})` : ""}`;
    case "delete": return `Deleted — ${item.method ?? ""} ${item.route}${item.status ? ` (${item.status})` : ""}`;
    case "export": return `Exported — ${item.route}`;
    case "view": return `Opened ${item.route}`;
    case "click": return `Clicked “${item.label ?? ""}” on ${item.route}`;
    case "reads": {
      const times = item.last && item.last !== item.time ? ` (${clock(item.time)}–${clock(item.last)})` : "";
      return `Loaded ${item.route}${item.count && item.count > 1 ? ` ×${item.count}` : ""}${times}`;
    }
    default: return `${item.kind} ${item.route}`;
  }
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export default function ActivityLogPage() {
  const [day, setDay] = useState(todayIst());
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("");
  const [summary, setSummary] = useState<ActivitySummaryRow[]>([]);
  const [events, setEvents] = useState<ActivityEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [timelineUser, setTimelineUser] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setRefreshKey((k) => k + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      activityApi.summary(day),
      activityApi.events({ day, user: search.trim() || undefined, kind: kind || undefined, limit: 300 }),
    ])
      .then(([s, e]) => {
        if (cancelled) return;
        setSummary(s);
        setEvents(e);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [day, search, kind, refreshKey]);

  useEffect(() => {
    if (!timelineUser) return;
    let cancelled = false;
    setTimelineLoading(true);
    activityApi.timeline(timelineUser, day)
      .then((items) => { if (!cancelled) setTimeline(items); })
      .catch(() => { if (!cancelled) setTimeline([]); })
      .finally(() => { if (!cancelled) setTimelineLoading(false); });
    return () => { cancelled = true; };
  }, [timelineUser, day, refreshKey]);

  if (loading && summary.length === 0 && events.length === 0) {
    return <PageSkeleton hasButton={false} hasSearch columns={4} />;
  }

  const totals = summary.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      saves: acc.saves + r.saves,
      deletes: acc.deletes + r.deletes,
      logins: acc.logins + r.logins,
      failed: acc.failed + r.failedLogins,
    }),
    { total: 0, saves: 0, deletes: 0, logins: 0, failed: 0 },
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
            <Activity className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Activity Log</h1>
            <p className="mt-0.5 text-sm text-gray-500">Everything each employee did in the app, refreshed every 15 seconds</p>
          </div>
        </div>
        <DatePickerInput value={day} onChange={setDay} className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Events", value: totals.total },
          { label: "Saves", value: totals.saves },
          { label: "Deletes", value: totals.deletes },
          { label: "Logins", value: totals.logins },
          { label: "Failed logins", value: totals.failed },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-medium text-gray-500">{c.label}</p>
            <p className="text-2xl font-bold text-gray-900">{c.value.toLocaleString("en-IN")}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">By employee</h2>
        <p className="mb-3 text-xs text-gray-400">Click a name to see that person&apos;s day as a timeline.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="text-xs uppercase tracking-wider text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Saves</th>
                <th className="px-3 py-2 text-right">Deletes</th>
                <th className="px-3 py-2 text-right">Exports</th>
                <th className="px-3 py-2 text-right">Logins</th>
                <th className="px-3 py-2 text-right">Failed</th>
                <th className="px-3 py-2 text-right">Page views</th>
                <th className="px-3 py-2 text-right">Clicks</th>
                <th className="px-3 py-2 text-right">Reads</th>
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-gray-400">No activity on this day.</td>
                </tr>
              )}
              {summary.map((r) => (
                <tr
                  key={r.userName}
                  className={cn("border-b border-gray-100 hover:bg-gray-50", timelineUser === r.userName && "bg-blue-50/60")}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setTimelineUser(r.userName)}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {r.userName || "—"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.total}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.saves}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.deletes}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.exports}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.logins}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", r.failedLogins > 0 && "text-amber-600 font-semibold")}>{r.failedLogins}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.views}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.clicks}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.reads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {timelineUser && (
        <section className="rounded-xl border border-blue-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Timeline — {timelineUser} · {day}
            </h2>
            <button
              type="button"
              onClick={() => setTimelineUser(null)}
              aria-label="Close timeline"
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {timelineLoading && timeline.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">Loading timeline…</p>
          )}
          {!timelineLoading && timeline.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">Nothing recorded for this person on this day.</p>
          )}
          <ol className="flex max-h-[60vh] flex-col overflow-y-auto border-l-2 border-gray-100 pl-4">
            {timeline.map((item, i) => (
              <li key={`${item.time}-${i}`} className="relative flex items-start gap-3 py-1.5 text-sm">
                <span className="absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-400" />
                <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-gray-400">{clock(item.time)}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", KIND_STYLE[item.kind] ?? "bg-gray-100 text-gray-600")}>
                  {item.kind}
                </span>
                <span className="text-gray-800">{describe(item)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-sm font-semibold text-gray-900">Events</h2>
          <PillSearch placeholder="Filter by employee…" value={search} onChange={setSearch} />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
            className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            {KINDS.map((k) => (
              <option key={k || "all"} value={k}>{k || "All kinds"}</option>
            ))}
          </select>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="sticky top-0 bg-white text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">What</th>
                <th className="px-3 py-2 text-right">Status</th>
                <th className="px-3 py-2 text-right">ms</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-400">No events match these filters.</td>
                </tr>
              )}
              {events.map((e) => (
                <tr key={e.id} className="border-b border-gray-100">
                  <td className="px-3 py-1.5 text-gray-500">{formatDateTime(e.createdAt)}</td>
                  <td className="px-3 py-1.5 font-medium text-gray-800">{e.userName || "—"}</td>
                  <td className="px-3 py-1.5">
                    <span className={cn("rounded-full px-2 py-0.5 font-semibold", KIND_STYLE[e.kind] ?? "bg-gray-100 text-gray-600")}>{e.kind}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-gray-600">{e.method ? `${e.method} ` : ""}{e.route}</td>
                  <td className="px-3 py-1.5 text-gray-700">{e.label ?? ""}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{e.status ?? ""}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{e.durationMs ?? ""}</td>
                  <td className="px-3 py-1.5 text-gray-500">{e.ip ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
