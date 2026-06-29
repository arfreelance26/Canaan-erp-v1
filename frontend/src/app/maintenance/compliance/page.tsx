"use client";

import { useEffect, useMemo, useState } from "react";
import { ComplianceTable } from "@/components/fleet/ComplianceTable";
import { UpdateDocumentDialog } from "@/components/fleet/UpdateDocumentDialog";
import { getComplianceStatus } from "@/lib/compliance";
import { trucksApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

export default function CompliancePage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [updateOpen, setUpdateOpen] = useState(false);

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

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance &amp; Renewals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track RC, FC, Road Tax, National Permit, Local Permit, Pollution Certificate, and Insurance validity across the fleet
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUpdateOpen(true)}
          className="btn-interactive shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95"
        >
          Update Document
        </button>
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

      <ComplianceTable trucks={trucks} />

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
