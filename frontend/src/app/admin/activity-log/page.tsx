"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, ArrowUp, Eye, Loader2, Monitor, Pause, Play, ShieldAlert, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  activityApi,
  type ActivityAlert,
  type ActivityEventRow,
  type ActivityOverview,
  type ActivitySummaryRow,
  type ActivityTimelineItem,
  notesApi,
  type NoteAdminUsageRow,
} from "@/lib/api";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { PillSearch } from "@/components/ui/PillSearch";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { ExportPreviewDialog, type PreviewSheet } from "@/components/ui/ExportPreviewDialog";
import { todayIst, formatDateTime } from "@/lib/format-date";
import { sidebarSections } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/swal";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { TAB_CLOSED_LABEL } from "@/hooks/useActivityTracking";

const PAGE_SIZE = 100;
const FALLBACK_POLL_MS = 30_000;
const DASHBOARD_MIN_GAP_MS = 10_000;
const LIVE_DEBOUNCE_MS = 1_200;

const KIND_OPTIONS = ["save", "delete", "export", "login", "login_failed", "logout", "view", "click"] as const;
const KIND_LABEL: Record<string, string> = {
  save: "Saves", delete: "Deletes", export: "Exports", login: "Logins",
  login_failed: "Failed logins", logout: "Logouts", view: "Page views", click: "Clicks",
};
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
const CHART_SERIES = [
  { key: "saves", label: "Saves", color: "#2563eb" },
  { key: "deletes", label: "Deletes", color: "#dc2626" },
  { key: "exports", label: "Exports", color: "#7c3aed" },
  { key: "logins", label: "Logins / outs", color: "#059669" },
  { key: "views", label: "Page views", color: "#0ea5e9" },
  { key: "clicks", label: "Clicks", color: "#a5b4fc" },
] as const;
const SEVERITY_STYLE: Record<ActivityAlert["severity"], string> = {
  high: "border-red-200 bg-red-50 text-red-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-gray-200 bg-gray-50 text-gray-700",
};

// -- Plain-English route names ------------------------------------------------

function normalizePath(p: string): string {
  return p.split("?")[0].replace(/\/+$/, "") || "/";
}

/** Browser page paths → the same names people see in the sidebar. */
const SCREEN_NAMES: Record<string, string> = Object.fromEntries(
  sidebarSections.flatMap((s) => s.items.map((i) => [normalizePath(i.href), i.label])),
);

/** API paths → the area of the app they belong to. */
const API_AREAS: Record<string, string> = {
  trips: "Trips", attendance: "Attendance", resources: "Resources", maintenance: "Maintenance",
  finance: "Finance", insights: "Insights", chat: "Canaan Chat", connect: "Canaan Chat", admin: "Admin",
  personal: "Personal", auth: "Login", files: "Documents", events: "Meetings", "room-summon": "Invites",
  notes: "Notes",
};

