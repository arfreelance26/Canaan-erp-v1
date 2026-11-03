"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RiCheckboxCircleLine as CheckCircle2, RiEyeLine as Eye, RiFileChart2Line as FileBarChart2, RiDownloadLine as Download, RiLoader4Line as Loader2, RiCloseLine as X, RiInboxLine as Inbox, RiFlagLine as Flag } from "@remixicon/react";
import { tripsApi } from "@/lib/api";
import { CurrentTripsCard } from "./CurrentTripsCard";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { showError } from "@/lib/feedback";
import type { Trip } from "@/types/trip";

import { EmptyState } from "@/components/ui/EmptyState";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { plural } from "@/lib/plural";
import { PagedTbody } from "@/components/ui/PagedTbody";
// IST-day inclusive range check for a stored (naive-UTC) timestamp.
function inDateRange(iso: string | null | undefined, from: string, to: string): boolean {
  if (!iso) return false;
  const utc = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
  const ms = new Date(utc).getTime();
  if (from && ms < new Date(from + "T00:00:00").getTime()) return false;
  if (to && ms > new Date(to + "T23:59:59.999").getTime()) return false;
  return true;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const utc = d.endsWith("Z") || d.includes("+") ? d : d + "Z";
  return new Date(utc).toLocaleDateString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).replace(/\//g, "-");
}

function TripRow({ trip }: { trip: Trip }) {
  return (
    <li className="flex items-center gap-4 py-2.5">
      <p className="w-24 shrink-0 text-body-semibold tabular-nums text-text-primary">{trip.tripId}</p>
      <p className="min-w-0 flex-1 truncate text-xs uppercase text-text-secondary">
        {trip.origin} <span className="px-1 text-text-tertiary">→</span> {trip.destination}
      </p>
      <p className="shrink-0 text-[11px] tabular-nums text-text-tertiary">{trip.bookingReferenceNo}</p>
    </li>
  );
}

