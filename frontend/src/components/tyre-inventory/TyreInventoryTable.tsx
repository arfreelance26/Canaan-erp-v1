"use client";

import { useAuth } from "@/context/AuthContext";
import { RiPencilLine as Pencil, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import { cn } from "@/lib/utils";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { Truck } from "@/types/truck";
import { formatDate } from "@/lib/format-date";

import { EmptyState } from "@/components/ui/EmptyState";
type TyreInventoryTableProps = {
  tyres: TyreInventoryItem[];
  fitments: TyreFitmentRecord[];
  trucks: Truck[];
  onEdit: (tyre: TyreInventoryItem) => void;
  onDelete: (id: string) => void;
  onViewHistory: (tyre: TyreInventoryItem) => void;
  onFlagForRetread?: (tyre: TyreInventoryItem) => void;
  onFlagDiscarded?: (tyre: TyreInventoryItem) => void;
  onViewData?: (tyre: TyreInventoryItem) => void;
};

const columns = [
  "Brand",
  "Tyre Type",
  "Condition",
  "Tyre Number",
  "Tyre Size",
  "Cost",
  "Purchase Date",
  "Status",
  "Actions",
];

export function TyreInventoryTable({
  tyres,
  fitments,
  trucks,
  onEdit,
  onDelete,
  onViewHistory,
  onFlagForRetread,
  onFlagDiscarded,
  onViewData,
}: TyreInventoryTableProps) {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const canViewTyreHistory = isAdmin || authUser?.softwareDesignation === "Maintenance";
  if (tyres.length === 0) {
    return (
      <EmptyState size="compact" illustration="logistics" title="No tyres yet" description="Click &ldquo;Add Tyre&rdquo; to create one" />
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[1700px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-separator-border bg-fill-1">
            {columns.map((column, index) => (
              <th
                key={`${column}-${index}`}
                className="px-4 py-3 text-caption-1-semibold text-text-secondary"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-separator-border">
          {tyres.map((tyre) => {
            const isAttached = fitments.some((f) => f.tyreId === tyre.id && !f.removedDate);
            const status = isAttached ? "Attached" : "Available";

            return (
              <tr key={tyre.id} className="hover:bg-fill-2">
                <td className="px-4 py-3 font-medium text-text-primary">{tyre.brand}</td>
                <td className="px-4 py-3 text-text-secondary">{tyre.tyreType}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-caption-1-medium",
                      tyre.condition === "Rethreaded"
                        ? "bg-warning-surface text-warning-text"
                        : "bg-success-surface text-success-text"
                    )}
                  >
                    {tyre.condition}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">{tyre.tyreNumber}</td>
                <td className="px-4 py-3 text-text-secondary">{tyre.size}</td>
                <td className="px-4 py-3 text-text-secondary">₹{Number(tyre.cost).toLocaleString()}</td>
                <td className="px-4 py-3 text-text-secondary">
                  {formatDate(tyre.purchaseDate)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-caption-1-medium",
                        status === "Attached"
                          ? "bg-purple-surface text-purple-text"
                          : "bg-accent-surface text-accent-text"
                      )}
                    >
                      {status}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onViewData?.(tyre)}
                      className="rounded-lg border border-separator-border px-3 py-1.5 text-caption-1-medium text-text-primary hover:bg-fill-2 transition-colors"
                    >
                      View Tyre Data
                    </button>
                    {canViewTyreHistory && (
<button
                      type="button"
                      onClick={() => onViewHistory(tyre)}
                      className="rounded-lg border border-separator-border px-3 py-1.5 text-caption-1-medium text-text-primary hover:bg-fill-2 transition-colors"
                    >
                      View Tyre History
                    </button>
)}
                    <button
                      type="button"
                      disabled={isAttached}
                      title={isAttached ? "Remove this tyre from its truck first" : undefined}
                      onClick={() => onFlagForRetread?.(tyre)}
                      className="rounded-lg border border-warning-border bg-warning-surface px-3 py-1.5 text-caption-1-medium text-warning-text hover:bg-warning-surface-strong transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-warning-surface-strong"
                    >
                      Flag for Retreading
                    </button>
                    <button
                      type="button"
                      disabled={isAttached}
                      title={isAttached ? "Remove this tyre from its truck first" : undefined}
                      onClick={() => onFlagDiscarded?.(tyre)}
                      className="rounded-lg border border-danger-border bg-danger-surface px-3 py-1.5 text-caption-1-medium text-danger-text hover:bg-danger-surface-strong transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-danger-surface-strong"
                    >
                      Flag as Discarded
                    </button>
                    <div className="flex items-center gap-1 ml-2 border-l pl-2">
                      <button
                        type="button"
                        onClick={() => onEdit(tyre)}
                        aria-label={`Edit ${tyre.tyreNumber}`}
                        className="transition duration-300 group rounded-md p-1.5 text-text-secondary hover:bg-accent-surface-strong hover:text-accent-text"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(tyre.id)}
                        aria-label={`Delete ${tyre.tyreNumber}`}
                        className="transition duration-300 group rounded-md p-1.5 text-text-secondary hover:bg-danger-surface-strong hover:text-danger-text"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
