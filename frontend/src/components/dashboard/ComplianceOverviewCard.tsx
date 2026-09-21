"use client";

import { useMemo, useState } from "react";
import { Search, ShieldCheck, X } from "lucide-react";
import type { Truck } from "@/types/truck";
import { getComplianceStatus, type ComplianceField } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import { Segmented } from "@/components/ui/Segmented";

type Status = "valid" | "soon" | "expired" | "none";
type Filter = "all" | "expired" | "soon";

// Same five documents the table has always shown; warning windows follow lib/compliance
// (the same ones the dashboard's alert banner uses).
const DOCS: { label: string; field: keyof Truck; kind: ComplianceField }[] = [
  { label: "FC", field: "fcExpiryDate", kind: "fc" },
  { label: "Road Tax", field: "roadTaxDate", kind: "roadTax" },
  { label: "Insurance", field: "insuranceExpiryDate", kind: "insurance" },
  { label: "Nat. Permit", field: "nationalPermitDate", kind: "nationalPermit" },
  { label: "Pollution", field: "pollutionCertificateDate", kind: "pollution" },
];

const CHIP: Record<Exclude<Status, "none">, { label: string; cls: string }> = {
  valid: { label: "Valid", cls: "bg-emerald-50 text-emerald-700" },
  soon: { label: "Soon", cls: "bg-amber-50 text-amber-700" },
  expired: { label: "Expired", cls: "bg-red-50 text-red-700" },
};

type Row = {
  truck: Truck;
  cells: { status: Status; date: string }[];
  expired: number;
  soon: number;
  worst: Status;
};

export function ComplianceOverviewCard({ trucks }: { trucks: Truck[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const { rows, totals } = useMemo(() => {
    const totals = { valid: 0, soon: 0, expired: 0, none: 0 };
    const list: Row[] = trucks.map((truck) => {
      let expired = 0;
      let soon = 0;
      const cells = DOCS.map(({ field, kind }) => {
        const date = (truck[field] as string | undefined) ?? "";
        if (!date) {
          totals.none += 1;
          return { status: "none" as Status, date: "" };
        }
        const s = getComplianceStatus(date, kind);
        if (s === "Expired") { expired += 1; totals.expired += 1; return { status: "expired" as Status, date }; }
        if (s === "Expiring Soon") { soon += 1; totals.soon += 1; return { status: "soon" as Status, date }; }
        totals.valid += 1;
        return { status: "valid" as Status, date };
      });
      return { truck, cells, expired, soon, worst: expired ? "expired" : soon ? "soon" : "valid" } as Row;
    });
    list.sort(
      (a, b) =>
        b.expired - a.expired ||
        b.soon - a.soon ||
        (a.truck.registrationNumber || "").localeCompare(b.truck.registrationNumber || "")
    );
    return { rows: list, totals };
  }, [trucks]);

  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (filter === "expired" && r.expired === 0) return false;
    if (filter === "soon" && r.soon === 0) return false;
    if (!q) return true;
    return (
      (r.truck.registrationNumber || "").toLowerCase().includes(q) ||
      (r.truck.truckId || "").toLowerCase().includes(q)
    );
  });

  const trucksWithIssues = rows.filter((r) => r.expired > 0).length;

  return (
    <div className="dk-inset overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-blue-50/70 via-white to-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Compliance Overview</h2>
            <p className="text-xs text-gray-500">
              {trucksWithIssues === 0
                ? `All ${rows.length} trucks have valid documents`
                : `${trucksWithIssues} of ${rows.length} trucks have an expired document`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <i className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {totals.valid} valid
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
            <i className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {totals.soon} expiring soon
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-red-700">
            <i className="h-1.5 w-1.5 rounded-full bg-red-500" />
            {totals.expired} expired
          </span>
          {totals.none > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-gray-500">
              <i className="h-1.5 w-1.5 rounded-full bg-gray-400" />
              {totals.none} no date
            </span>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All trucks" },
            { value: "expired", label: "Has expired" },
            { value: "soon", label: "Expiring soon" },
          ]}
        />
        <label className="flex h-8 w-56 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 shadow-sm transition-all focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
          <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search truck…"
            className="min-w-0 flex-1 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-gray-400 hover:text-gray-600">
              <X className="h-3 w-3" />
            </button>
          )}
        </label>
      </div>

      {/* Table */}
      <div className="p-4">
        <div className="overflow-hidden rounded-xl border border-gray-100">
          <div className="custom-scrollbar max-h-96 overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Truck</th>
                  {DOCS.map((d) => (
                    <th key={d.label} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      {d.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={DOCS.length + 1} className="px-5 py-10 text-center text-xs text-gray-400">
                      {rows.length === 0 ? "No trucks in the fleet yet." : "No trucks match this filter."}
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => (
                    <tr key={r.truck.id} className="transition-colors hover:bg-gray-50/70">
                      <td className="relative px-5 py-2.5">
                        {r.worst !== "valid" && (
                          <span
                            className={`absolute inset-y-2 left-0 w-1 rounded-r-full ${
                              r.worst === "expired" ? "bg-red-500" : "bg-amber-400"
                            }`}
                          />
                        )}
                        <p className="text-xs font-bold text-gray-900">{r.truck.registrationNumber || r.truck.truckId}</p>
                        <p className="text-[11px] text-gray-400">{r.truck.truckId}</p>
                      </td>
                      {r.cells.map((c, i) => (
                        <td key={DOCS[i].label} className="px-4 py-2.5">
                          {c.status === "none" ? (
                            <span className="text-gray-300" title="No date on record">—</span>
                          ) : (
                            <div className="flex flex-col items-start gap-0.5">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[c.status].cls}`}>
                                <i className="h-1 w-1 rounded-full bg-current" />
                                {CHIP[c.status].label}
                              </span>
                              <span className="pl-1 text-[10px] tabular-nums text-gray-400">{formatDate(c.date)}</span>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Showing <span className="font-semibold tabular-nums text-gray-700">{visible.length}</span> of {rows.length} trucks · worst first
        </p>
      </div>
    </div>
  );
}
