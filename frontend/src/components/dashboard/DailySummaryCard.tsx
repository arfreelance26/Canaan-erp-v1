"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { RiAlertLine as AlertTriangle, RiCalendar2Line as CalendarDays, RiCheckboxCircleLine as CheckCircle2, RiArrowDownSLine as ChevronDown, RiTimeLine as Clock, RiArrowRightSLine as ChevronRight, RiFileList3Line as ClipboardList, RiFileTextLine as FileText, RiGasStationLine as Fuel, RiLoader4Line as Loader2, RiReceiptLine as Receipt, RiRefreshLine as RefreshCw, RiShieldCheckLine as ShieldCheck, RiSunFoggyLine as Sunrise, RiTruckLine as Truck, RiGroupLine as Users, RiWallet3Line as Wallet, RiToolsLine as Wrench, type RemixiconComponentType as LucideIcon } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { dailySummaryApi, type DailySummary, type DailySummaryLine } from "@/lib/api";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/feedback";

const SECTION_STYLE: Record<string, { icon: LucideIcon; tone: string }> = {
  trips: { icon: Truck, tone: "bg-accent-surface text-accent-text" },
  invoices: { icon: Receipt, tone: "bg-success-surface text-success-text" },
  fuel: { icon: Fuel, tone: "bg-orange-surface text-orange-text" },
  maintenance: { icon: Wrench, tone: "bg-fill-2 text-text-secondary" },
  documents: { icon: FileText, tone: "bg-danger-surface text-danger-text" },
  attendance: { icon: Users, tone: "bg-purple-surface text-purple-text" },
  payments: { icon: Wallet, tone: "bg-teal-surface text-teal-text" },
  approvals: { icon: CheckCircle2, tone: "bg-success-surface text-success-text" },
  audit: { icon: ShieldCheck, tone: "bg-purple-surface text-purple-text" },
  work: { icon: ClipboardList, tone: "bg-warning-surface text-warning-text" },
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
        i % 2 === 1 ? <strong key={i} className="font-semibold text-text-primary">{part}</strong> : <Fragment key={i}>{part}</Fragment>,
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
          <span className="shrink-0 text-text-secondary">{label[0].toUpperCase() + label.slice(1)}</span>
          <span className="text-right text-text-primary"><Rich text={value} /></span>
        </>
      ) : (
        <span className="text-text-primary"><Rich text={value} /></span>
      )}
    </div>
  ));
  return line.href ? (
    <Link href={line.href} className="block rounded-lg px-2 -mx-2 transition-colors hover:bg-fill-2">{rows}</Link>
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
    <section className="overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-separator-border bg-warning-surface/80 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-warning-surface-strong text-warning-text">
            <Sunrise className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-title-3-semibold tracking-tight text-text-primary">{greeting()}, {firstName}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-text-secondary">Your recap for</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warning-border bg-warning-surface px-2.5 py-1 font-semibold text-warning-text-strong">
                <CalendarDays className="h-3.5 w-3.5" />
                {shown.dayLabel}
              </span>
              {live ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success-border bg-success-surface px-2.5 py-1 font-semibold text-success-text">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-success-solid opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success-solid" />
                  </span>
                  Live at {clock(live.builtAt)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-separator-border bg-background-primary-default px-2.5 py-1 font-medium text-text-secondary">
                  <Clock className="h-3.5 w-3.5 text-text-tertiary" />
                  As of {clock(morning.builtAt)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-fill-2 p-0.5 text-caption-1-semibold">
            <button
              type="button"
              onClick={() => setLive(null)}
              className={cn("rounded-full px-3 py-1.5 transition-colors", !live ? "bg-background-primary-default text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary")}
            >
              Morning
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors disabled:opacity-60", live ? "bg-background-primary-default text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary")}
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {live ? "Refresh" : "Live"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
            className="rounded-full p-1.5 text-text-tertiary hover:bg-fill-3 hover:text-text-secondary"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-5 p-5">
          <p className="text-sm text-text-primary">{shown.headline}</p>

          {live && (
            <p className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3.5 py-2 text-xs",
              changes.length ? "bg-accent-surface text-accent-text-strong" : "bg-fill-1 text-text-secondary",
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
                  <Link key={t.key} href={t.href} className="group rounded-xl border border-separator-border px-4 py-3 transition-colors hover:border-border-button-default hover:bg-fill-2">
                    <p className={cn("text-title-1-semibold tabular-nums", t.warn && value > 0 ? "text-warning-text" : "text-text-primary")}>
                      {value.toLocaleString("en-IN")}
                    </p>
                    <p className="mt-0.5 text-caption-1-medium text-text-secondary">{t.label}</p>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Needs attention */}
          {shown.attention.length > 0 && (
            <div className="rounded-xl border border-warning-border">
              <p className="flex items-center gap-2 border-b border-warning-border bg-warning-surface px-4 py-2.5 text-body-semibold text-warning-text-strong">
                <AlertTriangle className="h-4 w-4" /> Needs your attention
                <span className="rounded-full bg-warning-surface-strong/70 px-2 py-0.5 text-[11px]">{shown.attention.length}</span>
              </p>
              <ul className="divide-y divide-warning-border">
                {shown.attention.map((line, i) => {
                  const body = (
                    <>
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning-solid" />
                      <span className="flex-1 text-sm text-text-primary"><Rich text={line.text} /></span>
                      {line.href && <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary transition-colors group-hover:text-text-secondary" />}
                    </>
                  );
                  return (
                    <li key={i}>
                      {line.href ? (
                        <Link href={line.href} className="group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-warning-surface-strong/60">{body}</Link>
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
              const style = SECTION_STYLE[s.key] ?? { icon: ClipboardList, tone: "bg-fill-2 text-text-secondary" };
              const Icon = style.icon;
              return (
                <div key={s.key} className="rounded-xl border border-separator-border p-4">
                  <p className="mb-1.5 flex items-center gap-2.5 text-body-semibold text-text-primary">
                    <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", style.tone)}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {s.title}
                  </p>
                  <div className="divide-y divide-separator-border text-sm">
                    {s.lines.map((line, i) => <Row key={i} line={line} />)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Today */}
          {shown.today.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-purple-surface/70 px-4 py-3">
              <span className="mr-1 flex items-center gap-2 text-body-semibold text-purple-text-strong">
                <CalendarDays className="h-4 w-4" /> Today, {shown.todayLabel}
              </span>
              {shown.today.flatMap((line) => facts(line.text).map(([label, value], i) => {
                const chip = (
                  <span className="rounded-full border border-purple-border bg-background-primary-default px-3 py-1 text-xs text-text-primary">
                    {label && <span className="font-semibold text-purple-text-strong">{label}: </span>}
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
