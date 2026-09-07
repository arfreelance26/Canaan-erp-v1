"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { trucksApi, tripsApi } from "@/lib/api";
import { mapLimit } from "@/lib/async-pool";
import type { Truck } from "@/types/truck";
import type { Trip } from "@/types/trip";
import type { TripSheetData } from "@/types/trip-sheet";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { Truck as TruckIcon, History, FileSearch, X, Loader2, ShieldCheck, Gauge, Wrench, Download, ChevronDown, ArrowRight } from "lucide-react";

function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 ${color}`}>
      <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">{label}</span>
      <span className="text-xs font-semibold">{value || "—"}</span>
    </div>
  );
}

function fmt(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type TripHistoryDialogProps = {
  truck: Truck;
  onClose: () => void;
};

function defaultDateRange() {
  const to   = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  };
}

function buildExcelRows(tripList: Trip[], sheetMap: Map<string, TripSheetData>) {
  return tripList.map((t) => {
    const s = sheetMap.get(t.id);
    return {
      "Trip ID":           t.tripId,
      "Booking Date":      t.bookingCreatedDate ? t.bookingCreatedDate.slice(0, 10) : "",
      "Trip Category":     t.tripCategory || "",
      "Origin":            t.origin || "",
      "Destination":       t.destination || "",
      "Total KM":          s?.totalKm ? Number(s.totalKm) : "",
      "Hire Amount (₹)":  s?.hireAmount ? Number(s.hireAmount) : "",
    };
  });
}

async function downloadExcel(rows: ReturnType<typeof buildExcelRows>, filename: string) {
  const { utils, writeFile } = await import("xlsx");
  const ws = utils.json_to_sheet(rows);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "Trip History");
  writeFile(wb, filename);
}

const CAT_COLOR: Record<string, string> = {
  "LOCAL":       "bg-blue-100 text-blue-700",
  "LOCAL CFS":   "bg-cyan-100 text-cyan-700",
  "OUTSTATION":  "bg-purple-100 text-purple-700",
  "SHIFTING":    "bg-amber-100 text-amber-700",
  "RETURN TRIP": "bg-orange-100 text-orange-700",
};
const STATUS_COLOR: Record<string, string> = {
  "Completed":  "bg-emerald-100 text-emerald-700 dark:text-emerald-900",
  "On-Transit": "bg-blue-100    text-blue-700    dark:text-blue-900",
  "Started":    "bg-indigo-100  text-indigo-700  dark:text-indigo-900",
  "Loaded":     "bg-indigo-100  text-indigo-700  dark:text-indigo-900",
  "Reached":    "bg-teal-100    text-teal-700    dark:text-teal-900",
  "Unloaded":   "bg-teal-100    text-teal-700    dark:text-teal-900",
  "Cancelled":  "bg-red-100     text-red-600     dark:text-red-900",
  "Assigned":   "bg-gray-100    text-gray-500    dark:text-gray-700",
};

function TripHistoryDialog({ truck, onClose }: TripHistoryDialogProps) {
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [sheets, setSheets]     = useState<Map<string, TripSheetData>>(new Map());
  const [loading, setLoading]   = useState(true);
  const [dateFrom, setDateFrom] = useState(defaultDateRange().from);
  const [dateTo,   setDateTo]   = useState(defaultDateRange().to);
  const [dlOpen,   setDlOpen]   = useState(false);

  useEffect(() => {
    async function load() {
      const all = await tripsApi.list();
      const truckTrips = all.filter((t) => t.vehicleId === truck.truckId);
      setAllTrips(truckTrips);
      const withSheet = truckTrips.filter((t) => t.hasSheet);
      // Cap concurrency at 8 so a truck with a long history doesn't fire dozens
      // of simultaneous requests (each holds a DB connection). Order is preserved.
      const results = await mapLimit(withSheet, 8, (t) =>
        tripsApi.getSheet(t.id).then((s) => ({ id: t.id, sheet: s })).catch(() => null)
      );
      const map = new Map<string, TripSheetData>();
      for (const r of results) if (r && r.sheet) map.set(r.id, r.sheet);
      setSheets(map);
    }
    load().catch(() => {}).finally(() => setLoading(false));
  }, [truck.truckId]);

  // Filter then sort latest first
  const trips = allTrips
    .filter((t) => {
      if (!t.bookingCreatedDate) return true;
      const d = t.bookingCreatedDate.slice(0, 10);
      return d >= dateFrom && d <= dateTo;
    })
    .sort((a, b) => (b.bookingCreatedDate || "").localeCompare(a.bookingCreatedDate || ""));

  // Summary stats
  const completedCount = trips.filter((t) => t.status === "Completed").length;
  const totalKmSum  = trips.reduce((s, t) => s + (sheets.get(t.id)?.totalKm  ? Number(sheets.get(t.id)!.totalKm)  : 0), 0);
  const totalHireSum = trips.reduce((s, t) => s + (sheets.get(t.id)?.hireAmount ? Number(sheets.get(t.id)!.hireAmount) : 0), 0);

  const regFormatted = truck.registrationNumber.replace(/^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{1,4})$/, "$1 $2 $3 $4");

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => dlOpen && setDlOpen(false)}>
      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl animate-dialog-enter" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Trip History — {regFormatted}</h2>
              <p className="mt-0.5 text-xs text-gray-400">
                {truck.manufacturer} {truck.truckType}
                {!loading && (
                  <> · <span className="font-semibold text-gray-600">{trips.length} trip{trips.length !== 1 ? "s" : ""}</span> in selected range</>
                )}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Summary strip ── */}
        {!loading && trips.length > 0 && (
          <div className="shrink-0 flex flex-wrap gap-3 border-b border-gray-100 bg-gray-50/60 px-6 py-3">
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
              <span className="text-xs text-gray-400">Trips</span>
              <span className="text-xs font-semibold text-gray-700">{trips.length}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
              <span className="text-xs text-gray-400">Completed</span>
              <span className="text-xs font-semibold text-emerald-600">{completedCount}</span>
            </div>
            {totalKmSum > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
                <span className="text-xs text-gray-400">Total KM</span>
                <span className="text-xs font-semibold text-gray-700">{totalKmSum.toLocaleString("en-IN")} km</span>
              </div>
            )}
            {totalHireSum > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
                <span className="text-xs text-gray-400">Total Hire</span>
                <span className="text-xs font-semibold text-blue-600">₹{totalHireSum.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-6 py-3 flex-wrap">
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">From</span>
              <DatePickerInput
                value={dateFrom}
                onChange={(v) => setDateFrom(dateTo && v > dateTo ? dateTo : v)}
              />
            </div>
            <span className="mb-2.5 text-gray-300">→</span>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">To</span>
              <DatePickerInput
                value={dateTo}
                onChange={(v) => setDateTo(dateFrom && v < dateFrom ? dateFrom : v)}
              />
            </div>
          </div>
          <div className="relative">
            <button type="button" disabled={loading} onClick={() => setDlOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
              <Download className="h-3.5 w-3.5 text-gray-500" />
              Download Excel
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </button>
            {dlOpen && (
              <div className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                <button type="button"
                  onClick={() => { setDlOpen(false); downloadExcel(buildExcelRows(trips, sheets), `${truck.registrationNumber}_trips_${dateFrom}_to_${dateTo}.xlsx`); }}
                  className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <span className="text-xs font-semibold text-gray-800">Selected Timeline</span>
                  <span className="text-[10px] text-gray-400">{dateFrom} → {dateTo}</span>
                </button>
                <div className="h-px bg-gray-100" />
                <button type="button"
                  onClick={() => { setDlOpen(false); downloadExcel(buildExcelRows(allTrips, sheets), `${truck.registrationNumber}_full_trip_report.xlsx`); }}
                  className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <span className="text-xs font-semibold text-gray-800">Full Report</span>
                  <span className="text-[10px] text-gray-400">All {allTrips.length} trips for this truck</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2.5 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              <span className="text-sm">Loading trip history…</span>
            </div>
          ) : trips.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <History className="h-7 w-7 text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500">No trips in this date range</p>
              <p className="text-xs text-gray-400">Try expanding the date range above</p>
            </div>
          ) : (
            <table className="w-full min-w-[960px] text-left">
              <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50">
                <tr>
                  {["#", "Trip ID", "Date", "Category", "Route", "Cargo", "Status", "KM", "Hire Amount"].map((col) => (
                    <th key={col} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {trips.map((trip, idx) => {
                  const sheet = sheets.get(trip.id);
                  const km   = sheet?.totalKm   ? Number(sheet.totalKm)   : null;
                  const hire = sheet?.hireAmount ? Number(sheet.hireAmount) : null;
                  return (
                    <tr key={trip.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-300 tabular-nums select-none">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-blue-600">{trip.tripId}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{fmt(trip.bookingCreatedDate)}</td>
                      <td className="px-4 py-3">
                        {trip.tripCategory
                          ? <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${CAT_COLOR[trip.tripCategory] ?? "bg-gray-100 text-gray-600"}`}>{trip.tripCategory}</span>
                          : <span className="text-gray-300 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {trip.origin || trip.destination ? (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <span className="max-w-[100px] truncate">{trip.origin || "—"}</span>
                            <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />
                            <span className="max-w-[100px] truncate">{trip.destination || "—"}</span>
                          </div>
                        ) : <span className="text-gray-300 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {trip.cargoClassification
                          ? <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500">{trip.cargoClassification}</span>
                          : <span className="text-gray-300 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[trip.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {trip.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 tabular-nums whitespace-nowrap">
                        {km != null ? `${km.toLocaleString("en-IN")} km` : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-emerald-700 tabular-nums whitespace-nowrap">
                        {hire != null ? `₹${hire.toLocaleString("en-IN", { minimumFractionDigits: 0 })}` : <span className="text-gray-300 font-normal">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {(totalKmSum > 0 || totalHireSum > 0) && (
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td colSpan={7} className="px-4 py-3 text-sm text-gray-500">
                      Total · {trips.length} trip{trips.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-700 tabular-nums whitespace-nowrap">
                      {totalKmSum > 0 ? `${totalKmSum.toLocaleString("en-IN")} km` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-emerald-700 tabular-nums whitespace-nowrap">
                      {totalHireSum > 0 ? `₹${totalHireSum.toLocaleString("en-IN", { minimumFractionDigits: 0 })}` : "—"}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}

function fmtExpiry(d: string) {
  if (!d) return "—";
  const date = new Date(d);
  const today = new Date();
  const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const label = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  if (diffDays < 0)  return { label, status: "expired" as const };
  if (diffDays <= 30) return { label, status: "soon" as const };
  return { label, status: "ok" as const };
}

function ExpiryBadge({ date }: { date: string }) {
  if (!date) return <span className="text-sm text-gray-400">—</span>;
  const { label, status } = fmtExpiry(date) as { label: string; status: "expired" | "soon" | "ok" };
  const cls =
    status === "expired" ? "bg-red-50 text-red-700 border-red-200" :
    status === "soon"    ? "bg-amber-50 text-amber-700 border-amber-200" :
                           "bg-emerald-50 text-emerald-700 border-emerald-200";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-gray-800">{value || "—"}</span>
    </div>
  );
}

type TruckDetailsDialogProps = { truck: Truck; onClose: () => void };

function TruckDetailsDialog({ truck, onClose }: TruckDetailsDialogProps) {
  const regFormatted = truck.registrationNumber.replace(
    /^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{1,4})$/, "$1 $2 $3 $4"
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-blue-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-white">
              <TruckIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{regFormatted}</h2>
              <p className="text-xs text-blue-100">{truck.manufacturer} · {truck.truckType}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Basic Info */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
              <Wrench className="h-3.5 w-3.5" /> Basic Information
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 sm:grid-cols-3">
              <DetailRow label="Truck ID"           value={truck.truckId} />
              <DetailRow label="Registration No."   value={regFormatted} />
              <DetailRow label="Manufacturer"       value={truck.manufacturer} />
              <DetailRow label="Model"              value={truck.modelName} />
              <DetailRow label="Type"               value={truck.truckType} />
              <DetailRow label="Year of Manufacture" value={truck.yearOfManufacture} />
              <DetailRow label="Chassis Number"     value={truck.chassisNumber} />
              <DetailRow label="Tyre Layout"        value={truck.tyreLayout} />
              <DetailRow label="Fuel Capacity"      value={truck.fuelCapacity ? `${truck.fuelCapacity} L` : ""} />
              <DetailRow label="Odometer"           value={truck.odometer ? `${Number(truck.odometer).toLocaleString("en-IN")} km` : ""} />
              <DetailRow label="Branch"             value={truck.branchRegisteredTo} />
            </div>
          </section>

          {/* Compliance */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
              <ShieldCheck className="h-3.5 w-3.5" /> Compliance & Document Expiry
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { label: "FC (Fitness Certificate)",       date: truck.fcExpiryDate },
                { label: "Insurance",                      date: truck.insuranceExpiryDate },
                { label: "National Permit",                date: truck.nationalPermitDate },
                { label: "Local Permit",                   date: truck.localPermitDate },
                { label: "Road Tax",                       date: truck.roadTaxDate },
                { label: "Pollution Certificate (PUC)",    date: truck.pollutionCertificateDate },
                { label: "RC Validity",                    date: truck.rcValidityDate },
              ].map(({ label, date }) => (
                <div key={label} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-4 py-2.5">
                  <span className="text-xs font-semibold text-gray-600">{label}</span>
                  <ExpiryBadge date={date} />
                </div>
              ))}
            </div>
          </section>

          {/* Permit Numbers */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
              <Gauge className="h-3.5 w-3.5" /> Permit & Certificate Numbers
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 sm:grid-cols-3">
              <DetailRow label="National Permit No." value={truck.nationalPermitNumber} />
              <DetailRow label="Local Permit No."    value={truck.localPermitNumber} />
              <DetailRow label="Road Tax No."        value={truck.roadTaxNumber} />
              <DetailRow label="Pollution Cert. No." value={truck.pollutionCertificateNumber} />
            </div>
          </section>

        </div>
      </div>
    </div>,
    document.body
  );
}

export default function FleetSummaryPage() {
  const [trucks, setTrucks]           = useState<Truck[]>([]);
  const [loading, setLoading]         = useState(true);
  const [historyTruck, setHistoryTruck]   = useState<Truck | null>(null);
  const [detailsTruck, setDetailsTruck]   = useState<Truck | null>(null);

  useEffect(() => {
    trucksApi.list().then(setTrucks).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton hasButton={false} hasSearch={false} columns={1} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Fleet Summary</h1>
        <p className="mt-1 text-sm text-gray-500">
          {trucks.length} truck{trucks.length !== 1 ? "s" : ""} in fleet
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {trucks.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
            No trucks found.
          </div>
        )}

        {trucks.map((truck) => (
          <div
            key={truck.id}
            className="flex items-center gap-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
          >
            {/* Left accent bar */}
            <div className="w-1.5 self-stretch shrink-0 bg-blue-500" />

            {/* Icon block */}
            <div className="flex h-full shrink-0 items-center justify-center bg-blue-50 px-5 py-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <TruckIcon className="h-5 w-5" />
              </div>
            </div>

            {/* Reg number */}
            <div className="flex shrink-0 flex-col justify-center border-r border-gray-100 px-6 py-4">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Registration No.</span>
              <span className="mt-0.5 text-base font-bold tracking-wide text-gray-900">
                {truck.registrationNumber.replace(/^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{1,4})$/, "$1 $2 $3 $4")}
              </span>
            </div>

            {/* Fields */}
            <div className="flex flex-1 flex-wrap items-center gap-2 px-5 py-4">
              <Pill label="Manufacturer" value={truck.manufacturer}  color="bg-indigo-50 text-indigo-800" />
              <Pill label="Type"         value={truck.truckType}     color="bg-emerald-50 text-emerald-800" />
              <Pill label="Tyre Layout"  value={truck.tyreLayout}    color="bg-amber-50 text-amber-800" />
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 items-center gap-2 border-l border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setHistoryTruck(truck)}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700 hover:shadow-md hover:shadow-violet-200 whitespace-nowrap"
              >
                <History className="h-3.5 w-3.5" />
                Trip History
              </button>
              <button
                type="button"
                onClick={() => setDetailsTruck(truck)}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-blue-200 transition-all hover:bg-blue-700 hover:shadow-md hover:shadow-blue-200 whitespace-nowrap"
              >
                <FileSearch className="h-3.5 w-3.5" />
                Truck Details
              </button>
            </div>
          </div>
        ))}
      </div>

      {historyTruck && (
        <TripHistoryDialog
          truck={historyTruck}
          onClose={() => setHistoryTruck(null)}
        />
      )}

      {detailsTruck && (
        <TruckDetailsDialog
          truck={detailsTruck}
          onClose={() => setDetailsTruck(null)}
        />
      )}
    </div>
  );
}
