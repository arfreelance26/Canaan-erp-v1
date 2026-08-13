"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, ClipboardList, CheckCircle2, FileBarChart2, Download, Loader2, X } from "lucide-react";
import { tripsApi } from "@/lib/api";
import { CurrentTripsCard } from "./CurrentTripsCard";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { showError } from "@/lib/swal";
import type { Trip } from "@/types/trip";

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
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-900">{trip.tripId}</p>
        <p className="truncate text-[11px] text-gray-500">
          {trip.origin} → {trip.destination}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[11px] text-gray-400">{trip.bookingReferenceNo}</p>
      </div>
    </li>
  );
}

export function StaffDashboard() {
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Sheet Register</h1>
          <p className="mt-1 text-sm text-gray-500">Sheets awaiting receipt and entry</p>
        </div>
      </div>

      {/* Current Trips */}
      <CurrentTripsCard />

      <Separator />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className={`rounded-xl border px-5 py-4 ${pendingReceive.length > 0 ? "border-amber-200 bg-amber-50 dark:bg-amber-950/30" : "border-gray-200 bg-white dark:bg-[#141929]"}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Pending Receive</p>
          <p className="mt-1 text-4xl font-bold leading-none text-amber-700">{loading ? "—" : pendingReceive.length}</p>
          <p className="mt-1 text-[11px] text-amber-500">Delivered by Yard, not yet received</p>
        </div>
        <div className={`rounded-xl border px-5 py-4 ${pendingEntry.length > 0 ? "border-blue-200 bg-blue-50 dark:bg-blue-950/30" : "border-gray-200 bg-white dark:bg-[#141929]"}`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Pending Entry</p>
          <p className="mt-1 text-4xl font-bold leading-none text-blue-700">{loading ? "—" : pendingEntry.length}</p>
          <p className="mt-1 text-[11px] text-blue-500">Received, trip sheet not entered</p>
        </div>
      </div>

      <Separator />

      {/* Two panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Pending Receive */}
        <Card className="border-amber-200">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-1.5">
              <div className="flex items-center gap-2 mr-auto shrink-0">
                <Inbox className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-gray-700">Pending Receive</h2>
                {!loading && pendingReceive.length > 0 && (
                  <Badge variant="warning">{pendingReceive.length}</Badge>
                )}
              </div>
              <div className="w-[120px] shrink-0">
                <DatePickerInput value={receiveFrom} onChange={setReceiveFrom} />
              </div>
              <span className="text-xs text-gray-400 shrink-0">to</span>
              <div className="w-[120px] shrink-0">
                <DatePickerInput value={receiveTo} onChange={setReceiveTo} />
              </div>
              <button
                type="button"
                onClick={() => setViewModal("receive")}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                <FileBarChart2 className="h-3.5 w-3.5" />
                View
              </button>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : pendingReceive.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                <p className="text-sm font-medium text-emerald-700">All sheets received</p>
              </div>
            ) : (
              <ul className="max-h-72 divide-y divide-gray-50 overflow-y-auto">
                {pendingReceive.map((trip) => <TripRow key={trip.id} trip={trip} />)}
              </ul>
            )}
            <div className="mt-4 border-t border-gray-100 pt-3">
              <Link href="/trips/reconciliation" className="text-xs font-medium text-amber-600 hover:underline">
                Go to Reconciliation →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Pending Entry */}
        <Card className="border-blue-200">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-1.5">
              <div className="flex items-center gap-2 mr-auto shrink-0">
                <ClipboardList className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-gray-700">Pending Entry</h2>
                {!loading && pendingEntry.length > 0 && (
                  <Badge variant="active">{pendingEntry.length}</Badge>
                )}
              </div>
              <div className="w-[120px] shrink-0">
                <DatePickerInput value={entryFrom} onChange={setEntryFrom} />
              </div>
              <span className="text-xs text-gray-400 shrink-0">to</span>
              <div className="w-[120px] shrink-0">
                <DatePickerInput value={entryTo} onChange={setEntryTo} />
              </div>
              <button
                type="button"
                onClick={() => setViewModal("entry")}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                <FileBarChart2 className="h-3.5 w-3.5" />
                View
              </button>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : pendingEntry.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                <p className="text-sm font-medium text-emerald-700">All sheets entered</p>
              </div>
            ) : (
              <ul className="max-h-72 divide-y divide-gray-50 overflow-y-auto">
                {pendingEntry.map((trip) => <TripRow key={trip.id} trip={trip} />)}
              </ul>
            )}
            <div className="mt-4 border-t border-gray-100 pt-3">
              <Link href="/trips/reconciliation" className="text-xs font-medium text-blue-600 hover:underline">
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
          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
          : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100";
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setViewModal(null); }}>
            <div className="w-full max-w-4xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
                <div>
                  <p className="font-semibold text-gray-900">Trip Sheet Tracking — {modalConfig.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{rangeLabel} · {modalConfig.rows.length} trip{modalConfig.rows.length !== 1 ? "s" : ""}</p>
                </div>
                <button type="button" onClick={() => setViewModal(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex-1 overflow-auto px-5 py-4">
                {modalConfig.rows.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-12">No trips found for the selected date range.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {["#", "Trip ID", "Booking Ref", "Vehicle", "Driver", "Route", modalConfig.dateLabel].map((col) => (
                          <th key={col} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {modalConfig.rows.map((t, i) => (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{t.tripId}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{t.bookingReferenceNo ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{t.truckRegistration ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{t.driverName ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap max-w-[180px] truncate">{[t.origin, t.destination].filter(Boolean).join(" → ") || "—"}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(modalConfig.dateOf(t))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="border-t px-5 py-3 flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  disabled={downloading || modalConfig.rows.length === 0}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${accentBtn}`}
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
