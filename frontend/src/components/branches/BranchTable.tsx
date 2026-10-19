"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { Branch } from "@/types/branch";
import { HALT_CONTAINER_TYPES } from "@/lib/halt-pay";

type BranchTableProps = {
  branches: Branch[];
  onEdit: (branch: Branch) => void;
  onDelete: (id: string) => void;
};

const columns = ["Branch Name", "Halt Fees per Day", "Driver Compensation %", "Cleaner Batta Fee", "On Workshop Batta Fee", "Actions"];

const fmt = (v: string) =>
  `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

// Halt fees read better without trailing ".00" — keep paise only when present.
const fmtFee = (v: string) => {
  const n = Number(v) || 0;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

/** Container types across, Company / Customer down — one small grid per branch. */
function HaltFeeGrid({ branch }: { branch: Branch }) {
  const rows = [
    { label: "Company", key: "company" as const, dot: "bg-slate-400" },
    { label: "Customer", key: "party" as const, dot: "bg-amber-400" },
  ];
  return (
    <div className="inline-block overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="text-xs">
        <thead>
          <tr className="bg-slate-50">
            <th className="w-24 px-3 py-1.5" />
            {HALT_CONTAINER_TYPES.map((t) => (
              <th key={t.spec} className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {t.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-3 py-1.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                  <span className={`h-1.5 w-1.5 rounded-full ${r.dot}`} />
                  {r.label}
                </span>
              </td>
              {HALT_CONTAINER_TYPES.map((t) => (
                <td key={t.spec} className="min-w-[72px] px-3 py-1.5 text-right font-medium tabular-nums text-slate-800">
                  {fmtFee(branch[r.key === "company" ? t.company : t.party])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BranchTable({ branches, onEdit, onDelete }: BranchTableProps) {
  if (branches.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No branches yet. Click &ldquo;Add Branch&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((col) => (
              <th
                key={col}
                className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {branches.map((branch) => (
            <tr key={branch.id} className="align-middle transition-colors hover:bg-gray-50/60">
              <td className="px-5 py-5 font-semibold text-gray-900">{branch.name}</td>
              <td className="px-5 py-4">
                <HaltFeeGrid branch={branch} />
              </td>
              <td className="px-5 py-5 tabular-nums text-gray-700">{branch.driverHaltDayPercentage}%</td>
              <td className="px-5 py-5 tabular-nums text-gray-700">{fmt(branch.cleanerBattaFee)}</td>
              <td className="px-5 py-5 tabular-nums text-gray-700">{fmt(branch.workshopBattaFee)}</td>
              <td className="px-5 py-5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(branch)}
                    aria-label={`Edit ${branch.name}`}
                    className="rounded-md p-1.5 text-gray-500 transition-all hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(branch.id)}
                    aria-label={`Delete ${branch.name}`}
                    className="rounded-md p-1.5 text-gray-500 transition-all hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
