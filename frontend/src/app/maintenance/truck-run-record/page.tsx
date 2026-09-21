"use client";

import { useEffect, useState } from "react";
import { Truck as TruckIcon, FileText, BarChart3 } from "lucide-react";
import { trucksApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { TruckRunRecordDialog } from "@/components/maintenance/TruckRunRecordDialog";
import { TruckBreakdownDialog } from "@/components/maintenance/TruckBreakdownDialog";

function DetailChip({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <span className={`truncate text-sm font-medium text-gray-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

export default function TruckRunRecordPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [viewingRecordTruck, setViewingRecordTruck] = useState<Truck | null>(null);
  const [viewingBreakdownTruck, setViewingBreakdownTruck] = useState<Truck | null>(null);

  useEffect(() => {
    trucksApi.list().then(setTrucks).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function handleViewRecord(truck: Truck) {
    setViewingRecordTruck(truck);
  }

  function handleViewBreakdown(truck: Truck) {
    setViewingBreakdownTruck(truck);
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={1} />;

  const q = searchQuery.trim().toLowerCase();
  const filteredTrucks = trucks.filter(
    (t) => !q || t.registrationNumber?.toLowerCase().includes(q) || t.truckId?.toLowerCase().includes(q)
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Truck Run Record</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track actual truck run distance and history
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search trucks..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/exports/truck-run-records"
            filename="truck_run_records.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      {filteredTrucks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/80 bg-white/40 py-16 text-center shadow-sm backdrop-blur-sm">
          <TruckIcon className="h-8 w-8 text-gray-200" />
          <p className="text-sm font-medium text-gray-500">{trucks.length === 0 ? "No trucks yet." : "No trucks match this search."}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredTrucks.map((truck) => (
            <div
              key={truck.id}
              className="flex items-center gap-5 rounded-xl border border-white/80 bg-white/60 px-5 py-4 shadow-sm backdrop-blur-sm transition-all hover:border-blue-100"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600">
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
                  className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  <FileText className="h-3.5 w-3.5" />
                  View Record
                </button>
                <button
                  type="button"
                  onClick={() => handleViewBreakdown(truck)}
                  className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"
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
