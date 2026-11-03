"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RiSearchLine as Search, RiBankLine as Landmark, RiArrowDownSLine as ChevronDown, RiTruckLine as TruckIcon, RiFileList3Line as ClipboardList, RiMoneyRupeeCircleLine as IndianRupee, RiStackLine as Boxes } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { trucksApi, maintenanceApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import type { EmiRecord } from "@/types/finance";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { DateRangePill } from "@/components/ui/DateRangePill";
import { formatDate, todayIst, overlapsDateRange } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PagedTbody } from "@/components/ui/PagedTbody";
const ALLOWED_ROLES = ["Auditor", "Admin"];
const OTHER_ASSETS_KEY = "__other__";

const n = (v: string | number | undefined | null) => {
  const num = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(num) ? num : 0;
};
const fmtCur = (v: string | number) =>
  `₹${n(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCurCompact = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

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

export default function TruckEmiRecordPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAllowed = !user || ALLOWED_ROLES.includes(user.softwareDesignation);

  useEffect(() => {
    if (user && !ALLOWED_ROLES.includes(user.softwareDesignation)) {
      router.replace("/");
    }
  }, [user, router]);

  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [records, setRecords] = useState<EmiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAllowed) return;
    Promise.all([trucksApi.list(), maintenanceApi.listEmiRecordsReadOnly()])
      .then(([t, r]) => { setTrucks(t); setRecords(r); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey, isAllowed]);

  useAutoRefresh(() => setRefreshKey((k) => k + 1), 10000);
  useWebSocketEvent("finance_updated", () => setRefreshKey((k) => k + 1));

  const today = todayIst();

  // EMI entries carry only a free-text truck registration (not a truck id), and
  // the page can also track non-truck financed assets — so group by a
  // normalized registration match against known trucks, with anything that
  // doesn't match falling into one "Other Financed Assets" bucket.
  const truckByReg = useMemo(() => {
    const map = new Map<string, Truck>();
    for (const t of trucks) map.set(t.registrationNumber.trim().toUpperCase(), t);
    return map;
  }, [trucks]);

  const datedRecords = useMemo(
    () => records.filter((r) => overlapsDateRange(r.emiStartDate, r.emiEndDate, exportFrom, exportTo)),
    [records, exportFrom, exportTo],
  );

  const recordsByGroup = useMemo(() => {
    const map = new Map<string, EmiRecord[]>();
    for (const r of datedRecords) {
      const key = truckByReg.has((r.truckRegistration ?? "").trim().toUpperCase())
        ? (r.truckRegistration ?? "").trim().toUpperCase()
        : OTHER_ASSETS_KEY;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.emiStartDate.localeCompare(a.emiStartDate));
    return map;
  }, [datedRecords, truckByReg]);

  const totalMonthlyActive = useMemo(
    () => datedRecords.filter((r) => r.emiEndDate >= today).reduce((sum, r) => sum + n(r.emiAmount), 0),
    [datedRecords, today]
  );
  const activeCount = useMemo(() => datedRecords.filter((r) => r.emiEndDate >= today).length, [datedRecords, today]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const q = search.trim().toLowerCase();

  function truckDetailsMatch(t: Truck): boolean {
    return (
      t.registrationNumber.toLowerCase().includes(q) ||
      t.manufacturer.toLowerCase().includes(q) ||
      t.modelName.toLowerCase().includes(q)
    );
  }
  function groupRecordsMatch(recs: EmiRecord[]): boolean {
    return recs.some(
      (r) =>
        r.emiName.toLowerCase().includes(q) ||
        r.bankName.toLowerCase().includes(q) ||
        r.loanNumber.toLowerCase().includes(q)
    );
  }

  // Build the ordered list of card groups: matched trucks first (alphabetical
  // by reg no), then "Other Financed Assets" last if it has any entries.
  type Group = { key: string; truck: Truck | null; records: EmiRecord[] };
  const visibleGroups = useMemo(() => {
    const truckGroups: Group[] = [...trucks]
      .sort((a, b) => a.registrationNumber.localeCompare(b.registrationNumber))
      .map((t) => ({ key: t.registrationNumber.trim().toUpperCase(), truck: t, records: recordsByGroup.get(t.registrationNumber.trim().toUpperCase()) ?? [] }));
    const other = recordsByGroup.get(OTHER_ASSETS_KEY) ?? [];
    const allGroups = other.length > 0 ? [...truckGroups, { key: OTHER_ASSETS_KEY, truck: null, records: other }] : truckGroups;
    const groups = exportFrom || exportTo ? allGroups.filter((g) => g.records.length > 0) : allGroups;

    if (!q) return groups;
    return groups.filter((g) => (g.truck ? truckDetailsMatch(g.truck) : false) || groupRecordsMatch(g.records));
  }, [trucks, recordsByGroup, q, exportFrom, exportTo]);

  useEffect(() => {
    if (!q) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const g of visibleGroups) {
        const detailsMatch = g.truck ? truckDetailsMatch(g.truck) : false;
        if (!detailsMatch) next.add(g.key);
      }
      return next;
    });
  }, [q]);

  if (!isAllowed) return null;
  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={6} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-border bg-purple-surface text-purple-text shadow-sm">
            <Landmark className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Truck EMI Record</h1>
            <p className="mt-0.5 text-sm text-text-secondary">Read-only audit view of every loan EMI across the fleet</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatCard icon={TruckIcon} label="Trucks" value={String(trucks.length)} accent="bg-accent-surface text-accent-text" />
        <StatCard icon={ClipboardList} label="Total EMI Entries" value={String(records.length)} accent="bg-purple-surface text-purple-text" />
        <StatCard icon={Landmark} label="Active EMIs" value={String(activeCount)} accent="bg-warning-surface text-warning-text" />
        <StatCard icon={IndianRupee} label="Total Monthly EMI (Active)" value={fmtCurCompact(totalMonthlyActive)} accent="bg-success-surface text-success-text" />
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
            placeholder="Search by truck, EMI name, bank, loan no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-w-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-placeholder"
          />
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DateRangePill from={exportFrom} to={exportTo} onFromChange={setExportFrom} onToChange={setExportTo} />
          <DownloadExcelButton
            path="/exports/emi"
            filename="emi_records.xlsx"
            params={{
              ...(exportFrom ? { from_date: exportFrom } : {}),
              ...(exportTo ? { to_date: exportTo } : {}),
            }}
          />
        </div>
      </div>

      {/* Cards */}
      {visibleGroups.length === 0 ? (
        <EmptyState size="compact" illustration="not-found" title={trucks.length === 0 && records.length === 0 ? "No trucks or EMI entries yet" : "No trucks or EMI entries match these filters"} className="rounded-xl border border-separator-border bg-background-primary-default" />
      ) : (
        <div className="flex flex-col gap-3">
          {visibleGroups.map((group) => {
            const groupRecords = group.records;
            const isOpen = expanded.has(group.key);
            const activeGroupRecords = groupRecords.filter((r) => r.emiEndDate >= today);
            const groupMonthly = activeGroupRecords.reduce((sum, r) => sum + n(r.emiAmount), 0);
            const groupFinanceCost = activeGroupRecords.reduce((sum, r) => sum + n(r.monthlyFinanceCost), 0);
            const isOther = group.truck === null;

            return (
              <div
                key={group.key}
                className={`overflow-hidden rounded-xl border bg-background-primary-default shadow-sm transition ${
                  isOpen ? "border-accent-border ring-1 ring-accent-border" : "border-separator-border hover:border-accent-border"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(group.key)}
                  className="flex w-full items-center gap-5 px-5 py-4 text-left transition-colors hover:bg-fill-2"
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fill-2 ${
                    isOther ? " text-text-secondary" : " text-accent-text"
                  }`}>
                    {isOther ? <Boxes className="h-5 w-5" /> : <TruckIcon className="h-5 w-5" />}
                  </span>

                  {isOther ? (
                    <div className="min-w-0 flex-1">
                      <p className="text-body-semibold text-text-primary">Other Financed Assets</p>
                      <p className="text-xs text-text-tertiary">EMI entries not linked to a known truck registration</p>
                    </div>
                  ) : (
                    <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5">
                      <DetailChip label="Reg No" value={group.truck!.registrationNumber} mono />
                      <DetailChip label="Manufacturer" value={group.truck!.manufacturer} />
                      <DetailChip label="Model" value={group.truck!.modelName} />
                      <DetailChip label="Truck Type" value={group.truck!.truckType} />
                      <DetailChip label="Branch" value={group.truck!.branchRegisteredTo} />
                    </div>
                  )}

                  <div className="ml-auto flex shrink-0 items-center gap-4">
                    {groupRecords.length > 0 && (
                      <div className="hidden items-start gap-4 sm:flex">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[11px] text-text-tertiary">Active monthly EMI</span>
                          <span className="text-caption-1-semibold text-success-text">{fmtCurCompact(groupMonthly)}</span>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[11px] text-text-tertiary">Monthly Finance Cost</span>
                          <span className="text-caption-1-semibold text-accent-text">{fmtCurCompact(groupFinanceCost)}</span>
                        </div>
                      </div>
                    )}
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-caption-1-semibold ${
                      groupRecords.length > 0 ? "bg-accent-surface-strong text-accent-text" : "bg-fill-2 text-text-secondary"
                    }`}>
                      {groupRecords.length} EMI{groupRecords.length !== 1 ? "s" : ""}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-separator-border bg-fill-1">
                    {groupRecords.length === 0 ? (
                      <p className="px-5 py-6 text-center text-sm text-text-tertiary">No EMI entries for this truck.</p>
                    ) : (
                      <div className="overflow-x-auto px-3 pb-3 pt-1">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                          <thead>
                            <tr className="text-left text-caption-2-semibold text-text-tertiary">
                              <th className="px-3 py-2">EMI Name</th>
                              <th className="px-3 py-2">Bank</th>
                              <th className="px-3 py-2">Loan No.</th>
                              <th className="px-3 py-2 text-right">Loan Amount</th>
                              <th className="px-3 py-2 text-right">EMI Amount</th>
                              <th className="px-3 py-2 text-right">Monthly Finance Cost</th>
                              <th className="px-3 py-2">Start Date</th>
                              <th className="px-3 py-2">End Date</th>
                              <th className="px-3 py-2 text-right">Tenure</th>
                              <th className="px-3 py-2">Status</th>
                            </tr>
                          </thead>
                          <PagedTbody items={groupRecords}>
                            {(r, i) => {
                              const active = r.emiEndDate >= today;
                              return (
                                <tr
                                  key={r.id}
                                  className={`rounded-lg transition-colors hover:bg-accent-surface-strong/50 ${i % 2 === 1 ? "bg-background-primary-default " : "bg-background-primary-default "}`}
                                >
                                  <td className="rounded-l-lg px-3 py-2.5 font-medium text-text-primary">{r.emiName || "—"}</td>
                                  <td className="px-3 py-2.5 text-text-secondary">{r.bankName || "—"}</td>
                                  <td className="px-3 py-2.5 font-mono text-xs text-text-secondary">{r.loanNumber || "—"}</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{fmtCur(r.loanAmount)}</td>
                                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-text-primary">{fmtCur(r.emiAmount)}</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-accent-text">{fmtCur(r.monthlyFinanceCost)}</td>
                                  <td className="px-3 py-2.5 text-text-secondary">{r.emiStartDate ? formatDate(r.emiStartDate) : "—"}</td>
                                  <td className="px-3 py-2.5 text-text-secondary">{r.emiEndDate ? formatDate(r.emiEndDate) : "—"}</td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">{r.tenureMonths ? `${r.tenureMonths} mo` : "—"}</td>
                                  <td className="rounded-r-lg px-3 py-2.5">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption-2-semibold ${
                                      active ? "bg-success-surface-strong text-success-text" : "bg-fill-2 text-text-secondary"
                                    }`}>
                                      {active ? "Active" : "Completed"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            }}
                          </PagedTbody>
                        </table>
                      </div>
                    )}
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
