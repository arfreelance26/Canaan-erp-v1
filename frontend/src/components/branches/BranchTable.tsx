"use client";

import { RiPencilLine as Pencil, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import type { Branch } from "@/types/branch";
import { HALT_CONTAINER_TYPES } from "@/lib/halt-pay";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
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
    { label: "Company", key: "company" as const, dot: "bg-fill-4" },
    { label: "Customer", key: "party" as const, dot: "bg-warning-solid" },
  ];
  return (
    <div className="inline-block overflow-hidden rounded-xl border border-separator-border bg-background-primary-default">
      <table className="text-xs">
        <thead>
          <tr className="bg-fill-1">
            <th className="w-24 px-3 py-1.5" />
            {HALT_CONTAINER_TYPES.map((t) => (
              <th key={t.spec} className="px-3 py-1.5 text-right text-caption-2-semibold text-text-tertiary">
                {t.label}
              </th>
            ))}
          </tr>
        </thead>
        <PagedTbody className="divide-y divide-separator-border" items={rows}>
          {(r) => (
            <tr key={r.key}>
              <td className="px-3 py-1.5">
                <span className="inline-flex items-center gap-1.5 text-caption-2-semibold text-text-secondary">
                  <span className={`h-1.5 w-1.5 rounded-full ${r.dot}`} />
                  {r.label}
                </span>
              </td>
              {HALT_CONTAINER_TYPES.map((t) => (
                <td key={t.spec} className="min-w-[72px] px-3 py-1.5 text-right font-medium tabular-nums text-text-primary">
                  {fmtFee(branch[r.key === "company" ? t.company : t.party])}
                </td>
              ))}
            </tr>
          )}
        </PagedTbody>
      </table>
    </div>
  );
}

/** The Cleaner Batta Fee of each container type. */
function CleanerFeeGrid({ branch }: { branch: Branch }) {
  return (
    <div className="inline-block overflow-hidden rounded-xl border border-separator-border bg-background-primary-default">
      <table className="text-xs">
        <thead>
          <tr className="bg-fill-1">
            {HALT_CONTAINER_TYPES.map((t) => (
              <th key={t.spec} className="px-3 py-1.5 text-right text-caption-2-semibold text-text-tertiary">
                {t.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {HALT_CONTAINER_TYPES.map((t) => (
              <td key={t.spec} className="min-w-[72px] px-3 py-1.5 text-right font-medium tabular-nums text-text-primary">
                {fmtFee(branch[t.cleaner])}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function BranchTable({ branches, onEdit, onDelete }: BranchTableProps) {
  if (branches.length === 0) {
    return (
      <EmptyState size="compact" illustration="no-data" title="No branches yet" description="Click &ldquo;Add Branch&rdquo; to create one" />
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-separator-border bg-fill-1">
            {columns.map((col) => (
              <th
                key={col}
                className="px-5 py-3 text-caption-1-semibold text-text-secondary"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <PagedTbody className="divide-y divide-separator-border" items={branches}>
          {(branch) => (
            <tr key={branch.id} className="align-middle transition-colors hover:bg-fill-2">
              <td className="px-5 py-5 font-semibold text-text-primary">{branch.name}</td>
              <td className="px-5 py-4">
                <HaltFeeGrid branch={branch} />
              </td>
              <td className="px-5 py-5 tabular-nums text-text-primary">{branch.driverHaltDayPercentage}%</td>
              <td className="px-5 py-4">
                <CleanerFeeGrid branch={branch} />
              </td>
              <td className="px-5 py-5 tabular-nums text-text-primary">{fmt(branch.workshopBattaFee)}</td>
              <td className="px-5 py-5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(branch)}
                    aria-label={`Edit ${branch.name}`}
                    className="rounded-md p-1.5 text-text-secondary transition hover:bg-accent-surface-strong hover:text-accent-text"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(branch.id)}
                    aria-label={`Delete ${branch.name}`}
                    className="rounded-md p-1.5 text-text-secondary transition hover:bg-danger-surface-strong hover:text-danger-text"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          )}
        </PagedTbody>
      </table>
    </div>
  );
}
