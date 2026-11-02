"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, Clock, ChevronRight, ClipboardList, FileText, Fuel,
  Loader2, Receipt, RefreshCw, ShieldCheck, Sunrise, Truck, Users, Wallet, Wrench, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { dailySummaryApi, type DailySummary, type DailySummaryLine } from "@/lib/api";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/swal";

const SECTION_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  trips: { icon: Truck, tone: "bg-blue-50 text-blue-600" },
  invoices: { icon: Receipt, tone: "bg-emerald-50 text-emerald-600" },
  fuel: { icon: Fuel, tone: "bg-orange-50 text-orange-600" },
  maintenance: { icon: Wrench, tone: "bg-slate-100 text-slate-600" },
  documents: { icon: FileText, tone: "bg-rose-50 text-rose-600" },
  attendance: { icon: Users, tone: "bg-violet-50 text-violet-600" },
  payments: { icon: Wallet, tone: "bg-teal-50 text-teal-600" },
  approvals: { icon: CheckCircle2, tone: "bg-green-50 text-green-600" },
  audit: { icon: ShieldCheck, tone: "bg-indigo-50 text-indigo-600" },
  work: { icon: ClipboardList, tone: "bg-amber-50 text-amber-600" },
};

/** The figures worth a tile, in order; a tile only shows when its figure is there. */
const TILES: { key: string; label: string; href: string; warn?: boolean }[] = [
  { key: "Trips booked", label: "Trips booked", href: "/trips/history" },
  { key: "Trips completed", label: "Trips completed", href: "/trips/history" },
  { key: "Trips waiting to be invoiced", label: "Waiting to be invoiced", href: "/trips/verification", warn: true },
  { key: "Documents expired", label: "Documents expired", href: "/maintenance/truck-compliance-record", warn: true },
  { key: "Trips waiting for audit", label: "Waiting for audit", href: "/trips/pending-audit" },
  { key: "Work items", label: "Staff work items", href: "/admin/activity-log" },
];

/** "**Booked:** 18" → Booked: in bold. The server marks the bold parts. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) =>
        i % 2 === 1 ? <strong key={i} className="font-semibold text-gray-900 dark:text-current">{part}</strong> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

/** "**Expired:** 16. **Expiring soon:** 1." → [["Expired", "16"], ["Expiring soon", "1"]]; a line with no label stays whole. */
function facts(text: string): [string | null, string][] {
  const parts = text.split(/\*\*([^*]+?):\*\*\s*/);
  const out: [string | null, string][] = [];
  if (parts[0].trim()) out.push([null, parts[0].trim()]);
  for (let i = 1; i < parts.length; i += 2) {
    out.push([parts[i], parts[i + 1].trim().replace(/[,;.]$/, "")]);
  }
  return out;
}

function Row({ line }: { line: DailySummaryLine }) {
  const rows = facts(line.text).map(([label, value], i) => (
    <div key={i} className="flex items-baseline justify-between gap-4 py-1.5">
      {label ? (
        <>
          <span className="shrink-0 text-gray-500">{label[0].toUpperCase() + label.slice(1)}</span>
          <span className="text-right text-gray-800"><Rich text={value} /></span>
        </>
      ) : (
        <span className="text-gray-700"><Rich text={value} /></span>
      )}
    </div>
  ));
  return line.href ? (
    <Link href={line.href} className="block rounded-lg px-2 -mx-2 transition-colors hover:bg-gray-50">{rows}</Link>
  ) : (
    <div className="px-2 -mx-2">{rows}</div>
  );
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
}