function areaName(route: string): string {
  const segment = normalizePath(route).split("/").filter(Boolean)[0] ?? "";
  if (API_AREAS[segment]) return API_AREAS[segment];
  if (!segment) return "the app";
  return segment.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function screenName(route: string): string {
  const path = normalizePath(route);
  if (SCREEN_NAMES[path]) return SCREEN_NAMES[path];
  if (path === "/login") return "Login";
  return areaName(path);
}

type Describable = { kind: string; route: string; label: string | null; status: number | null };

function describeActivity(e: Describable): string {
  const failed = e.status != null && e.status >= 400;
  switch (e.kind) {
    case "login": return "Logged in";
    case "login_failed": return "Failed login attempt";
    case "logout": return "Logged out";
    case "save": return failed ? `Tried to save in ${areaName(e.route)} — didn't go through` : `Saved changes in ${areaName(e.route)}`;
    case "delete": return failed ? `Tried to delete in ${areaName(e.route)} — didn't go through` : `Deleted something in ${areaName(e.route)}`;
    case "export": return `Exported a file from ${areaName(e.route)}`;
    case "view": return `Opened ${screenName(e.route)}`;
    case "click":
      if (e.label === TAB_CLOSED_LABEL) return `Left ${screenName(e.route)} (closed tab or navigated away)`;
      return e.label ? `Clicked "${e.label}" in ${screenName(e.route)}` : `Clicked something in ${screenName(e.route)}`;
    default: return `${e.kind} in ${areaName(e.route)}`;
  }
}

function describeTimeline(item: ActivityTimelineItem): string {
  if (item.kind === "reads") {
    const span = item.last && item.last !== item.time ? ` (${clock(item.time)}–${clock(item.last)})` : "";
    return `Loaded ${areaName(item.route)}${item.count && item.count > 1 ? ` ×${item.count}` : ""}${span}`;
  }
  return describeActivity(item);
}

// -- Time helpers -------------------------------------------------------------

function clock(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function duration(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function ago(iso: string | null, now: number): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

// -- Page -----------------------------------------------------------------------

export default function ActivityLogPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.softwareDesignation === "Admin";

  useEffect(() => {
    if (user && !isAdmin) router.replace("/");
  }, [user, isAdmin, router]);

  const [day, setDay] = useState(todayIst());
  const [summary, setSummary] = useState<ActivitySummaryRow[]>([]);
  const [overview, setOverview] = useState<ActivityOverview | null>(null);
  const [notesUsage, setNotesUsage] = useState<NoteAdminUsageRow[]>([]);
  const [dashLoading, setDashLoading] = useState(true);

  // Events list filters (date range defaults to the selected day).
  const [rangeFrom, setRangeFrom] = useState(day);
  const [rangeTo, setRangeTo] = useState(day);
  const [search, setSearch] = useState("");
  const [screen, setScreen] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [role, setRole] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);

  const [events, setEvents] = useState<ActivityEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const [live, setLive] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [drawerUser, setDrawerUser] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<ActivityTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [exportPreview, setExportPreview] = useState<{ blob: Blob; filename: string; sheets: PreviewSheet[] } | null>(null);
  const [preparingExport, setPreparingExport] = useState(false);

  const today = todayIst();
  const liveActive = live && (day === today || rangeTo >= today);

  const filters = useMemo(
    () => ({
      dateFrom: rangeFrom || undefined,
      dateTo: rangeTo || undefined,
      user: search.trim() || undefined,
      route: screen.trim() || undefined,
      kinds,
      role: role || undefined,
      failedOnly,
    }),
    [rangeFrom, rangeTo, search, screen, kinds, role, failedOnly],
  );

  // -- Loaders ---------------------------------------------------------------

  const dashAtRef = useRef(0);
  const loadDashboard = useCallback(async () => {
    dashAtRef.current = Date.now();
    try {
      const [s, o, n] = await Promise.all([
        activityApi.summary(day),
        activityApi.overview(day),
        notesApi.adminUsage().catch(() => null),
      ]);
      if (n) setNotesUsage(n);
      setSummary(s);
      setOverview(o);
      setUpdatedAt(Date.now());
    } catch {
      /* keep showing the last good data */
    } finally {
      setDashLoading(false);
    }
  }, [day]);

  const loadEvents = useCallback(async () => {
    try {
      const rows = await activityApi.events({ ...filters, limit: PAGE_SIZE });
      setEvents(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setNewCount(0);
    } catch {
      setEvents([]);
      setHasMore(false);
    } finally {
      setEventsLoading(false);
    }
  }, [filters]);

  const eventsRef = useRef(events);
  useLayoutEffect(() => {
    eventsRef.current = events;
  });

  const pullNew = useCallback(async () => {
    const newest = eventsRef.current[0]?.id;
    if (newest == null) {
      await loadEvents();
      return;
    }
    try {
      const rows = await activityApi.events({ ...filters, afterId: newest, limit: 500 });
      if (rows.length === 0) return;
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...rows.filter((r) => !seen.has(r.id)), ...prev];
      });
      if ((listRef.current?.scrollTop ?? 0) > 40) setNewCount((n) => n + rows.length);
    } catch {
      /* next update will retry */
    }
  }, [filters, loadEvents]);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const rows = await activityApi.events({ ...filters, offset: events.length, limit: PAGE_SIZE });
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(rows.length === PAGE_SIZE);
    } catch {
      showError("Could not load more events.");
    } finally {
      setLoadingMore(false);
    }
  }

  const loadTimeline = useCallback(async (name: string) => {
    try {
      setTimeline(await activityApi.timeline(name, day));
    } catch {
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }, [day]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (drawerUser) void loadTimeline(drawerUser);
  }, [drawerUser, loadTimeline]);

  function changeDay(next: string) {
    setDay(next);
    setRangeFrom(next);
    setRangeTo(next);
    setDashLoading(true);
    setEventsLoading(true);
  }

  function openDrawer(name: string) {
    setTimelineLoading(true);
    setTimeline([]);
    setDrawerUser(name);
  }

  // -- Live updates: WebSocket push first, 30s poll as the fallback -----------

  const refreshLive = useCallback(() => {
    void pullNew();
    if (Date.now() - dashAtRef.current >= DASHBOARD_MIN_GAP_MS) void loadDashboard();
    if (drawerUser) void loadTimeline(drawerUser);
    setNow(Date.now());
  }, [pullNew, loadDashboard, loadTimeline, drawerUser]);

  const liveRef = useRef({ liveActive, refreshLive });
  useLayoutEffect(() => {
    liveRef.current = { liveActive, refreshLive };
  });

  const debounceRef = useRef<number | null>(null);
  useWebSocketEvent("activity_updated", () => {
    if (!liveRef.current.liveActive) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => liveRef.current.refreshLive(), LIVE_DEBOUNCE_MS);
  });

  useEffect(() => {
    if (!liveActive) return;
    const id = window.setInterval(() => liveRef.current.refreshLive(), FALLBACK_POLL_MS);
    return () => window.clearInterval(id);
  }, [liveActive]);

  useEffect(() => () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
  }, []);

  // -- Derived ---------------------------------------------------------------

  const totals = useMemo(
    () => summary.reduce(
      (acc, r) => ({
        total: acc.total + r.total - r.reads,
        saves: acc.saves + r.saves,
        deletes: acc.deletes + r.deletes,
        logins: acc.logins + r.logins,
        failed: acc.failed + r.failedLogins,
      }),
      { total: 0, saves: 0, deletes: 0, logins: 0, failed: 0 },
    ),
    [summary],
  );

  const roles = useMemo(
    () => Array.from(new Set(summary.map((r) => r.role).filter((r): r is string => !!r))).sort(),
    [summary],
  );

  const drawerRow = summary.find((r) => r.userName === drawerUser) ?? null;
  const drawerScreens = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of timeline) if (t.kind === "view") counts.set(screenName(t.route), (counts.get(screenName(t.route)) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [timeline]);
  const drawerIps = useMemo(
    () => Array.from(new Set(timeline.map((t) => t.ip).filter((ip): ip is string => !!ip))),
    [timeline],
  );
  const maxScreenViews = Math.max(1, ...(overview?.topScreens.map((s) => s.views) ?? [1]));

  function toggleKind(k: string) {
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  function jumpToNewest() {
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setNewCount(0);
  }

  async function openExport() {
    if (preparingExport) return;
    setPreparingExport(true);
    try {
      const employeeRows: string[][] = [
        ["Employee", "Role", "First activity", "Last activity", "Active span", "Saves", "Deletes", "Exports", "Logins", "Failed logins", "Page views", "Clicks", "Reads"],
        ...summary.map((r) => [
          r.userName, r.role ?? "", clock(r.firstAt), clock(r.lastAt), duration(r.activeMinutes),
          String(r.saves), String(r.deletes), String(r.exports), String(r.logins), String(r.failedLogins),
          String(r.views), String(r.clicks), String(r.reads),
        ]),
      ];
      const eventRows: string[][] = [
        ["Time", "Employee", "Role", "Kind", "What happened", "IP"],
        ...events.map((e) => [formatDateTime(e.createdAt), e.userName, e.role ?? "", KIND_LABEL[e.kind] ?? e.kind, describeActivity(e), e.ip ?? ""]),
      ];
      const alertRows: string[][] = [
        ["Severity", "Employee", "Alert", "Time"],
        ...(overview?.alerts ?? []).map((a) => [a.severity, a.userName, a.message, a.at ? clock(a.at) : ""]),
      ];
      const sheets: PreviewSheet[] = [
        { name: "By employee", rows: employeeRows },
        { name: "Events", rows: eventRows },
        { name: "Alerts", rows: alertRows },
      ];
      const { utils, write } = await import("xlsx");
      const wb = utils.book_new();
      for (const s of sheets) utils.book_append_sheet(wb, utils.aoa_to_sheet(s.rows), s.name);
      const array = write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      const blob = new Blob([array], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      setExportPreview({ blob, filename: `Activity_Log_${day}.xlsx`, sheets });
    } catch {
      showError("Could not prepare the export.");
    } finally {
      setPreparingExport(false);
    }
  }

  if (!user || !isAdmin) return null;
  if (dashLoading && summary.length === 0 && !overview) {
    return <PageSkeleton hasButton={false} hasSearch columns={4} />;
  }

  const kpis = [
    { label: "People active", value: overview?.activeUsers ?? 0 },
    { label: "Actions", value: totals.total },
    { label: "Saves", value: totals.saves },
    { label: "Deletes", value: totals.deletes },
    { label: "Logins", value: totals.logins },
    { label: "Failed logins", value: totals.failed, warn: totals.failed > 0 },
    { label: "Failed actions", value: overview?.failedActions ?? 0, warn: (overview?.failedActions ?? 0) > 0 },
  ];

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
            <Activity className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Activity Log</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              What everyone did in the app
              {updatedAt ? ` · updated ${clock(new Date(updatedAt).toISOString())}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            disabled={day !== today && rangeTo < today}
            title={day !== today && rangeTo < today ? "Live updates apply to today only" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              liveActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
            )}
          >
            {liveActive ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live
                <Pause className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                {live ? "Live (today only)" : "Paused"}
              </>
            )}
          </button>
          <div className="w-40">
            <DatePickerInput value={day} onChange={(v) => v && changeDay(v)} />
          </div>
          <button
            type="button"
            onClick={openExport}
            disabled={preparingExport}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            {preparingExport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            View
          </button>
        </div>
      </div>

      {/* Alerts */}
      {overview && overview.alerts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <ShieldAlert className="h-4 w-4 text-red-500" /> Needs attention
          </h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {overview.alerts.map((a, i) => (
              <button
                key={`${a.type}-${a.userName}-${i}`}
                type="button"
                onClick={() => openDrawer(a.userName)}
                className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-shadow hover:shadow-sm", SEVERITY_STYLE[a.severity])}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 text-sm">
                  <span className="font-semibold">{a.userName}</span> — {a.message}
                  {a.at && <span className="ml-1 text-xs opacity-70">· from {clock(a.at)}</span>}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {kpis.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs font-medium text-gray-500">{c.label}</p>
            <p className={cn("text-2xl font-bold", c.warn ? "text-amber-600" : "text-gray-900")}>{c.value.toLocaleString("en-IN")}</p>
          </div>
        ))}
      </div>

      {/* Online now + hourly chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Monitor className="h-4 w-4 text-emerald-600" /> Online now
          </h2>
          <p className="mb-3 text-xs text-gray-400">Active = did something in the last 5 min · Idle = tab open, no action</p>
          {day !== today ? (
            <p className="py-6 text-center text-sm text-gray-400">Only shown for today.</p>
          ) : !overview || overview.online.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Nobody is using the app right now.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {overview.online.map((o) => (
                <li key={o.userName}>
                  <button
                    type="button"
                    onClick={() => openDrawer(o.userName)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50"
                  >
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", o.status === "active" ? "bg-emerald-500" : "bg-amber-400")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-800">{o.userName}</span>
                      <span className="block truncate text-xs text-gray-400">
                        {o.screen ? screenName(o.screen) : "—"}{o.role ? ` · ${o.role}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">{ago(o.lastAt, now)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Activity by hour</h2>
          <p className="mb-2 text-xs text-gray-400">Actions people took each hour (IST). Background screen refreshes aren&apos;t counted.</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview?.hourly ?? []} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120,135,180,0.18)" />
                <XAxis dataKey="hour" tickFormatter={(h: number) => String(h).padStart(2, "0")} tick={{ fontSize: 11 }} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(h) => hourLabel(Number(h))}
                  contentStyle={{ borderRadius: 10, fontSize: 12 }}
                />
                {CHART_SERIES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {CHART_SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
              </span>
            ))}
          </div>
        </section>
      </div>

      {/* By employee + top screens */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <section className="rounded-xl border border-gray-200 bg-white p-4 xl:col-span-3">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">By employee</h2>
          <p className="mb-3 text-xs text-gray-400">Click a name to open their day in detail.</p>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-gray-500">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">First</th>
                  <th className="px-3 py-2">Last</th>
                  <th className="px-3 py-2">Span</th>
                  <th className="px-3 py-2 text-right">Saves</th>
                  <th className="px-3 py-2 text-right">Deletes</th>
                  <th className="px-3 py-2 text-right">Exports</th>
                  <th className="px-3 py-2 text-right">Logins</th>
                  <th className="px-3 py-2 text-right">Failed</th>
                  <th className="px-3 py-2 text-right">Views</th>
                  <th className="px-3 py-2 text-right">Clicks</th>
                  <th className="px-3 py-2 text-right">Reads</th>
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-3 py-6 text-center text-gray-400">No activity on this day.</td>
                  </tr>
                )}
                {summary.map((r) => (
                  <tr key={r.userName} className={cn("border-b border-gray-100 hover:bg-gray-50", drawerUser === r.userName && "bg-blue-50/60")}>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => openDrawer(r.userName)} className="text-left">
                        <span className="block font-medium text-blue-700 hover:underline">{r.userName}</span>
                        {r.role && <span className="block text-xs text-gray-400">{r.role}</span>}
                      </button>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{clock(r.firstAt)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{clock(r.lastAt)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{duration(r.activeMinutes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.saves}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", r.deletes > 0 && "font-semibold text-red-600")}>{r.deletes}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.exports}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.logins}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", r.failedLogins > 0 && "font-semibold text-amber-600")}>{r.failedLogins}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.views}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.clicks}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">{r.reads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Most-used screens</h2>
          <p className="mb-3 text-xs text-gray-400">Times opened, and by how many people.</p>
          {!overview || overview.topScreens.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No screens opened.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {overview.topScreens.map((s) => (
                <li key={s.route}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-gray-800">{screenName(s.route)}</span>
                    <span className="shrink-0 text-xs tabular-nums text-gray-500">{s.views} · {s.users} {s.users === 1 ? "person" : "people"}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100">
                    <div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${(s.views / maxScreenViews) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Notes storage — sizes and counts only; note content is private to its owner */}
      {notesUsage.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Notes storage</h2>
          <p className="mb-3 text-xs text-gray-400">
            How much each person keeps in Notes and saved today. Note content is private — only sizes are shown.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-gray-500">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2 text-right">Notes</th>
                  <th className="px-3 py-2 text-right">Stored</th>
                  <th className="px-3 py-2 text-right">Saves today</th>
                  <th className="px-3 py-2 text-right">Saved today</th>
                  <th className="px-3 py-2 text-right">Limit hits today</th>
                </tr>
              </thead>
              <tbody>
                {notesUsage.map((r) => (
                  <tr key={r.staffId} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{(r.bytesUsed / 1000).toFixed(1)} KB</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.writesToday}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{(r.writtenToday / 1_000_000).toFixed(2)} MB</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", r.blockedToday > 0 && "font-semibold text-amber-600")}>
                      {r.blockedToday}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Events */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-sm font-semibold text-gray-900">Events</h2>
          <PillSearch placeholder="Filter by employee…" value={search} onChange={setSearch} />
          <PillSearch placeholder="Filter by screen…" value={screen} onChange={setScreen} />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">All roles</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-36"><DatePickerInput value={rangeFrom} onChange={setRangeFrom} placeholder="From" /></div>
            <span>to</span>
            <div className="w-36"><DatePickerInput value={rangeTo} onChange={setRangeTo} placeholder="To" /></div>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {KIND_OPTIONS.map((k) => {
            const on = kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  on ? cn(KIND_STYLE[k], "border-transparent ring-1 ring-current") : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50",
                )}
              >
                {KIND_LABEL[k]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setFailedOnly((v) => !v)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              failedOnly ? "border-red-200 bg-red-50 text-red-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50",
            )}
          >
            Failed only
          </button>
          {(kinds.length > 0 || failedOnly || role || search || screen) && (
            <button
              type="button"
              onClick={() => { setKinds([]); setFailedOnly(false); setRole(""); setSearch(""); setScreen(""); }}
              className="ml-1 text-xs font-semibold text-gray-400 hover:text-gray-600"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="relative">
          {newCount > 0 && (
            <button
              type="button"
              onClick={jumpToNewest}
              className="absolute left-1/2 top-10 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-lg"
            >
              <ArrowUp className="h-3.5 w-3.5" /> {newCount} new event{newCount === 1 ? "" : "s"}
            </button>
          )}
          <div
            ref={listRef}
            onScroll={(e) => { if (e.currentTarget.scrollTop <= 40 && newCount) setNewCount(0); }}
            className="max-h-[60vh] overflow-auto"
          >
            <table className="w-full whitespace-nowrap text-left text-xs">
              <thead className="sticky top-0 bg-white text-gray-500">
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">What happened</th>
                  <th className="px-3 py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {eventsLoading && events.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Loading…</td></tr>
                )}
                {!eventsLoading && events.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No events match these filters.</td></tr>
                )}
                {events.map((e) => (
                  <tr key={e.id} className={cn("border-b border-gray-100", e.status != null && e.status >= 400 && "bg-red-50/40")}>
                    <td className="px-3 py-1.5 text-gray-500">{formatDateTime(e.createdAt)}</td>
                    <td className="px-3 py-1.5">
                      <button type="button" onClick={() => openDrawer(e.userName)} className="font-medium text-gray-800 hover:text-blue-700 hover:underline">
                        {e.userName}
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 font-semibold", KIND_STYLE[e.kind] ?? "bg-gray-100 text-gray-600")}>
                        {KIND_LABEL[e.kind] ?? e.kind}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-700">{describeActivity(e)}</td>
                    <td className="px-3 py-1.5 text-gray-500">{e.ip ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <div className="flex justify-center py-3">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                >
                  {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Load more
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Employee drawer */}
      {drawerUser && (
        <div className="fixed inset-0 z-[90] flex justify-end">
          <div className="absolute inset-0 bg-black/30 animate-backdrop-in" onClick={() => setDrawerUser(null)} />
          <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{drawerUser}</h2>
                <p className="text-xs text-gray-500">
                  {drawerRow?.role ?? ""}{drawerRow?.role ? " · " : ""}{day}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerUser(null)}
                aria-label="Close"
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {drawerRow && (
                <>
                  <div className="mb-4 grid grid-cols-3 gap-2">
                    {[
                      { label: "First", value: clock(drawerRow.firstAt) },
                      { label: "Last", value: clock(drawerRow.lastAt) },
                      { label: "Span", value: duration(drawerRow.activeMinutes) },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg bg-gray-50 px-3 py-2">
                        <p className="text-[11px] text-gray-500">{s.label}</p>
                        <p className="text-sm font-semibold text-gray-900 tabular-nums">{s.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {[
                      ["save", drawerRow.saves], ["delete", drawerRow.deletes], ["export", drawerRow.exports],
                      ["login", drawerRow.logins], ["login_failed", drawerRow.failedLogins],
                      ["view", drawerRow.views], ["click", drawerRow.clicks],
                    ].filter(([, n]) => Number(n) > 0).map(([k, n]) => (
                      <span key={String(k)} className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", KIND_STYLE[String(k)])}>
                        {n} {KIND_LABEL[String(k)]}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {drawerScreens.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Screens visited</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {drawerScreens.map(([name, n]) => (
                      <span key={name} className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-700">
                        {name} <span className="text-gray-400">×{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {drawerIps.length > 0 && (
                <p className="mb-4 text-xs text-gray-500">
                  <span className="font-semibold text-gray-600">IP{drawerIps.length > 1 ? "s" : ""}:</span> {drawerIps.join(", ")}
                </p>
              )}

              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Timeline</h3>
              {timelineLoading && timeline.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">Loading timeline…</p>
              )}
              {!timelineLoading && timeline.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">Nothing recorded for this person on this day.</p>
              )}
              <ol className="flex flex-col border-l-2 border-gray-100 pl-4">
                {timeline.map((item, i) => (
                  <li key={`${item.time}-${i}`} className="relative flex items-start gap-3 py-1.5 text-sm">
                    <span className={cn(
                      "absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full border-2 border-white",
                      item.kind === "reads" ? "bg-gray-300" : item.status != null && item.status >= 400 ? "bg-red-400" : "bg-blue-400",
                    )} />
                    <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-gray-400">{clock(item.time)}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", KIND_STYLE[item.kind] ?? "bg-gray-100 text-gray-600")}>
                      {item.kind === "reads" ? "loads" : (KIND_LABEL[item.kind] ?? item.kind)}
                    </span>
                    <span className={cn(item.kind === "reads" ? "text-gray-400" : "text-gray-800")}>{describeTimeline(item)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      )}

      {exportPreview && (
        <ExportPreviewDialog
          title="Activity Log"
          filename={exportPreview.filename}
          blob={exportPreview.blob}
          sheets={exportPreview.sheets}
          onClose={() => setExportPreview(null)}
        />
      )}
    </div>
  );
}
