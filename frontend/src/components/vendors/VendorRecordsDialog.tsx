"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Paperclip, Wrench } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { MaintenanceProofsDialog } from "@/components/maintenance/MaintenanceProofsDialog";
import { vendorsApi } from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { useAuth } from "@/context/AuthContext";
import type { Vendor } from "@/types/vendor";
import type { MaintenanceRecord } from "@/types/truck-maintenance";

type Props = {
  open: boolean;
  vendor: Vendor | null;
  onClose: () => void;
};

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Our Vendors → View Record: every maintenance job a vendor did, from records
 * saved with Maintenance By → Vendor. Read-only — records are edited/deleted
 * from Truck Maintenance.
 */
export function VendorRecordsDialog({ open, vendor, onClose }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [proofsRecord, setProofsRecord] = useState<MaintenanceRecord | null>(null);

  useEffect(() => {
    if (open) {
      setFromDate("");
      setToDate("");
    }
  }, [open, vendor?.id]);

  useEffect(() => {
    if (!open || !vendor) return;
    let cancelled = false;
    setLoading(true);
    vendorsApi
      .maintenanceRecords(vendor.id, fromDate || undefined, toDate || undefined)
      .then((rows) => !cancelled && setRecords(rows))
      .catch(() => !cancelled && setRecords([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, vendor, fromDate, toDate]);

  const stats = useMemo(() => {
    const total = records.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);
    const trucks = new Set(records.map((r) => r.truckId)).size;
    return { jobs: records.length, total, trucks, last: records[0]?.date ?? null };
  }, [records]);

  if (!vendor) return null;

  return (
    <>
      <Dialog open={open} onClose={onClose} title={`Maintenance Records — ${vendor.name}`} className="max-w-5xl">
        <div className="flex flex-col gap-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Jobs done", value: stats.jobs.toLocaleString("en-IN") },
              { label: "Total paid", value: money(stats.total) },
              { label: "Trucks serviced", value: stats.trucks.toLocaleString("en-IN") },
              { label: "Last job", value: stats.last ? formatDate(stats.last) : "—" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs font-medium text-gray-500">{c.label}</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {records.length} {records.length === 1 ? "record" : "records"}
              {vendor.category ? ` · ${vendor.category}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <DateRangePill from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
              <DownloadExcelButton
                path="/exports/maintenance-records"
                filename="vendor_maintenance_records.xlsx"
                title={`Maintenance Records — ${vendor.name}`}
                params={{
                  vendor_id: vendor.id,
                  ...(fromDate ? { from_date: fromDate } : {}),
                  ...(toDate ? { to_date: toDate } : {}),
                }}
              />
            </div>
          </div>

          {/* Table */}
          {loading && records.length === 0 ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : records.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                <Wrench className="h-5 w-5 text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600">No maintenance records</p>
              <p className="mt-1 text-xs text-gray-400">
                Jobs show up here when a maintenance record is saved with Maintenance By → Vendor → {vendor.name}.
              </p>
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[800px] whitespace-nowrap text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                  <tr>
                    {["Start Date", "Truck", "Maintenance Type", "Repair Type", "Invoice No.", "Invoice Date", "Location", "Remarks", "Cost", "Proof of Payment"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <tr key={r.id} className="bg-white transition-colors hover:bg-slate-50">
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">{formatDate(r.date)}</td>
                      <td className="px-4 py-2.5">
                        <span className="block font-medium text-slate-800">{r.truckRegistration || "—"}</span>
                        {r.truckCode && <span className="block text-[11px] text-slate-400">{r.truckCode}</span>}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.maintenanceType}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.repairType || <span className="italic text-slate-400">—</span>}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.invoiceNumber || <span className="italic text-slate-400">—</span>}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.invoiceDate ? formatDate(r.invoiceDate) : <span className="italic text-slate-400">—</span>}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.maintenanceLocation || <span className="italic text-slate-400">—</span>}</td>
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-slate-500" title={r.description}>
                        {r.description || <span className="italic text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-blue-700">{money(parseFloat(r.cost) || 0)}</td>
                      <td className="px-4 py-2.5">
                        {(r.proofCount ?? 0) > 0 ? (
                          <button
                            type="button"
                            onClick={() => setProofsRecord(r)}
                            className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                          >
                            <Paperclip className="h-3 w-3" />
                            {r.proofCount} file{r.proofCount === 1 ? "" : "s"}
                          </button>
                        ) : (
                          <span className="italic text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Dialog>

      <MaintenanceProofsDialog
        open={proofsRecord !== null}
        recordId={proofsRecord?.id ?? null}
        subtitle={proofsRecord ? `${proofsRecord.maintenanceType} · ${proofsRecord.truckRegistration ?? ""} · ${formatDate(proofsRecord.date)}` : undefined}
        canDelete={isAdmin}
        onClose={() => setProofsRecord(null)}
        onCountChange={(n) => proofsRecord && setRecords((prev) => prev.map((x) => (x.id === proofsRecord.id ? { ...x, proofCount: n } : x)))}
      />
    </>
  );
}
