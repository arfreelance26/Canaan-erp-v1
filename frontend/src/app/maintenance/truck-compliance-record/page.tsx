"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RiSearchLine as Search, RiShieldCheckLine as ShieldCheck, RiShieldFlashLine as ShieldAlert, RiShieldCrossLine as ShieldX, RiArrowDownSLine as ChevronDown, RiTruckLine as TruckIcon, RiFileShield2Line as FileCheck2, RiFileUploadLine as FileUpload } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { trucksApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { getComplianceStatus, isMissingCost, NO_COST_TAG, type ComplianceField, type ComplianceStatus } from "@/lib/compliance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { formatDate } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
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
  Valid: "bg-success-surface-strong text-success-text",
  "Expiring Soon": "bg-warning-surface-strong text-warning-text",
  Expired: "bg-danger-surface-strong text-danger-text",
  "Not Uploaded": "bg-fill-2 text-text-secondary",
};
// Worst first: a real expiry outranks a document that was never entered.
const STATUS_RANK: Record<ComplianceStatus, number> = { Expired: 3, "Expiring Soon": 2, "Not Uploaded": 1, Valid: 0 };
const STATUS_ICON: Record<ComplianceStatus, typeof ShieldCheck> = { Valid: ShieldCheck, "Expiring Soon": ShieldAlert, Expired: ShieldX, "Not Uploaded": FileUpload };

function DetailChip({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-caption-2-semibold text-text-tertiary">{label}</span>
      <span className={`truncate text-body-medium text-text-primary ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof TruckIcon; label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-separator-border bg-background-primary-default px-4 py-3.5 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-caption-2-semibold text-text-tertiary">{label}</p>
        <p className="truncate text-title-3-semibold leading-tight text-text-primary"><AnimatedNumber value={value} /></p>
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
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
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
    const counts: Record<ComplianceStatus, number> = { Valid: 0, "Expiring Soon": 0, Expired: 0, "Not Uploaded": 0 };
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
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-success-border bg-success-surface text-success-text shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Truck Compliance Record</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Read-only audit view of RC, FC, Road Tax, National &amp; Local Permit, Pollution Certificate, and Insurance across the fleet
            </p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={ShieldCheck} label="Valid" value={String(summary.Valid)} accent="bg-success-surface text-success-text" />
        <StatCard icon={ShieldAlert} label="Expiring Soon" value={String(summary["Expiring Soon"])} accent="bg-warning-surface text-warning-text" />
        <StatCard icon={ShieldX} label="Expired" value={String(summary.Expired)} accent="bg-danger-surface text-danger-text" />
        <StatCard icon={FileUpload} label="Not Uploaded" value={String(summary["Not Uploaded"])} accent="bg-fill-2 text-text-secondary" />
      </div>

      {/* Filters */}
      {/* Minimal pill controls — each one lifts/enlarges slightly on hover */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search: collapsed icon pill that expands on hover / focus / when it holds text */}
        <label
          className={`group flex h-10 cursor-text items-center gap-2 overflow-hidden rounded-full border border-separator-border bg-background-primary-default px-3 shadow-sm transition duration-300 hover:shadow-md focus-within:scale-105 focus-within:border-accent-border-strong focus-within:shadow-md ${
            search ? "w-72" : "w-10 hover:w-72 focus-within:w-72"
          }`}
        >
          <Search className="h-4 w-4 shrink-0 text-text-secondary" />
          <input
            type="text"
            placeholder="Search by truck, manufacturer, model…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-w-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-placeholder"
          />
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          {/* The Compliance & Renewals report (finance_report.py) — a sheet per document. */}
          <ReportViewButton
            path="/exports/resource-report"
            filename="Compliance_and_Renewals.xlsx"
            title={`Compliance & Renewals Report — renewals ${exportFrom || exportTo ? `${exportFrom ? exportFrom.split("-").reverse().join("-") : "start"} to ${exportTo ? exportTo.split("-").reverse().join("-") : "today"}` : "all time"}${search.trim() ? ` — "${search.trim()}"` : ""}`}
            params={{ kind: "compliance", ...(exportFrom ? { from_date: exportFrom } : {}), ...(exportTo ? { to_date: exportTo } : {}), ...(search.trim() ? { search: search.trim() } : {}) }}
            pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
          />
        </div>
      </div>

      {/* Truck cards */}
      {visibleTrucks.length === 0 ? (
        <EmptyState size="compact" illustration="not-found" title={trucks.length === 0 ? "No trucks yet" : "No trucks match this search"} className="rounded-xl border border-separator-border bg-background-primary-default" />
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
            const missingCount = docStatuses.filter((d) => d.status === "Not Uploaded").length;
            const noCostCount = DOC_SPECS.filter((spec) => isMissingCost(spec.date(truck), spec.cost(truck))).length;
            const WorstIcon = STATUS_ICON[worst];

            return (
              <div
                key={truck.id}
                className={`overflow-hidden rounded-xl border bg-background-primary-default shadow-sm transition ${
                  isOpen ? "border-accent-border ring-1 ring-accent-border " : "border-separator-border hover:border-accent-border "
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(truck.id)}
                  className="flex w-full items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-fill-2"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-surface text-accent-text">
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
                    {(expiredCount > 0 || expiringCount > 0 || missingCount > 0 || noCostCount > 0) && (
                      <div className="hidden flex-col items-end gap-0.5 sm:flex">
                        {expiredCount > 0 && <span className="text-caption-2-medium text-danger-text">{expiredCount} expired</span>}
                        {expiringCount > 0 && <span className="text-caption-2-medium text-warning-text">{expiringCount} expiring soon</span>}
                        {missingCount > 0 && <span className="text-caption-2-medium text-text-tertiary">{missingCount} not uploaded</span>}
                        {noCostCount > 0 && <span className="text-caption-2-medium text-accent-text">{noCostCount} no cost</span>}
                      </div>
                    )}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption-1-semibold ${STATUS_BADGE[worst]}`}>
                      <WorstIcon className="h-3 w-3" />
                      {worst}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="overflow-x-auto border-t border-separator-border bg-fill-1 px-3 pb-3 pt-1">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead>
                        <tr className="text-left text-caption-2-semibold text-text-tertiary">
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
                              className={`rounded-lg transition-colors hover:bg-accent-surface-strong/50 ${i % 2 === 1 ? "bg-background-primary-default " : "bg-background-primary-default "}`}
                            >
                              <td className="rounded-l-lg px-3 py-2.5 flex items-center gap-2">
                                <FileCheck2 className="h-3.5 w-3.5 text-text-tertiary" />
                                <span className="font-medium text-text-primary">{spec.label}</span>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs text-text-secondary">{spec.number ? spec.number(truck) || "—" : "—"}</td>
                              <td className="px-3 py-2.5 text-text-secondary">{date ? formatDate(date) : "—"}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">
                                {isMissingCost(date, spec.cost(truck)) ? (
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-caption-2-semibold ${NO_COST_TAG}`}>No Cost</span>
                                ) : fmtCur(spec.cost(truck))}
                              </td>
                              <td className="rounded-r-lg px-3 py-2.5">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold ${STATUS_BADGE[status]}`}>
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
