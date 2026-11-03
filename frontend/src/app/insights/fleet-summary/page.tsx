"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { trucksApi, tripsApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import type { Trip } from "@/types/trip";
import type { TripSheetData } from "@/types/trip-sheet";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { getComplianceStatus, type ComplianceField } from "@/lib/compliance";
import { showError } from "@/lib/feedback";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { RiTruckLine as TruckIcon, RiHistoryLine as History, RiFileSearchLine as FileSearch, RiCloseLine as X, RiLoader4Line as Loader2, RiShieldCheckLine as ShieldCheck, RiDashboard3Line as Gauge, RiToolsLine as Wrench, RiDownloadLine as Download, RiArrowDownSLine as ChevronDown, RiArrowRightLine as ArrowRight } from "@remixicon/react";

import { EmptyState } from "@/components/ui/EmptyState";
function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 ${color}`}>
      <span className="text-[9px] font-semibold opacity-60">{label}</span>
      <span className="text-caption-1-semibold">{value || "—"}</span>
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
  "LOCAL":       "bg-accent-surface-strong text-accent-text",
  "LOCAL CFS":   "bg-teal-surface-strong text-teal-text",
  "OUTSTATION":  "bg-fill-2 text-text-primary",
  "SHIFTING":    "bg-warning-surface-strong text-warning-text",
  "RETURN TRIP": "bg-orange-surface-strong text-orange-text",
};
const STATUS_COLOR: Record<string, string> = {
  "Completed":  "bg-success-surface-strong text-success-text",
  "On-Transit": "bg-accent-surface-strong text-accent-text",
  "Started":    "bg-purple-surface-strong text-purple-text",
  "Loaded":     "bg-purple-surface-strong text-purple-text",
  "Reached":    "bg-teal-surface-strong text-teal-text",
  "Unloaded":   "bg-teal-surface-strong text-teal-text",
  "Cancelled":  "bg-danger-surface-strong text-danger-text",
  "Assigned":   "bg-fill-2 text-text-secondary",
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
      const withSheet = truckTrips.filter((t) => t.hasSheet).map((t) => t.id);
      // One bulk request for the truck's whole history instead of one per trip.
      setSheets(withSheet.length ? await tripsApi.getSheetsBulk(withSheet) : new Map());
    }
    load().catch(() => {
      showError("Couldn't load trip history — showing an empty list, not necessarily an empty result.");
    }).finally(() => setLoading(false));
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim/40 p-4" onClick={() => dlOpen && setDlOpen(false)}>
      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-background-primary-default shadow-xl animate-modal-in" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-separator-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-surface text-accent-text">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-headline-semibold text-text-primary">Trip History — {regFormatted}</h2>
              <p className="mt-0.5 text-xs text-text-tertiary">
                {truck.manufacturer} {truck.truckType}
                {!loading && (
                  <> · <span className="font-semibold text-text-secondary">{trips.length} trip{trips.length !== 1 ? "s" : ""}</span> in selected range</>
                )}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-fill-3 hover:text-text-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Summary strip ── */}
        {!loading && trips.length > 0 && (
          <div className="shrink-0 flex flex-wrap gap-3 border-b border-separator-border bg-fill-1 px-6 py-3">
            <div className="flex items-center gap-1.5 rounded-lg border border-separator-border bg-background-primary-default px-3 py-1.5">
              <span className="text-xs text-text-tertiary">Trips</span>
              <span className="text-caption-1-semibold text-text-primary">{trips.length}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-separator-border bg-background-primary-default px-3 py-1.5">
              <span className="text-xs text-text-tertiary">Completed</span>
              <span className="text-caption-1-semibold text-success-text">{completedCount}</span>
            </div>
            {totalKmSum > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-separator-border bg-background-primary-default px-3 py-1.5">
                <span className="text-xs text-text-tertiary">Total KM</span>
                <span className="text-caption-1-semibold text-text-primary">{totalKmSum.toLocaleString("en-IN")} km</span>
              </div>
            )}
            {totalHireSum > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-separator-border bg-background-primary-default px-3 py-1.5">
                <span className="text-xs text-text-tertiary">Total Hire</span>
                <span className="text-caption-1-semibold text-accent-text">₹{totalHireSum.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-separator-border bg-fill-1 px-6 py-3 flex-wrap">
          <DateRangePill
            from={dateFrom}
            to={dateTo}
            onFromChange={(v) => setDateFrom(dateTo && v > dateTo ? dateTo : v)}
            onToChange={(v) => setDateTo(dateFrom && v < dateFrom ? dateFrom : v)}
          />
          <div className="relative">
            <button type="button" disabled={loading} onClick={() => setDlOpen((v) => !v)}
              className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-separator-border bg-background-primary-default px-5 text-body-medium text-text-primary shadow-sm transition duration-300 hover:border-border-button-default hover:shadow-md disabled:pointer-events-none disabled:opacity-40">
              <Download className="h-3.5 w-3.5 text-text-secondary" />
              Download Excel
              <ChevronDown className="h-3 w-3 text-text-tertiary" />
            </button>
            {dlOpen && (
              <div className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-separator-border bg-background-primary-default shadow-lg">
                <button type="button"
                  onClick={() => { setDlOpen(false); downloadExcel(buildExcelRows(trips, sheets), `${truck.registrationNumber}_trips_${dateFrom}_to_${dateTo}.xlsx`); }}
                  className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-fill-2 transition-colors">
                  <span className="text-caption-1-semibold text-text-primary">Selected Timeline</span>
                  <span className="text-[10px] text-text-tertiary">{dateFrom} → {dateTo}</span>
                </button>
                <div className="h-px bg-fill-2" />
                <button type="button"
                  onClick={() => { setDlOpen(false); downloadExcel(buildExcelRows(allTrips, sheets), `${truck.registrationNumber}_full_trip_report.xlsx`); }}
                  className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-fill-2 transition-colors">
                  <span className="text-caption-1-semibold text-text-primary">Full Report</span>
                  <span className="text-[10px] text-text-tertiary">All {allTrips.length} trips for this truck</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2.5 text-text-tertiary">
              <Loader2 className="h-5 w-5 animate-spin text-accent-text" />
              <span className="text-sm">Loading trip history…</span>
            </div>
          ) : trips.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-fill-2">
                <History className="h-7 w-7 text-text-tertiary" />
              </div>
              <p className="text-body-semibold text-text-secondary">No trips in this date range</p>
              <p className="text-xs text-text-tertiary">Try expanding the date range above</p>
            </div>
          ) : (
            <table className="w-full min-w-[960px] text-left">
              <thead className="sticky top-0 z-10 border-b border-separator-border bg-fill-1">
                <tr>
                  {["#", "Trip ID", "Date", "Category", "Route", "Cargo", "Status", "KM", "Hire Amount"].map((col) => (
                    <th key={col} className="px-4 py-3 text-caption-1-semibold text-text-tertiary whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-separator-border">
                {trips.map((trip, idx) => {
                  const sheet = sheets.get(trip.id);
                  const km   = sheet?.totalKm   ? Number(sheet.totalKm)   : null;
                  const hire = sheet?.hireAmount ? Number(sheet.hireAmount) : null;
                  return (
                    <tr key={trip.id} className="hover:bg-fill-2 transition-colors">
                      <td className="px-4 py-3 text-sm text-text-tertiary tabular-nums select-none">{idx + 1}</td>
                      <td className="px-4 py-3 text-body-medium text-accent-text">{trip.tripId}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary whitespace-nowrap">{fmt(trip.bookingCreatedDate)}</td>
                      <td className="px-4 py-3">
                        {trip.tripCategory
                          ? <span className={`inline-flex rounded-full px-2.5 py-0.5 text-caption-1-medium ${CAT_COLOR[trip.tripCategory] ?? "bg-fill-2 text-text-secondary"}`}>{trip.tripCategory}</span>
                          : <span className="text-text-tertiary text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {trip.origin || trip.destination ? (
                          <div className="flex items-center gap-1 text-sm text-text-secondary">
                            <span className="max-w-[100px] truncate">{trip.origin || "—"}</span>
                            <ArrowRight className="h-3 w-3 text-text-tertiary shrink-0" />
                            <span className="max-w-[100px] truncate">{trip.destination || "—"}</span>
                          </div>
                        ) : <span className="text-text-tertiary text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {trip.cargoClassification
                          ? <span className="inline-flex rounded px-2 py-0.5 text-caption-1-medium bg-fill-2 text-text-secondary">{trip.cargoClassification}</span>
                          : <span className="text-text-tertiary text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-caption-1-medium ${STATUS_COLOR[trip.status] ?? "bg-fill-2 text-text-secondary"}`}>
                          {trip.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-primary tabular-nums whitespace-nowrap">
                        {km != null ? `${km.toLocaleString("en-IN")} km` : <span className="text-text-tertiary">—</span>}
                      </td>
                      <td className="px-4 py-3 text-body-medium text-success-text tabular-nums whitespace-nowrap">
                        {hire != null ? `₹${hire.toLocaleString("en-IN", { minimumFractionDigits: 0 })}` : <span className="text-text-tertiary font-normal">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {(totalKmSum > 0 || totalHireSum > 0) && (
                <tfoot>
                  <tr className="border-t border-separator-border bg-fill-1">
                    <td colSpan={7} className="px-4 py-3 text-sm text-text-secondary">
                      Total · {trips.length} trip{trips.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3 text-body-medium text-text-primary tabular-nums whitespace-nowrap">
                      {totalKmSum > 0 ? `${totalKmSum.toLocaleString("en-IN")} km` : "—"}
                    </td>
                    <td className="px-4 py-3 text-body-medium text-success-text tabular-nums whitespace-nowrap">
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

// Uses the app's shared getComplianceStatus (same function driving the
// Dashboard's compliance alerts, ComplianceOverviewCard, and
// useComplianceAlerts) instead of a locally re-implemented flat 30-day
// threshold — otherwise the same truck/document could show "Valid" here
// while the Dashboard flags it "Expiring Soon"/"Expired".
function ExpiryBadge({ date, field }: { date: string; field: ComplianceField }) {
  const label = date
    ? new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "Not Set";
  const status = getComplianceStatus(date, field);
  const cls =
    status === "Expired"        ? "bg-danger-surface text-danger-text border-danger-border" :
    status === "Expiring Soon"  ? "bg-warning-surface text-warning-text border-warning-border" :
                                   "bg-success-surface text-success-text border-success-border";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-caption-1-semibold ${cls}`}>
      {label}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption-2-semibold text-text-tertiary">{label}</span>
      <span className="text-body-semibold text-text-primary">{value || "—"}</span>
    </div>
  );
}

type TruckDetailsDialogProps = { truck: Truck; onClose: () => void };

function TruckDetailsDialog({ truck, onClose }: TruckDetailsDialogProps) {
  const regFormatted = truck.registrationNumber.replace(
    /^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{1,4})$/, "$1 $2 $3 $4"
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 p-4">
      <div className="flex h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-background-primary-default shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-separator-border bg-accent-solid px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-on-solid/20 text-on-solid">
              <TruckIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-headline-semibold text-on-solid">{regFormatted}</h2>
              <p className="text-xs text-on-solid/80">{truck.manufacturer} · {truck.truckType}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-on-solid/10 text-on-solid transition-colors hover:bg-on-solid/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Basic Info */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-caption-1-semibold text-text-secondary">
              <Wrench className="h-3.5 w-3.5" /> Basic Information
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-separator-border bg-fill-1 p-4 sm:grid-cols-3">
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
            <div className="mb-3 flex items-center gap-2 text-caption-1-semibold text-text-secondary">
              <ShieldCheck className="h-3.5 w-3.5" /> Compliance & Document Expiry
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { label: "FC (Fitness Certificate)",       date: truck.fcExpiryDate,            field: "fc" as ComplianceField },
                { label: "Insurance",                      date: truck.insuranceExpiryDate,      field: "insurance" as ComplianceField },
                { label: "National Permit",                date: truck.nationalPermitDate,       field: "nationalPermit" as ComplianceField },
                { label: "Local Permit",                   date: truck.localPermitDate,          field: "localPermit" as ComplianceField },
                { label: "Road Tax",                       date: truck.roadTaxDate,              field: "roadTax" as ComplianceField },
                { label: "Pollution Certificate (PUC)",    date: truck.pollutionCertificateDate, field: "pollution" as ComplianceField },
                { label: "RC Validity",                    date: truck.rcValidityDate,           field: "rc" as ComplianceField },
              ].map(({ label, date, field }) => (
                <div key={label} className="flex items-center justify-between rounded-lg border border-separator-border bg-background-primary-default px-4 py-2.5">
                  <span className="text-caption-1-semibold text-text-secondary">{label}</span>
                  <ExpiryBadge date={date} field={field} />
                </div>
              ))}
            </div>
          </section>

          {/* Permit Numbers */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-caption-1-semibold text-text-secondary">
              <Gauge className="h-3.5 w-3.5" /> Permit & Certificate Numbers
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-separator-border bg-fill-1 p-4 sm:grid-cols-3">
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
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [trucks, setTrucks]           = useState<Truck[]>([]);
  const [loading, setLoading]         = useState(true);
  const [historyTruck, setHistoryTruck]   = useState<Truck | null>(null);
  const [detailsTruck, setDetailsTruck]   = useState<Truck | null>(null);
  const [refreshKey, setRefreshKey]   = useState(0);

  useEffect(() => {
    trucksApi.list().then(setTrucks).catch(() => {
      showError("Couldn't load the fleet list — showing last known trucks, not necessarily all of them.");
    }).finally(() => setLoading(false));
  }, [refreshKey]);
  // A truck added, edited, archived, or restored elsewhere previously left this
  // list stale until a manual reload.
  useWebSocketEvent("truck_updated", () => setRefreshKey((k) => k + 1));

  if (loading) return <PageSkeleton hasButton={false} hasSearch={false} columns={1} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <TruckIcon className="h-5 w-5" />
          </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">Fleet Summary</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            {trucks.length} truck{trucks.length !== 1 ? "s" : ""} in fleet
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {trucks.length === 0 && (
          <EmptyState size="compact" illustration="logistics" title="No trucks found" />
        )}

        {trucks.map((truck) => (
          <div
            key={truck.id}
            className="flex items-center gap-0 overflow-hidden rounded-xl border border-separator-border bg-background-primary-default shadow-sm transition-shadow hover:shadow-md"
          >
            {/* Left accent bar */}
            <div className="w-1.5 self-stretch shrink-0 bg-accent-solid" />

            {/* Icon block */}
            <div className="flex h-full shrink-0 items-center justify-center bg-accent-surface px-5 py-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-solid text-on-solid shadow-sm">
                <TruckIcon className="h-5 w-5" />
              </div>
            </div>

            {/* Reg number */}
            <div className="flex shrink-0 flex-col justify-center border-r border-separator-border px-6 py-4">
              <span className="text-[9px] font-semibold text-text-tertiary">Registration No.</span>
              <span className="mt-0.5 text-headline-semibold text-text-primary">
                {truck.registrationNumber.replace(/^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{1,4})$/, "$1 $2 $3 $4")}
              </span>
            </div>

            {/* Fields */}
            <div className="flex flex-1 flex-wrap items-center gap-2 px-5 py-4">
              <Pill label="Manufacturer" value={truck.manufacturer}  color="bg-fill-2 text-text-primary" />
              <Pill label="Type"         value={truck.truckType}     color="bg-success-surface text-success-text-strong" />
              <Pill label="Tyre Layout"  value={truck.tyreLayout}    color="bg-warning-surface text-warning-text-strong" />
            </div>

            {/* Action buttons */}
            <div className="flex shrink-0 items-center gap-2 border-l border-separator-border px-5 py-4">
              {isAdmin && (
<button
                type="button"
                onClick={() => setHistoryTruck(truck)}
                className="flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-separator-border bg-background-primary-default px-4 text-caption-1-semibold text-text-primary shadow-sm transition duration-300 hover:border-border-button-default hover:shadow-md"
              >
                <History className="h-3.5 w-3.5" />
                Trip History
              </button>
)}
              <button
                type="button"
                onClick={() => setDetailsTruck(truck)}
                className="flex h-9 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-4 text-caption-1-semibold text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md"
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
