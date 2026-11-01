"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleDot, Eye, Loader2, Paperclip, Wrench } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { FileViewer } from "@/components/ui/FileViewer";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { MaintenanceProofsDialog } from "@/components/maintenance/MaintenanceProofsDialog";
import { tyreApi, vendorsApi } from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { useAuth } from "@/context/AuthContext";
import type { Vendor } from "@/types/vendor";
import type { MaintenanceRecord } from "@/types/truck-maintenance";
import type { VendorRetread } from "@/types/tyre-inventory";

type Props = {
  open: boolean;
  vendor: Vendor | null;
  onClose: () => void;
};

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Our Vendors → View Record: every maintenance job a vendor did (Maintenance
 * By → Vendor) and every tyre they retreaded (Retread Queue → Move to
 * Inventory → Vendor). Read-only — edited from Truck Maintenance / the tyre.
 */
export function VendorRecordsDialog({ open, vendor, onClose }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [proofsRecord, setProofsRecord] = useState<MaintenanceRecord | null>(null);
  const [tab, setTab] = useState<"jobs" | "retreads">("jobs");
  const [retreads, setRetreads] = useState<VendorRetread[]>([]);
  const [viewingRetread, setViewingRetread] = useState<VendorRetread | null>(null);

  useEffect(() => {
    if (open) {
      setFromDate("");
      setToDate("");
      setTab("jobs");
    }
  }, [open, vendor?.id]);

  useEffect(() => {
    if (!open || !vendor) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      vendorsApi.maintenanceRecords(vendor.id, fromDate || undefined, toDate || undefined).catch(() => [] as MaintenanceRecord[]),
      vendorsApi.retreads(vendor.id, fromDate || undefined, toDate || undefined).catch(() => [] as VendorRetread[]),
    ])
      .then(([rows, rts]) => { if (!cancelled) { setRecords(rows); setRetreads(rts); } })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, vendor, fromDate, toDate]);

  const stats = useMemo(() => {
    const jobsTotal = records.reduce((sum, r) => sum + (parseFloat(r.cost) || 0), 0);
    const retreadTotal = retreads.reduce((sum, r) => sum + (r.retreadCost || 0), 0);
    const trucks = new Set(records.map((r) => r.truckId)).size;
    const lastRetread = retreads[0]?.date?.slice(0, 10) ?? null;
    const lastJob = records[0]?.date ?? null;
    const last = [lastJob, lastRetread].filter(Boolean).sort().pop() ?? null;
    return { jobs: records.length, retreads: retreads.length, jobsTotal, retreadTotal, total: jobsTotal + retreadTotal, trucks, last };
  }, [records, retreads]);

  if (!vendor) return null;

  return (
    <>
      <Dialog open={open} onClose={onClose} title={`Records — ${vendor.name}`} className="max-w-5xl">
        <div className="flex flex-col gap-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Jobs done", value: stats.jobs.toLocaleString("en-IN"), sub: money(stats.jobsTotal) },
              { label: "Tyres retreaded", value: stats.retreads.toLocaleString("en-IN"), sub: money(stats.retreadTotal) },
              { label: "Total paid", value: money(stats.total), sub: "jobs + retreads" },
              { label: "Trucks serviced", value: stats.trucks.toLocaleString("en-IN") },
              { label: "Last job / retread", value: stats.last ? formatDate(stats.last) : "—" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs font-medium text-gray-500">{c.label}</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{c.value}</p>
                {c.sub && <p className="text-[11px] tabular-nums text-gray-400">{c.sub}</p>}
              </div>
            ))}
          </div>

          {/* Maintenance Jobs | Tyre Retreads */}
          <div role="tablist" className="flex w-fit gap-0.5 rounded-full border border-gray-200 bg-gray-100 p-0.5 shadow-inner">
            {([["jobs", `Maintenance Jobs (${stats.jobs})`], ["retreads", `Tyre Retreads (${stats.retreads})`]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  tab === k ? "bg-brand-navy text-white shadow" : "text-gray-500 hover:bg-white/70 hover:text-gray-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {tab === "jobs"
                ? `${records.length} ${records.length === 1 ? "record" : "records"}`
                : `${retreads.length} ${retreads.length === 1 ? "retread" : "retreads"}`}
              {vendor.category ? ` · ${vendor.category}` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <DateRangePill from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
              <DownloadExcelButton
                path={tab === "jobs" ? "/exports/maintenance-records" : "/exports/vendor-retreads"}
                filename={tab === "jobs" ? "vendor_maintenance_records.xlsx" : "vendor_retreads.xlsx"}
                title={tab === "jobs" ? `Maintenance Records — ${vendor.name}` : `Tyre Retreads — ${vendor.name}`}
                params={{
                  vendor_id: vendor.id,
                  ...(fromDate ? { from_date: fromDate } : {}),
                  ...(toDate ? { to_date: toDate } : {}),
                }}
              />
            </div>
          </div>

          {/* Table */}
          {tab === "retreads" ? (
            loading && retreads.length === 0 ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : retreads.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                  <CircleDot className="h-5 w-5 text-gray-400" />
                </div>
                <p className="text-sm font-semibold text-gray-600">No tyre retreads</p>
                <p className="mt-1 text-xs text-gray-400">
                  Retreads show up here when a tyre is moved back from the Retread Queue with Rethreading Done by → Vendor → {vendor.name}.
                </p>
              </div>
            ) : (
              <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[800px] whitespace-nowrap text-left text-xs">
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                    <tr>
                      {["Date", "Tyre", "Size / Type", "Retread #", "Range", "Invoice No.", "Invoice Date", "Retread Cost", "Proof of Payment"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {retreads.map((r) => (
                      <tr key={r.id} className="bg-white transition-colors hover:bg-slate-50">
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">{formatDate(r.date.slice(0, 10))}</td>
                        <td className="px-4 py-2.5">
                          <span className="block font-medium text-slate-800">{r.tyreNumber || "—"}</span>
                          {r.brand && <span className="block text-[11px] text-slate-400">{r.brand}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{[r.tyreSize, r.tyreType].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.retreadCount ?? "—"}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.expectedRange ? `${r.expectedRange.toLocaleString("en-IN")} km` : "—"}</td>
                        <td className="px-4 py-2.5 text-slate-500">{r.invoiceNumber || <span className="italic text-slate-400">—</span>}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.invoiceDate ? formatDate(r.invoiceDate) : <span className="italic text-slate-400">—</span>}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold text-blue-700">{money(r.retreadCost)}</td>
                        <td className="px-4 py-2.5">
                          {r.proofFileName ? (
                            <button
                              type="button"
                              onClick={() => setViewingRetread(r)}
                              title={r.proofFileName}
                              className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                            >
                              <Eye className="h-3 w-3" /> View
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
            )
          ) : loading && records.length === 0 ? (
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

      <FileViewer
        open={viewingRetread !== null}
        onClose={() => setViewingRetread(null)}
        url={viewingRetread ? `retread-proof:${viewingRetread.tyreId}:${viewingRetread.id}:${viewingRetread.proofSizeBytes ?? ""}` : ""}
        title={viewingRetread?.proofFileName ?? "Proof of Payment/Invoice"}
        filename={viewingRetread?.proofFileName ?? undefined}
        load={() => tyreApi.fetchRetreadProofBlob(viewingRetread!.tyreId, viewingRetread!.id)}
      />

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