function greeting(): string {
  const hour = Number(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** Admin dashboard: yesterday's recap, saved each morning (backend daily_summary.py). */
export function DailySummaryCard() {
  const { user } = useAuth();
  const [morning, setMorning] = useState<DailySummary | null>(null);
  const [live, setLive] = useState<DailySummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    dailySummaryApi.get().then(setMorning).catch(() => {});
  }, []);

  if (!morning) return null;
  const shown = live ?? morning;
  const firstName = (user?.name ?? "").split(" ")[0] || "there";
  const changes = live
    ? Object.entries(live.metrics).filter(([k, v]) => morning.metrics[k] !== undefined && morning.metrics[k] !== v)
    : [];
  const tiles = TILES.filter((t) => shown.metrics[t.key] !== undefined);

  async function refresh() {
    setRefreshing(true);
    try {
      setLive(await dailySummaryApi.live());
    } catch (err) {
      showError(err instanceof Error ? err.message : "Could not refresh the summary.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-amber-50/80 via-white to-white px-5 py-4 dark:border-white/10 dark:from-amber-500/[0.07] dark:via-transparent dark:to-transparent">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/15">
            <Sunrise className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-gray-900">{greeting()}, {firstName}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-gray-500">Your recap for</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10">
                <CalendarDays className="h-3.5 w-3.5" />
                {shown.dayLabel}
              </span>
              {live ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Live at {clock(live.builtAt)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-600 dark:border-white/10 dark:bg-white/5">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  As of {clock(morning.builtAt)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-gray-100 p-0.5 text-xs font-semibold dark:bg-white/5">
            <button
              type="button"
              onClick={() => setLive(null)}
              className={cn("rounded-full px-3 py-1.5 transition-colors", !live ? "bg-white text-gray-900 shadow-sm dark:bg-white/10" : "text-gray-500 hover:text-gray-700")}
            >
              Morning
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors disabled:opacity-60", live ? "bg-white text-gray-900 shadow-sm dark:bg-white/10" : "text-gray-500 hover:text-gray-700")}
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {live ? "Refresh" : "Live"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-5 p-5">
          <p className="text-sm text-gray-700">{shown.headline}</p>

          {live && (
            <p className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3.5 py-2 text-xs",
              changes.length ? "bg-blue-50 text-blue-900 dark:bg-blue-500/10" : "bg-gray-50 text-gray-500 dark:bg-white/5",
            )}>
              <span className="font-semibold">Since {clock(morning.builtAt)}:</span>
              {changes.length === 0
                ? "nothing has changed"
                : changes.map(([k, v]) => <span key={k}>{k} {morning.metrics[k]} → <strong>{v}</strong></span>)}
            </p>
          )}

          {/* Key figures */}
          {tiles.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {tiles.map((t) => {
                const value = shown.metrics[t.key];
                return (
                  <Link key={t.key} href={t.href} className="group rounded-xl border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 hover:bg-gray-50">
                    <p className={cn("text-2xl font-bold tabular-nums", t.warn && value > 0 ? "text-amber-600" : "text-gray-900")}>
                      {value.toLocaleString("en-IN")}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-gray-500">{t.label}</p>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Needs attention */}
          {shown.attention.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-400/30">
              <p className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10">
                <AlertTriangle className="h-4 w-4" /> Needs your attention
                <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] dark:bg-amber-400/20">{shown.attention.length}</span>
              </p>
              <ul className="divide-y divide-amber-100 dark:divide-amber-400/10">
                {shown.attention.map((line, i) => {
                  const body = (
                    <>
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span className="flex-1 text-sm text-gray-700"><Rich text={line.text} /></span>
                      {line.href && <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />}
                    </>
                  );
                  return (
                    <li key={i}>
                      {line.href ? (
                        <Link href={line.href} className="group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-amber-50/60 dark:hover:bg-amber-500/5">{body}</Link>
                      ) : (
                        <div className="flex items-start gap-3 px-4 py-2.5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Sections */}
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown.sections.map((s) => {
              const style = SECTION_STYLE[s.key] ?? { icon: ClipboardList, tone: "bg-gray-100 text-gray-600" };
              const Icon = style.icon;
              return (
                <div key={s.key} className="rounded-xl border border-gray-200 p-4">
                  <p className="mb-1.5 flex items-center gap-2.5 text-sm font-bold text-gray-900">
                    <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg dark:bg-white/5", style.tone)}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {s.title}
                  </p>
                  <div className="divide-y divide-gray-100 text-sm dark:divide-white/5">
                    {s.lines.map((line, i) => <Row key={i} line={line} />)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Today */}
          {shown.today.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50/70 px-4 py-3 dark:bg-indigo-500/10">
              <span className="mr-1 flex items-center gap-2 text-sm font-bold text-indigo-900">
                <CalendarDays className="h-4 w-4" /> Today, {shown.todayLabel}
              </span>
              {shown.today.flatMap((line) => facts(line.text).map(([label, value], i) => {
                const chip = (
                  <span className="rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs text-gray-700 dark:border-indigo-400/20 dark:bg-white/5">
                    {label && <span className="font-semibold text-indigo-900">{label}: </span>}
                    <Rich text={value} />
                  </span>
                );
                return line.href
                  ? <Link key={`${line.text}-${i}`} href={line.href} className="transition-opacity hover:opacity-80">{chip}</Link>
                  : <Fragment key={`${line.text}-${i}`}>{chip}</Fragment>;
              }))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
