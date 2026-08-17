"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { trucksApi, tripsApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import type { Trip } from "@/types/trip";
import type { TripSheetData } from "@/types/trip-sheet";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Truck as TruckIcon, History, FileSearch, X, Loader2, ShieldCheck, Gauge, Wrench, Download, ChevronDown } from "lucide-react";

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
      const truckTrips = all.filter((t) => t.vehicleId === truck.id);
      setAllTrips(truckTrips);

      const withSheet = truckTrips.filter((t) => t.hasSheet);
      const results = await Promise.all(
        withSheet.map((t) => tripsApi.getSheet(t.id).then((s) => ({ id: t.id, sheet: s })).catch(() => null))
      );
      const map = new Map<string, TripSheetData>();
      for (const r of results) if (r) map.set(r.id, r.sheet);
      setSheets(map);
    }
    load().catch(() => {}).finally(() => setLoading(false));
  }, [truck.id]);

  const trips = allTrips.filter((t) => {
    if (!t.bookingCreatedDate) return true;
    const d = t.bookingCreatedDate.slice(0, 10);
    return d >= dateFrom && d <= dateTo;
  });

  const regFormatted = truck.registrationNumber.replace(
    /^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{1,4})$/,
    "$1 $2 $3 $4"
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => dlOpen && setDlOpen(false)}
    >
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white">
              <History className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Trip History — {regFormatted}</h2>
              <p className="text-xs text-gray-400">
                {loading ? "Loading…" : `${trips.length} trip${trips.length !== 1 ? "s" : ""} in range`}
              </p>
            </div>
          </div>

          {/* Date range pickers */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">From</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-xs font-semibold text-gray-700 outline-none"
              />
            </div>
            <span className="text-gray-400">—</span>
            <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">To</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-xs font-semibold text-gray-700 outline-none"
              />
            </div>
            {/* Download Excel dropdown */}
            <div className="relative ml-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => setDlOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download Excel
                <ChevronDown className="h-3 w-3" />
              </button>

              {dlOpen && (
                <div className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setDlOpen(false);
                      downloadExcel(
                        buildExcelRows(trips, sheets),
                        `${truck.registrationNumber}_trips_${dateFrom}_to_${dateTo}.xlsx`
                      );
                    }}
                    className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-800">Selected Timeline</span>
                    <span className="text-[10px] text-gray-400">{dateFrom} → {dateTo}</span>
                  </button>
                  <div className="h-px bg-gray-100" />
                  <button
                    type="button"
                    onClick={() => {
                      setDlOpen(false);
                      downloadExcel(
                        buildExcelRows(allTrips, sheets),
                        `${truck.registrationNumber}_full_trip_report.xlsx`
                      );
                    }}
                    className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-800">Full Report</span>
                    <span className="text-[10px] text-gray-400">All {allTrips.length} trips for this truck</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="ml-2 rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-3 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Fetching trip history…</span>
            </div>
          ) : trips.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              No trips found for this truck in the selected date range.
            </div>
          ) : (
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-200 bg-gray-50">
                  {["Trip ID", "Booking Date", "Trip Category", "Origin", "Destination", "Total KM", "Hire Amount"].map((col) => (
                    <th key={col} className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {trips.map((trip) => {
                  const sheet = sheets.get(trip.id);
                  const totalKm   = sheet?.totalKm   ? `${Number(sheet.totalKm).toLocaleString("en-IN")} km` : "—";
                  const hireAmt   = sheet?.hireAmount
                    ? `₹${Number(sheet.hireAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                    : "—";
                  return (
                    <tr key={trip.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-blue-700">{trip.tripId}</td>
                      <td className="px-5 py-3 text-gray-600">{fmt(trip.bookingCreatedDate)}</td>
                      <td className="px-5 py-3">
                        {trip.tripCategory ? (
                          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                            {trip.tripCategory}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-700">{trip.origin || "—"}</td>
                      <td className="px-5 py-3 text-gray-700">{trip.destination || "—"}</td>
                      <td className="px-5 py-3 font-medium text-gray-800">{totalKm}</td>
                      <td className="px-5 py-3 font-semibold text-emerald-700">{hireAmt}</td>
                    </tr>
                  );
                })}
              </tbody>
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
