"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RiPulseLine as Activity, RiAlertLine as AlertTriangle, RiArrowUpLine as ArrowUp, RiFileList3Line as ClipboardList, RiEyeLine as Eye, RiLoader4Line as Loader2, RiComputerLine as Monitor, RiPauseLine as Pause, RiPlayLine as Play, RiShieldFlashLine as ShieldAlert, RiCloseLine as X } from "@remixicon/react";
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
import { WorkReportDialog } from "@/components/activity/WorkReportDialog";
import { TablePagination } from "@/components/ui/TablePagination";
import { todayIst, formatDateTime } from "@/lib/format-date";
import { areaName, screenName } from "@/lib/screen-names";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/feedback";
import { useAuth } from "@/context/AuthContext";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { TAB_CLOSED_LABEL } from "@/hooks/useActivityTracking";

import { EmptyState } from "@/components/ui/EmptyState";
const PAGE_SIZE = 50;
const EXPORT_LIMIT = 500; // the most GET /activity/events returns in one call
const FALLBACK_POLL_MS = 30_000;
const DASHBOARD_MIN_GAP_MS = 10_000;
const LIVE_DEBOUNCE_MS = 1_200;

const KIND_OPTIONS = ["save", "delete", "export", "login", "login_failed", "logout", "view", "click"] as const;
const KIND_LABEL: Record<string, string> = {
  save: "Saves", delete: "Deletes", export: "Exports", login: "Logins",
  login_failed: "Failed logins", logout: "Logouts", view: "Page views", click: "Clicks",
};
const KIND_STYLE: Record<string, string> = {
  save: "bg-accent-surface text-accent-text",
  delete: "bg-danger-surface text-danger-text",
  export: "bg-purple-surface text-purple-text",
  login: "bg-success-surface text-success-text",
  login_failed: "bg-warning-surface text-warning-text",
  logout: "bg-fill-2 text-text-secondary",
  view: "bg-teal-surface text-teal-text",
  click: "bg-purple-surface text-purple-text",
  reads: "bg-fill-2 text-text-secondary",
};
const CHART_SERIES = [
  { key: "saves", label: "Saves", color: "#2563eb" },
  { key: "deletes", label: "Deletes", color: "#dc2626" },
  { key: "exports", label: "Exports", color: "#7c3aed" },
  { key: "logins", label: "Logins / outs", color: "#059669" },
  { key: "views", label: "Page views", color: "#0ea5e9" },
  { key: "clicks", label: "Clicks", color: "#a5b4fc" },
] as const;
// Mid-tone colours that read on both the light and the dark card.
const CHART_TICK = "#7d8fab";
const CHART_AXIS = "rgba(120,135,180,0.4)";
const SEVERITY_STYLE: Record<ActivityAlert["severity"], string> = {
  high: "border-danger-border bg-danger-surface text-danger-text-strong",
  medium: "border-warning-border bg-warning-surface text-warning-text-strong",
  low: "border-separator-border bg-fill-1 text-text-primary",
};

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

type HourPayload = { dataKey?: string | number; name?: string; value?: number; color?: string };

/** Built from the app's theme classes (bg-white, text-gray-*), which html.dark
 *  remaps — Recharts' default tooltip is inline white and ignores dark mode. */
