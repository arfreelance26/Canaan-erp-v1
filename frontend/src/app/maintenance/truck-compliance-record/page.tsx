"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ShieldCheck, ShieldAlert, ShieldX, ChevronDown, Truck as TruckIcon, FileCheck2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { trucksApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { getComplianceStatus, type ComplianceField, type ComplianceStatus } from "@/lib/compliance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { formatDate } from "@/lib/format-date";

const ALLOWED_ROLES = ["Auditor", "Admin"];

const n = (v: string | number | undefined | null) => {
  const num = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(num) ? num : 0;
};
const fmtCur = (v: string | number) =>
  `₹${n(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type DocKey = "rc" | "fc" | "roadTax" | "nationalPermit" | "localPermit" | "pollution" | "insurance";

type DocSpec = {
  key: DocKey;
  label: string;
  field: ComplianceField;
  date: (t: Truck) => string;
  number?: (t: Truck) => string;
  cost: (t: Truck) => string;
};

const DOC_SPECS: DocSpec[] = [
  { key: "rc",             label: "Registration Certificate (RC)", field: "rc",             date: (t) => t.rcValidityDate,             cost: (t) => t.rcExpenses },
  { key: "fc",              label: "Fitness Certificate (FC)",      field: "fc",             date: (t) => t.fcExpiryDate,               cost: (t) => t.fcExpenses },
  { key: "roadTax",         label: "Road Tax",                      field: "roadTax",        date: (t) => t.roadTaxDate,                number: (t) => t.roadTaxNumber,         cost: (t) => t.roadTaxExpenses },
  { key: "nationalPermit",  label: "National Permit",               field: "nationalPermit", date: (t) => t.nationalPermitDate,         number: (t) => t.nationalPermitNumber,  cost: (t) => t.nationalPermitExpenses },
  { key: "localPermit",     label: "Local Permit",                  field: "localPermit",    date: (t) => t.localPermitDate,            number: (t) => t.localPermitNumber,     cost: (t) => t.localPermitExpenses },
  { key: "pollution",       label: "Pollution Certificate (PUC)",   field: "pollution",      date: (t) => t.pollutionCertificateDate,   number: (t) => t.pollutionCertificateNumber, cost: (t) => t.pollutionCertificateExpenses },
  { key: "insurance",       label: "Insurance",                     field: "insurance",      date: (t) => t.insuranceExpiryDate,        cost: (t) => t.insuranceExpenses },
];

const STATUS_BADGE: Record<ComplianceStatus, string> = {
  Valid: "bg-emerald-100 text-emerald-700",
  "Expiring Soon": "bg-amber-100 text-amber-700",
  Expired: "bg-red-100 text-red-700",
};
const STATUS_RANK: Record<ComplianceStatus, number> = { Expired: 2, "Expiring Soon": 1, Valid: 0 };
const STATUS_ICON: Record<ComplianceStatus, typeof ShieldCheck> = { Valid: ShieldCheck, "Expiring Soon": ShieldAlert, Expired: ShieldX };

function DetailChip({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <span className={`truncate text-sm font-medium text-gray-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof TruckIcon; label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/80 bg-white/60 px-4 py-3.5 shadow-sm backdrop-blur-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="truncate text-lg font-bold leading-tight text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function TruckComplianceRecordPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = !user || ALLOWED_ROLES.includes(user.softwareDesignation);

  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.softwareDesignation)) {
      router.replace("/");
    }
  }, [user, router]);

  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAllowed) return;
    trucksApi.list().then(setTrucks).catch(() => {}).finally(() => setLoading(false));
  }, [refreshKey, isAllowed]);

  useAutoRefresh(() => setRefreshKey((k) => k + 1), 10000);
  useWebSocketEvent("truck_updated", () => setRefreshKey((k) => k + 1));

  function toggle(truckId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(truckId)) next.delete(truckId);
      else next.add(truckId);
      return next;
    });
  }

  const q = search.trim().toLowerCase();

  const visibleTrucks = useMemo(() => {
    const sorted = [...trucks].sort((a, b) => a.registrationNumber.localeCompare(b.registrationNumber));
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.registrationNumber.toLowerCase().includes(q) ||
        t.manufacturer.toLowerCase().includes(q) ||
        t.modelName.toLowerCase().includes(q)
    );
  }, [trucks, q]);

  // Overall fleet summary — every document on every truck counted once.
  const summary = useMemo(() => {
    const counts: Record<ComplianceStatus, number> = { Valid: 0, "Expiring Soon": 0, Expired: 0 };
    for (const truck of trucks) {
      for (const spec of DOC_SPECS) counts[getComplianceStatus(spec.date(truck), spec.field)] += 1;
    }
    return counts;
  }, [trucks]);

  if (!isAllowed) return null;
  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Truck Compliance Record</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Read-only audit view of RC, FC, Road Tax, National &amp; Local Permit, Pollution Certificate, and Insurance across the fleet
            </p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={ShieldCheck} label="Valid" value={String(summary.Valid)} accent="bg-emerald-50 text-emerald-600" />
        <StatCard icon={ShieldAlert} label="Expiring Soon" value={String(summary["Expiring Soon"])} accent="bg-amber-50 text-amber-600" />
        <StatCard icon={ShieldX} label="Expired" value={String(summary.Expired)} accent="bg-red-50 text-red-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/80 bg-white/40 px-4 py-3 shadow-sm backdrop-blur-sm">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by truck, manufacturer, model…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
        </div>
        <div className="ml-auto">
          <DownloadExcelButton path="/exports/trucks" filename="fleet.xlsx" />
        </div>
      </div>

      {/* Truck cards */}
      {visibleTrucks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/80 bg-white/40 py-16 text-center shadow-sm backdrop-blur-sm">
          <ShieldCheck className="h-8 w-8 text-gray-200" />
          <p className="text-sm font-medium text-gray-500">
            {trucks.length === 0 ? "No trucks yet." : "No trucks match this search."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleTrucks.map((truck) => {
            const isOpen = expanded.has(truck.id);
            const docStatuses = DOC_SPECS.map((spec) => ({ spec, status: getComplianceStatus(spec.date(truck), spec.field) }));
            const worst = docStatuses.reduce<ComplianceStatus>(
              (acc, d) => (STATUS_RANK[d.status] > STATUS_RANK[acc] ? d.status : acc),
              "Valid"
            );
            const expiredCount = docStatuses.filter((d) => d.status === "Expired").length;
            const expiringCount = docStatuses.filter((d) => d.status === "Expiring Soon").length;
            const WorstIcon = STATUS_ICON[worst];

            return (
              <div
                key={truck.id}
                className={`overflow-hidden rounded-xl border bg-white/60 shadow-sm backdrop-blur-sm transition-all ${
                  isOpen ? "border-blue-200 ring-1 ring-blue-100" : "border-white/80 hover:border-blue-100"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(truck.id)}
                  className="flex w-full items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-white/70"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600">
                    <TruckIcon className="h-5 w-5" />
                  </span>

                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5">
                    <DetailChip label="Reg No" value={truck.registrationNumber} mono />
                    <DetailChip label="Manufacturer" value={truck.manufacturer} />
                    <DetailChip label="Model" value={truck.modelName} />
                    <DetailChip label="Truck Type" value={truck.truckType} />
                    <DetailChip label="Branch" value={truck.branchRegisteredTo} />
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-4">
                    {(expiredCount > 0 || expiringCount > 0) && (
                      <div className="hidden flex-col items-end gap-0.5 sm:flex">
                        {expiredCount > 0 && <span className="text-[11px] font-medium text-red-600">{expiredCount} expired</span>}
                        {expiringCount > 0 && <span className="text-[11px] font-medium text-amber-600">{expiringCount} expiring soon</span>}
                      </div>
                    )}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[worst]}`}>
                      <WorstIcon className="h-3 w-3" />
                      {worst}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="overflow-x-auto border-t border-gray-100 bg-gradient-to-b from-gray-50/60 to-white/80 px-3 pb-3 pt-1">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                          <th className="px-3 py-2">Document</th>
                          <th className="px-3 py-2">Number</th>
                          <th className="px-3 py-2">Expiry Date</th>
                          <th className="px-3 py-2 text-right">Cost</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {docStatuses.map(({ spec, status }, i) => {
                          const StatusIcon = STATUS_ICON[status];
                          const date = spec.date(truck);
                          return (
                            <tr
                              key={spec.key}
                              className={`rounded-lg transition-colors hover:bg-blue-50/50 ${i % 2 === 1 ? "bg-white/70" : "bg-white/40"}`}
                            >
                              <td className="rounded-l-lg px-3 py-2.5 flex items-center gap-2">
                                <FileCheck2 className="h-3.5 w-3.5 text-gray-400" />
                                <span className="font-medium text-gray-900">{spec.label}</span>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{spec.number ? spec.number(truck) || "—" : "—"}</td>
                              <td className="px-3 py-2.5 text-gray-600">{date ? formatDate(date) : "—"}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmtCur(spec.cost(truck))}</td>
                              <td className="rounded-r-lg px-3 py-2.5">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[status]}`}>
                                  <StatusIcon className="h-3 w-3" />
                                  {status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