export function StaffDashboard() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const todayCA = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
  const monthStart = todayCA.slice(0, 8) + "01";
  const [receiveFrom, setReceiveFrom] = useState(monthStart);
  const [receiveTo, setReceiveTo] = useState(todayCA);
  const [entryFrom, setEntryFrom] = useState(monthStart);
  const [entryTo, setEntryTo] = useState(todayCA);
  const [viewModal, setViewModal] = useState<null | "receive" | "entry">(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    tripsApi.list()
      .then(setTrips)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useAutoRefresh(() => setRefreshKey(k => k + 1), 15000);
  useWebSocketEvent("sheet_collected",  () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_received",   () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_entered",    () => setRefreshKey(k => k + 1));
  useWebSocketEvent("sheet_unmarked",   () => setRefreshKey(k => k + 1));
  useWebSocketEvent("trip_updated",     () => setRefreshKey(k => k + 1));

  // Delivered by Yard but NOT yet received by Trip Sheet Register
  const pendingReceive = trips.filter(
    (t) => t.tripSheetCollected === true && !t.tripSheetReceived
  );

  // Received but NOT yet entered (no trip sheet submitted)
  const pendingEntry = trips.filter(
    (t) => t.tripSheetReceived === true && !t.hasSheet
  );

  // Trips an Auditor flagged and currently under review (not yet returned) —
  // Trip Sheet Register is one of the two roles expected to correct these
  // and return them for review, so this is a to-do count, not just a stat.
  const flaggedNeedingFix = trips.filter((t) => t.flaggedForRecheck && !t.recheckReturned);

  // Date-filtered lists for the View modal: Pending Receive by delivered date,
  // Pending Entry by received date.
  const receiveInRange = pendingReceive.filter((t) => inDateRange(t.tripSheetCollectedAt, receiveFrom, receiveTo));
  const entryInRange = pendingEntry.filter((t) => inDateRange(t.tripSheetReceivedAt, entryFrom, entryTo));

  const modalConfig = viewModal === "receive"
    ? {
        title: "Pending Receive",
        from: receiveFrom, to: receiveTo,
        rows: receiveInRange,
        dateLabel: "Delivered On",
        dateOf: (t: Trip) => t.tripSheetCollectedAt,
        accent: "amber" as const,
      }
    : viewModal === "entry"
    ? {
        title: "Pending Entry",
        from: entryFrom, to: entryTo,
        rows: entryInRange,
        dateLabel: "Received On",
        dateOf: (t: Trip) => t.tripSheetReceivedAt,
        accent: "blue" as const,
      }
    : null;

  async function handleDownloadPDF() {
    if (!modalConfig || downloading || modalConfig.rows.length === 0) return;
    setDownloading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginX = 12, marginY = 14, rowH = 8, headH = 9;
      const NAVY: [number, number, number] = [27, 43, 94];
      const rangeLabel = modalConfig.from === modalConfig.to
        ? fmtDate(modalConfig.from) : `${fmtDate(modalConfig.from)} - ${fmtDate(modalConfig.to)}`;

      const cols: [string, number][] = [
        ["#", 10], ["Trip ID", 26], ["Booking Ref", 30], ["Vehicle", 26],
        ["Driver", 30], ["Route", 40], [modalConfig.dateLabel, 24],
      ];

      function colHeader(y: number) {
        pdf.setFillColor(...NAVY);
        pdf.rect(marginX, y, cols.reduce((s, [, w]) => s + w, 0), headH, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(255, 255, 255);
        let x = marginX;
        for (const [label, w] of cols) { pdf.text(label.toUpperCase(), x + 2, y + 6); x += w; }
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(...NAVY);
      pdf.text(`Trip Sheet Tracking — ${modalConfig.title}`, marginX, marginY);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Period: ${rangeLabel}  |  ${modalConfig.rows.length} trip${modalConfig.rows.length !== 1 ? "s" : ""}`, marginX, marginY + 5);

      let curY = marginY + 9;
      colHeader(curY);
      curY += headH;

      modalConfig.rows.forEach((t, idx) => {
        if (curY + rowH > pageH - marginY) { pdf.addPage(); curY = marginY; colHeader(curY); curY += headH; }
        if (idx % 2 === 1) {
          pdf.setFillColor(245, 247, 250);
          pdf.rect(marginX, curY, cols.reduce((s, [, w]) => s + w, 0), rowH, "F");
        }
        const cells = [
          String(idx + 1),
          t.tripId ?? "—",
          t.bookingReferenceNo ?? "—",
          t.truckRegistration ?? "—",
          t.driverName ?? "—",
          `${t.origin ?? ""} > ${t.destination ?? ""}`,
          fmtDate(modalConfig.dateOf(t)),
        ];
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        pdf.setTextColor(40, 40, 40);
        let x = marginX;
        cells.forEach((c, ci) => {
          const clipped = pdf.splitTextToSize(String(c), cols[ci][1] - 3)[0] ?? "";
          pdf.text(clipped, x + 2, curY + 5.5);
          x += cols[ci][1];
        });
        curY += rowH;
      });

      pdf.save(`Trip_Sheet_${modalConfig.title.replace(/ /g, "_")}_${modalConfig.from}_to_${modalConfig.to}.pdf`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <DashboardHero
        role="Trip Sheet Register"
        description={
          loading
            ? "Loading trip sheets…"
            : [
                plural(pendingReceive.length, "sheet") + " to receive",
                `${pendingEntry.length} to enter`,
                flaggedNeedingFix.length > 0 ? plural(flaggedNeedingFix.length, "flagged trip") + " to correct" : null,
              ].filter(Boolean).join(" · ")
        }
      />

      {/* Current Trips */}
      <CurrentTripsCard />

      <Separator />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className={`rounded-xl border px-5 py-4 ${pendingReceive.length > 0 ? "border-warning-border bg-warning-surface " : "border-separator-border bg-background-primary-default "}`}>
          <p className="text-caption-1-semibold text-warning-text">Pending Receive</p>
          <p className="mt-1 text-display-3-semibold leading-none text-warning-text">{loading ? "—" : pendingReceive.length}</p>
          <p className="mt-1 text-[11px] text-warning-text">Delivered by Yard, not yet received</p>
        </div>
        <div className={`rounded-xl border px-5 py-4 ${pendingEntry.length > 0 ? "border-accent-border bg-accent-surface " : "border-separator-border bg-background-primary-default "}`}>
          <p className="text-caption-1-semibold text-accent-text">Pending Entry</p>
          <p className="mt-1 text-display-3-semibold leading-none text-accent-text">{loading ? "—" : pendingEntry.length}</p>
          <p className="mt-1 text-[11px] text-accent-text">Received, trip sheet not entered</p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/trips/flagged")}
          className={`rounded-xl border px-5 py-4 text-left transition-shadow hover:shadow-md ${flaggedNeedingFix.length > 0 ? "border-danger-border bg-danger-surface " : "border-separator-border bg-background-primary-default "}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-caption-1-semibold text-danger-text">Flagged Trips</p>
            <Flag className="h-4 w-4 text-danger-text" />
          </div>
          <p className="mt-1 text-display-3-semibold leading-none text-danger-text">{loading ? "—" : flaggedNeedingFix.length}</p>
          <p className="mt-1 text-[11px] text-danger-text">{flaggedNeedingFix.length > 0 ? "Need your fix" : "None needing a fix"}</p>
        </button>
      </div>

      <Separator />

      {/* Two panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Pending Receive */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-body-semibold text-text-primary">Pending Receive</h2>
                {!loading && pendingReceive.length > 0 && (
                  <span className="rounded-full bg-warning-surface text-warning-text px-2 py-0.5 text-caption-2-semibold tabular-nums">{pendingReceive.length}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <DateRangePill from={receiveFrom} to={receiveTo} onFromChange={setReceiveFrom} onToChange={setReceiveTo} />
                <button
                  type="button"
                  onClick={() => setViewModal("receive")}
                  className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md"
                >
                  <Eye className="h-4 w-4" />
                  View
                </button>
              </div>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : pendingReceive.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-success-text" />
                <p className="text-body-medium text-text-secondary">All sheets received</p>
              </div>
            ) : (
              <ul className="max-h-72 divide-y divide-separator-border overflow-y-auto pr-1">
                {pendingReceive.map((trip) => <TripRow key={trip.id} trip={trip} />)}
              </ul>
            )}
            <div className="mt-3 border-t border-separator-border pt-3">
              <Link href="/trips/reconciliation" className="text-caption-1-semibold text-accent-text transition-colors hover:text-accent-text-strong">
                Go to Reconciliation →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Pending Entry */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-body-semibold text-text-primary">Pending Entry</h2>
                {!loading && pendingEntry.length > 0 && (
                  <span className="rounded-full bg-accent-surface text-accent-text px-2 py-0.5 text-caption-2-semibold tabular-nums">{pendingEntry.length}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <DateRangePill from={entryFrom} to={entryTo} onFromChange={setEntryFrom} onToChange={setEntryTo} />
                <button
                  type="button"
                  onClick={() => setViewModal("entry")}
                  className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md"
                >
                  <Eye className="h-4 w-4" />
                  View
                </button>
              </div>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : pendingEntry.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-success-text" />
                <p className="text-body-medium text-text-secondary">All sheets entered</p>
              </div>
            ) : (
              <ul className="max-h-72 divide-y divide-separator-border overflow-y-auto pr-1">
                {pendingEntry.map((trip) => <TripRow key={trip.id} trip={trip} />)}
              </ul>
            )}
            <div className="mt-3 border-t border-separator-border pt-3">
              <Link href="/trips/reconciliation" className="text-caption-1-semibold text-accent-text transition-colors hover:text-accent-text-strong">
                Go to Reconciliation →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View modal — filtered pending list + Download PDF */}
      {modalConfig && (() => {
        const rangeLabel = modalConfig.from === modalConfig.to
          ? fmtDate(modalConfig.from) : `${fmtDate(modalConfig.from)} – ${fmtDate(modalConfig.to)}`;
        const accentBtn = modalConfig.accent === "amber"
          ? "border-warning-border bg-warning-surface text-warning-text hover:bg-warning-surface-strong"
          : "border-accent-border bg-accent-surface text-accent-text hover:bg-accent-surface-strong";
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-scrim/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setViewModal(null); }}>
            <div className="w-full max-w-4xl rounded-xl bg-background-primary-default shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
                <div>
                  <p className="font-semibold text-text-primary">Trip Sheet Tracking — {modalConfig.title}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{rangeLabel} · {modalConfig.rows.length} trip{modalConfig.rows.length !== 1 ? "s" : ""}</p>
                </div>
                <button type="button" onClick={() => setViewModal(null)} className="rounded-lg p-1.5 text-text-tertiary hover:bg-fill-3"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex-1 overflow-auto px-5 py-4">
                {modalConfig.rows.length === 0 ? (
                  <EmptyState size="compact" illustration="logistics" title="No trips found for the selected date range" />
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-separator-border bg-fill-1">
                        {["#", "Trip ID", "Booking Ref", "Vehicle", "Driver", "Route", modalConfig.dateLabel].map((col) => (
                          <th key={col} className="px-3 py-2.5 text-caption-1-semibold text-text-secondary whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <PagedTbody className="divide-y divide-separator-border" items={modalConfig.rows}>
                      {(t, i) => (
                        <tr key={t.id} className="hover:bg-fill-2">
                          <td className="px-3 py-2 text-text-tertiary text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-text-primary whitespace-nowrap">{t.tripId}</td>
                          <td className="px-3 py-2 text-text-primary whitespace-nowrap">{t.bookingReferenceNo ?? "—"}</td>
                          <td className="px-3 py-2 text-text-primary whitespace-nowrap">{t.truckRegistration ?? "—"}</td>
                          <td className="px-3 py-2 text-text-primary whitespace-nowrap">{t.driverName ?? "—"}</td>
                          <td className="px-3 py-2 text-text-secondary whitespace-nowrap max-w-[180px] truncate">{[t.origin, t.destination].filter(Boolean).join(" → ") || "—"}</td>
                          <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{fmtDate(modalConfig.dateOf(t))}</td>
                        </tr>
                      )}
                    </PagedTbody>
                  </table>
                )}
              </div>
              <div className="border-t px-5 py-3 flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  disabled={downloading || modalConfig.rows.length === 0}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-body-medium disabled:opacity-50 disabled:cursor-not-allowed ${accentBtn}`}
                >
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {downloading ? "Generating…" : "Download PDF"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
