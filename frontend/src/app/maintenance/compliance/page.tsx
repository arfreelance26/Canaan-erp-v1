"use client";

import { useEffect, useMemo, useState } from "react";
import { ComplianceTable } from "@/components/fleet/ComplianceTable";
import { UpdateDocumentDialog } from "@/components/fleet/UpdateDocumentDialog";
import { getComplianceStatus } from "@/lib/compliance";
import { trucksApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Search } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

export default function CompliancePage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
        trucksApi.list().then(setTrucks).finally(() => setLoading(false));
      }, []);
      useAutoRefresh(() => {
    trucksApi.list().then(setTrucks).finally(() => setLoading(false));
      }, 5000);


  const summary = useMemo(() => {
    const counts = { Valid: 0, "Expiring Soon": 0, Expired: 0 };
    for (const truck of trucks) {
      const dates = [
        truck.rcValidityDate,
        truck.fcExpiryDate,
        truck.roadTaxDate,
        truck.nationalPermitDate,
        truck.localPermitDate,
        truck.pollutionCertificateDate,
        truck.insuranceExpiryDate,
      ];
      for (const date of dates) {
        counts[getComplianceStatus(date)] += 1;
      }
    }
    return counts;
  }, [trucks]);

  if (loading) return <PageSkeleton hasButton hasSearch statCards={3} columns={6} />;

  const filteredTrucks = trucks.filter((t) => !searchQuery || t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) || t.truckId?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance &amp; Renewals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track RC, FC, Road Tax, National Permit, Local Permit, Pollution Certificate, and Insurance validity across the fleet
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search trucks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/trucks" filename="fleet.xlsx" />
          <button
            type="button"
            onClick={() => setUpdateOpen(true)}
            className="btn-interactive shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95"
          >
            Update Document
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Valid</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{summary.Valid}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Expiring Soon</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600">{summary["Expiring Soon"]}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">Expired</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{summary.Expired}</p>
        </div>
      </div>

      <ComplianceTable trucks={filteredTrucks} />

      <UpdateDocumentDialog
        open={updateOpen}
        onClose={() => setUpdateOpen(false)}
        trucks={trucks}
        onUpdated={(updated) =>
          setTrucks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
        }
      />
    </div>
  );
}