function HourTooltip({ active, payload, label }: { active?: boolean; payload?: HourPayload[]; label?: number | string }) {
  if (!active || !payload?.length) return null;
  const shown = payload.filter((p) => Number(p.value) > 0).reverse();
  const total = shown.reduce((n, p) => n + Number(p.value), 0);
  return (
    <div className="min-w-[150px] rounded-xl border border-separator-border bg-background-primary-default px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-text-primary">{hourLabel(Number(label))}</p>
      {shown.length === 0 ? (
        <p className="text-text-secondary">No actions</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((p) => (
            <li key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-text-secondary">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
                {p.name}
              </span>
              <span className="font-semibold text-text-primary">{p.value}</span>
            </li>
          ))}
          {shown.length > 1 && (
            <li className="flex justify-between gap-4 border-t border-separator-border pt-1 font-semibold text-text-primary">
              <span>Total</span>
              <span>{total}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
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
  const [eventsTotal, setEventsTotal] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Lazy load: the Events table isn't fetched until it scrolls into view, and
  // live updates only refresh it while it's on screen.
  const [eventsSeen, setEventsSeen] = useState(false);
  const eventsVisibleRef = useRef(false);

  const [live, setLive] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [drawerUser, setDrawerUser] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<ActivityTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [exportPreview, setExportPreview] = useState<{ blob: Blob; filename: string; sheets: PreviewSheet[] } | null>(null);
  const [preparingExport, setPreparingExport] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

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
  // The page number belongs to one set of filters: change a filter and it's
  // back to page 1, with no effect needed to reset it.
  const filtersKey = JSON.stringify(filters);
  const [pageState, setPageState] = useState({ key: filtersKey, page: 1 });
  const page = pageState.key === filtersKey ? pageState.page : 1;
  const totalPages = Math.max(1, Math.ceil(eventsTotal / PAGE_SIZE));

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

  const eventsSeqRef = useRef(0);
  const loadEvents = useCallback(async () => {
    const seq = ++eventsSeqRef.current;
    try {
      // The total only changes with the filters or new events, so it's
      // re-counted on page 1 and kept while paging through older pages.
      // A failed count (e.g. a backend without /events/count yet) must never
      // hide the rows themselves — fall back to "at least what we've seen".
      const offset = (page - 1) * PAGE_SIZE;
      const [rows, total] = await Promise.all([
        activityApi.events({ ...filters, offset, limit: PAGE_SIZE }),
        page === 1 ? activityApi.eventsCount(filters).catch(() => null) : Promise.resolve(null),
      ]);
      if (seq !== eventsSeqRef.current) return; // a newer page/filter request won
      setEvents(rows);
      if (total != null) setEventsTotal(total);
      else setEventsTotal((t) => Math.max(t, offset + rows.length + (rows.length === PAGE_SIZE ? 1 : 0)));
      setNewCount(0);
    } catch {
      if (seq !== eventsSeqRef.current) return;
      setEvents([]);
    } finally {
      if (seq === eventsSeqRef.current) setEventsLoading(false);
    }
  }, [filters, page]);

  const eventsRef = useRef(events);
  useLayoutEffect(() => {
    eventsRef.current = events;
  });

  // Live: only page 1 changes when new events arrive, and only while the table
  // is on screen — otherwise nothing is fetched at all.
  const pullNew = useCallback(async () => {
    if (!eventsSeen || !eventsVisibleRef.current || page !== 1) return;
    const newest = eventsRef.current[0]?.id;
    if (newest == null) {
      await loadEvents();
      return;
    }
    const seq = eventsSeqRef.current;
    try {
      const rows = await activityApi.events({ ...filters, afterId: newest, limit: PAGE_SIZE });
      if (rows.length === 0 || seq !== eventsSeqRef.current) return;
      if (rows.length === PAGE_SIZE) {
        // A whole page or more arrived at once: reload page 1 and its total.
        await loadEvents();
        return;
      }
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...rows.filter((r) => !seen.has(r.id)), ...prev].slice(0, PAGE_SIZE);
      });
      setEventsTotal((t) => t + rows.length);
      if ((listRef.current?.scrollTop ?? 0) > 40) setNewCount((n) => n + rows.length);
    } catch {
      /* next update will retry */
    }
  }, [eventsSeen, page, filters, loadEvents]);

  const pullNewRef = useRef(pullNew);
  useLayoutEffect(() => {
    pullNewRef.current = pullNew;
  });

  const observeEvents = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const wasVisible = eventsVisibleRef.current;
        eventsVisibleRef.current = entry.isIntersecting;
        if (!entry.isIntersecting) return;
        setEventsSeen(true);
        // Back on screen after scrolling away: catch up on what was missed.
        if (!wasVisible) void pullNewRef.current();
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function changePage(next: number) {
    if (next === page) return;
    setEventsLoading(true);
    setPageState({ key: filtersKey, page: next });
    listRef.current?.scrollTo({ top: 0 });
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
    if (eventsSeen) void loadEvents();
  }, [eventsSeen, loadEvents]);

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
        ...(await activityApi.events({ ...filters, limit: EXPORT_LIMIT })).map((e) => [formatDateTime(e.createdAt), e.userName, e.role ?? "", KIND_LABEL[e.kind] ?? e.kind, describeActivity(e), e.ip ?? ""]),
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
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <Activity className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Activity Log</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
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
              "flex items-center gap-2 rounded-full border px-3.5 py-2 text-body-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              liveActive ? "border-success-border bg-success-surface text-success-text" : "border-separator-border bg-background-primary-default text-text-secondary hover:bg-fill-2",
            )}
          >
            {liveActive ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-success-solid opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success-solid" />
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
            <DatePickerInput value={day} onChange={(v) => v && changeDay(v)} clearable={false} />
          </div>
          <button
            type="button"
            onClick={openExport}
            disabled={preparingExport}
            className="flex items-center gap-1.5 rounded-full border border-separator-border bg-background-primary-default px-4 py-2 text-body-semibold text-text-primary transition-colors hover:bg-fill-2 disabled:opacity-60"
          >
            {preparingExport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            View
          </button>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-accent-solid px-4 py-2 text-body-semibold text-on-solid shadow-sm transition-colors hover:bg-accent-solid-hover disabled:opacity-50"
          >
            <ClipboardList className="h-4 w-4" />
            Download Report
          </button>
        </div>
      </div>

      {/* Alerts */}
      {overview && overview.alerts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-body-semibold text-text-primary">
            <ShieldAlert className="h-4 w-4 text-danger-text" /> Needs attention
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
          <div key={c.label} className="rounded-xl border border-separator-border bg-background-primary-default px-4 py-3">
            <p className="text-caption-1-medium text-text-secondary">{c.label}</p>
            <p className={cn("text-title-1-semibold", c.warn ? "text-warning-text" : "text-text-primary")}>{c.value.toLocaleString("en-IN")}</p>
          </div>
        ))}
      </div>

      {/* Online now + hourly chart */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <h2 className="mb-1 flex items-center gap-1.5 text-body-semibold text-text-primary">
            <Monitor className="h-4 w-4 text-success-text" /> Online now
          </h2>
          <p className="mb-3 text-xs text-text-tertiary">Active = did something in the last 5 min · Idle = tab open, no action</p>
          {day !== today ? (
            <p className="py-6 text-center text-sm text-text-tertiary">Only shown for today.</p>
          ) : !overview || overview.online.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-tertiary">Nobody is using the app right now.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {overview.online.map((o) => (
                <li key={o.userName}>
                  <button
                    type="button"
                    onClick={() => openDrawer(o.userName)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-fill-2"
                  >
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", o.status === "active" ? "bg-success-solid" : "bg-warning-solid")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-medium text-text-primary">{o.userName}</span>
                      <span className="block truncate text-xs text-text-tertiary">
                        {o.screen ? screenName(o.screen) : "—"}{o.role ? ` · ${o.role}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-text-tertiary">{ago(o.lastAt, now)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-separator-border bg-background-primary-default p-4 lg:col-span-2">
          <h2 className="mb-1 text-body-semibold text-text-primary">Activity by hour</h2>
          <p className="mb-2 text-xs text-text-tertiary">Actions people took each hour (IST). Background screen refreshes aren&apos;t counted.</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview?.hourly ?? []} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120,135,180,0.18)" />
                <XAxis dataKey="hour" tickFormatter={(h: number) => String(h).padStart(2, "0")} tick={{ fontSize: 11, fill: CHART_TICK }} stroke={CHART_AXIS} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART_TICK }} stroke={CHART_AXIS} />
                <Tooltip cursor={{ fill: "rgba(120,135,180,0.14)" }} content={<HourTooltip />} />
                {CHART_SERIES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {CHART_SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
              </span>
            ))}
          </div>
        </section>
      </div>

      {/* By employee + top screens */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <section className="rounded-xl border border-separator-border bg-background-primary-default p-4 xl:col-span-3">
          <h2 className="mb-1 text-body-semibold text-text-primary">By employee</h2>
          <p className="mb-3 text-xs text-text-tertiary">Click a name to open their day in detail.</p>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="text-xs text-text-secondary">
                <tr className="border-b border-separator-border">
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
                    <td colSpan={12} className="p-0"><EmptyState size="compact" illustration="no-data" title="No activity on this day" /></td>
                  </tr>
                )}
                {summary.map((r) => (
                  <tr key={r.userName} className={cn("border-b border-separator-border hover:bg-fill-2", drawerUser === r.userName && "bg-accent-surface/60")}>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => openDrawer(r.userName)} className="text-left">
                        <span className="block font-medium text-accent-text hover:underline">{r.userName}</span>
                        {r.role && <span className="block text-xs text-text-tertiary">{r.role}</span>}
                      </button>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-text-secondary">{clock(r.firstAt)}</td>
                    <td className="px-3 py-2 tabular-nums text-text-secondary">{clock(r.lastAt)}</td>
                    <td className="px-3 py-2 tabular-nums text-text-secondary">{duration(r.activeMinutes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.saves}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", r.deletes > 0 && "font-semibold text-danger-text")}>{r.deletes}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.exports}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.logins}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", r.failedLogins > 0 && "font-semibold text-warning-text")}>{r.failedLogins}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.views}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.clicks}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-tertiary">{r.reads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <h2 className="mb-1 text-body-semibold text-text-primary">Most-used screens</h2>
          <p className="mb-3 text-xs text-text-tertiary">Times opened, and by how many people.</p>
          {!overview || overview.topScreens.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-tertiary">No screens opened.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {overview.topScreens.map((s) => (
                <li key={s.route}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-text-primary">{screenName(s.route)}</span>
                    <span className="shrink-0 text-xs tabular-nums text-text-secondary">{s.views} · {s.users} {s.users === 1 ? "person" : "people"}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-fill-2">
                    <div className="h-1.5 rounded-full bg-teal-solid" style={{ width: `${(s.views / maxScreenViews) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Notes storage — sizes and counts only; note content is private to its owner */}
      {notesUsage.length > 0 && (
        <section className="rounded-xl border border-separator-border bg-background-primary-default p-4">
          <h2 className="mb-1 text-body-semibold text-text-primary">Notes storage</h2>
          <p className="mb-3 text-xs text-text-tertiary">
            How much each person keeps in Notes and saved today. Note content is private — only sizes are shown.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="text-xs text-text-secondary">
                <tr className="border-b border-separator-border">
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
                  <tr key={r.staffId} className="border-b border-separator-border">
                    <td className="px-3 py-2 font-medium text-text-primary">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{(r.bytesUsed / 1000).toFixed(1)} KB</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.writesToday}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{(r.writtenToday / 1_000_000).toFixed(2)} MB</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", r.blockedToday > 0 && "font-semibold text-warning-text")}>
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
      <section ref={observeEvents} className="rounded-xl border border-separator-border bg-background-primary-default p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-body-semibold text-text-primary">
            Events
            {eventsSeen && !eventsLoading && (
              <span className="ml-2 text-caption-1-regular text-text-tertiary">{eventsTotal.toLocaleString("en-IN")} total</span>
            )}
          </h2>
          <PillSearch placeholder="Filter by employee…" value={search} onChange={setSearch} />
          <PillSearch placeholder="Filter by screen…" value={screen} onChange={setScreen} />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-full border border-separator-border bg-background-primary-default px-3 py-2 text-sm"
          >
            <option value="">All roles</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
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
                  "rounded-full border px-3 py-1 text-caption-1-semibold transition-colors",
                  on ? cn(KIND_STYLE[k], "border-transparent ring-1 ring-current") : "border-separator-border bg-background-primary-default text-text-secondary hover:bg-fill-2",
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
              "rounded-full border px-3 py-1 text-caption-1-semibold transition-colors",
              failedOnly ? "border-danger-border bg-danger-surface text-danger-text" : "border-separator-border bg-background-primary-default text-text-secondary hover:bg-fill-2",
            )}
          >
            Failed only
          </button>
          {(kinds.length > 0 || failedOnly || role || search || screen) && (
            <button
              type="button"
              onClick={() => { setKinds([]); setFailedOnly(false); setRole(""); setSearch(""); setScreen(""); }}
              className="ml-1 text-caption-1-semibold text-text-tertiary hover:text-text-secondary"
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
              className="absolute left-1/2 top-10 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-accent-solid px-3 py-1 text-caption-1-semibold text-on-solid shadow-lg"
            >
              <ArrowUp className="h-3.5 w-3.5" /> {newCount} new event{newCount === 1 ? "" : "s"}
            </button>
          )}
          <div
            ref={listRef}
            onScroll={(e) => { if (e.currentTarget.scrollTop <= 40 && newCount) setNewCount(0); }}
            className={cn("max-h-[60vh] overflow-auto transition-opacity", eventsLoading && events.length > 0 && "opacity-60")}
          >
            <table className="w-full whitespace-nowrap text-left text-xs">
              <thead className="sticky top-0 bg-background-primary-default text-text-secondary">
                <tr className="border-b border-separator-border">
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">What happened</th>
                  <th className="px-3 py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {eventsLoading && events.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-text-tertiary">Loading…</td></tr>
                )}
                {!eventsLoading && events.length === 0 && (
                  <tr><td colSpan={5} className="p-0"><EmptyState size="compact" illustration="not-found" title="No events match these filters" /></td></tr>
                )}
                {events.map((e) => (
                  <tr key={e.id} className={cn("border-b border-separator-border", e.status != null && e.status >= 400 && "bg-danger-surface/40")}>
                    <td className="px-3 py-1.5 text-text-secondary">{formatDateTime(e.createdAt)}</td>
                    <td className="px-3 py-1.5">
                      <button type="button" onClick={() => openDrawer(e.userName)} className="font-medium text-text-primary hover:text-accent-text hover:underline">
                        {e.userName}
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 font-semibold", KIND_STYLE[e.kind] ?? "bg-fill-2 text-text-secondary")}>
                        {KIND_LABEL[e.kind] ?? e.kind}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-text-primary">{describeActivity(e)}</td>
                    <td className="px-3 py-1.5 text-text-secondary">{e.ip ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-3">
          <TablePagination
            page={page}
            totalPages={totalPages}
            pageSize={PAGE_SIZE}
            totalItems={eventsTotal}
            onPageChange={changePage}
            itemLabel="events"
          />
        </div>
      </section>

      {/* Employee drawer */}
      {drawerUser && (
        <div className="fixed inset-0 z-[90] flex justify-end">
          <div className="absolute inset-0 bg-scrim/30 animate-scrim-in" onClick={() => setDrawerUser(null)} />
          <aside className="relative flex h-full w-full max-w-md flex-col bg-background-primary-default shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-separator-border px-5 py-4">
              <div>
                <h2 className="text-title-3-semibold text-text-primary">{drawerUser}</h2>
                <p className="text-xs text-text-secondary">
                  {drawerRow?.role ?? ""}{drawerRow?.role ? " · " : ""}{day}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerUser(null)}
                aria-label="Close"
                className="rounded-full p-1 text-text-tertiary hover:bg-fill-3 hover:text-text-primary"
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
                      <div key={s.label} className="rounded-lg bg-fill-1 px-3 py-2">
                        <p className="text-[11px] text-text-secondary">{s.label}</p>
                        <p className="text-body-semibold text-text-primary tabular-nums">{s.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {[
                      ["save", drawerRow.saves], ["delete", drawerRow.deletes], ["export", drawerRow.exports],
                      ["login", drawerRow.logins], ["login_failed", drawerRow.failedLogins],
                      ["view", drawerRow.views], ["click", drawerRow.clicks],
                    ].filter(([, n]) => Number(n) > 0).map(([k, n]) => (
                      <span key={String(k)} className={cn("rounded-full px-2.5 py-0.5 text-caption-1-semibold", KIND_STYLE[String(k)])}>
                        {n} {KIND_LABEL[String(k)]}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {drawerScreens.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-1.5 text-caption-1-semibold text-text-secondary">Screens visited</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {drawerScreens.map(([name, n]) => (
                      <span key={name} className="rounded-full border border-separator-border px-2.5 py-0.5 text-xs text-text-primary">
                        {name} <span className="text-text-tertiary">×{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {drawerIps.length > 0 && (
                <p className="mb-4 text-xs text-text-secondary">
                  <span className="font-semibold text-text-secondary">IP{drawerIps.length > 1 ? "s" : ""}:</span> {drawerIps.join(", ")}
                </p>
              )}

              <h3 className="mb-2 text-caption-1-semibold text-text-secondary">Timeline</h3>
              {timelineLoading && timeline.length === 0 && (
                <p className="py-6 text-center text-sm text-text-tertiary">Loading timeline…</p>
              )}
              {!timelineLoading && timeline.length === 0 && (
                <p className="py-6 text-center text-sm text-text-tertiary">Nothing recorded for this person on this day.</p>
              )}
              <ol className="flex flex-col border-l-2 border-separator-border pl-4">
                {timeline.map((item, i) => (
                  <li key={`${item.time}-${i}`} className="relative flex items-start gap-3 py-1.5 text-sm">
                    <span className={cn(
                      "absolute -left-[21px] top-3 h-2.5 w-2.5 rounded-full border-2 border-background-primary-default",
                      item.kind === "reads" ? "bg-fill-4" : item.status != null && item.status >= 400 ? "bg-danger-solid" : "bg-accent-solid",
                    )} />
                    <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-text-tertiary">{clock(item.time)}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-caption-2-semibold", KIND_STYLE[item.kind] ?? "bg-fill-2 text-text-secondary")}>
                      {item.kind === "reads" ? "loads" : (KIND_LABEL[item.kind] ?? item.kind)}
                    </span>
                    <span className={cn(item.kind === "reads" ? "text-text-tertiary" : "text-text-primary")}>{describeTimeline(item)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      )}

      {reportOpen && <WorkReportDialog day={day} onClose={() => setReportOpen(false)} />}

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
