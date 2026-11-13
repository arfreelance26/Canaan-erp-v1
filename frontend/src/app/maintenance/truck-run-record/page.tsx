"use client";

import { inDateRange } from "@/lib/format-date";
import { useEffect, useState } from "react";
import { RiTruckLine as TruckIcon, RiFileTextLine as FileText, RiBarChartBoxLine as BarChart3, RiPulseLine as Activity } from "@remixicon/react";
import { trucksApi, tripsApi } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const TruckRunRecordDialog = dynamic(() => import("@/components/maintenance/TruckRunRecordDialog").then((m) => m.TruckRunRecordDialog));
const TruckBreakdownDialog = dynamic(() => import("@/components/maintenance/TruckBreakdownDialog").then((m) => m.TruckBreakdownDialog));
function DetailChip({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-caption-2-semibold text-text-tertiary">{label}</span>
      <span className={`truncate text-body-medium text-text-primary ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

export default function TruckRunRecordPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [exportTo, setExportTo] = useState("");
  const [viewingRecordTruck, setViewingRecordTruck] = useState<Truck | null>(null);
  const [viewingBreakdownTruck, setViewingBreakdownTruck] = useState<Truck | null>(null);

  useEffect(() => {
    trucksApi.list().then(setTrucks).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // The trips are only needed to work out which trucks ran in the date range.
  const hasRange = Boolean(exportFrom || exportTo);
  useEffect(() => {
    if (!hasRange) return;
    tripsApi.list().then(setTrips).catch(() => {});
  }, [hasRange]);

  function handleViewRecord(truck: Truck) {
    setViewingRecordTruck(truck);
  }

  function handleViewBreakdown(truck: Truck) {
    setViewingBreakdownTruck(truck);
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={1} />;

  const q = searchQuery.trim().toLowerCase();
  const datedVehicleIds = hasRange && trips
    ? new Set(trips.filter((t) => inDateRange(t.assignedDate, exportFrom, exportTo)).map((t) => t.vehicleId))
    : null;
  const filteredTrucks = trucks.filter(
    (t) =>
      (!datedVehicleIds || datedVehicleIds.has(t.truckId)) &&
      (!q || t.registrationNumber?.toLowerCase().includes(q) || t.truckId?.toLowerCase().includes(q))
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-success-border bg-success-surface text-success-text shadow-sm">
          <Activity className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-title-1-semibold tracking-tight text-text-primary">Truck Run Record</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Track actual truck run distance and history
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trucks..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          {/* The Truck Run Record report (record_reports.py) — each truck's km, month by month. */}
          <ReportViewButton
            path="/exports/resource-report"
            filename="Truck_Run_Record.xlsx"
            title={`Truck Run Record Report — ${exportFrom || exportTo ? `${exportFrom ? exportFrom.split("-").reverse().join("-") : "start"} to ${exportTo ? exportTo.split("-").reverse().join("-") : "today"}` : "all time"}${searchQuery.trim() ? ` — "${searchQuery.trim()}"` : ""}`}
            params={{ kind: "runrecord", ...(exportFrom ? { from_date: exportFrom } : {}), ...(exportTo ? { to_date: exportTo } : {}), ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}) }}
            pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
          />
        </div>
      </div>

      {filteredTrucks.length === 0 ? (
        <EmptyState size="compact" illustration="not-found" title={trucks.length === 0 ? "No trucks yet" : "No trucks match these filters"} className="rounded-xl border border-separator-border bg-background-primary-default" />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredTrucks.map((truck) => (
            <div
              key={truck.id}
              className="flex items-center gap-5 rounded-xl border border-separator-border bg-background-primary-default px-5 py-4 shadow-sm transition hover:border-accent-border"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-surface text-accent-text">
                <TruckIcon className="h-5 w-5" />
              </span>
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-6">
                <DetailChip label="Reg No" value={truck.registrationNumber} mono />
                <DetailChip label="Truck ID" value={truck.truckId} mono />
                <DetailChip label="Manufacturer" value={truck.manufacturer} />
                <DetailChip label="Model" value={truck.modelName} />
                <DetailChip label="Truck Type" value={truck.truckType} />
                <DetailChip label="Branch" value={truck.branchRegisteredTo} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleViewRecord(truck)}
                  className="flex items-center gap-1.5 rounded-lg border border-accent-border bg-accent-surface px-3 py-1.5 text-caption-1-semibold text-accent-text hover:bg-accent-surface-strong"
                >
                  <FileText className="h-3.5 w-3.5" />
                  View Record
                </button>
                <button
                  type="button"
                  onClick={() => handleViewBreakdown(truck)}
                  className="flex items-center gap-1.5 rounded-lg border border-purple-border bg-purple-surface px-3 py-1.5 text-caption-1-semibold text-purple-text hover:bg-purple-surface-strong"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  View Breakdown
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TruckRunRecordDialog
        open={viewingRecordTruck !== null}
        onClose={() => setViewingRecordTruck(null)}
        truck={viewingRecordTruck}
      />

      <TruckBreakdownDialog
        open={viewingBreakdownTruck !== null}
        onClose={() => setViewingBreakdownTruck(null)}
        truck={viewingBreakdownTruck}
      />
    </div>
  );
}
