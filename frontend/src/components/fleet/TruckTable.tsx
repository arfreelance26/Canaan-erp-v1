"use client";

import { Pencil, Trash2, Eye, Truck as TruckIcon, Gauge, History } from "lucide-react";
import { getTyreLayout } from "@/lib/tyre-layouts";
import { getComplianceStatus, type ComplianceField, type ComplianceStatus } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";
import type { Branch } from "@/types/branch";

type TruckTableProps = {
  trucks: Truck[];
  branches: Branch[];
  onView: (truck: Truck) => void;
  onEdit: (truck: Truck) => void;
  onDelete: (id: string) => void;
  onChangeBranch: (truck: Truck, branchName: string) => void;
  onBranchHistory: (truck: Truck) => void;
};

const STATUS_PILL: Record<ComplianceStatus, string> = {
  Valid:           "bg-green-50 text-green-700 ring-green-200",
  "Expiring Soon": "bg-amber-50 text-amber-700 ring-amber-200",
  Expired:         "bg-red-50 text-red-600 ring-red-200",
};

function ExpiryPill({ label, date, field }: { label: string; date: string; field: ComplianceField }) {
  const status = getComplianceStatus(date, field);
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-gray-300/30">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</span>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-800">{formatDate(date)}</span>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", STATUS_PILL[status])}>
          {status}
        </span>
      </div>
    </div>
  );
}

export function TruckTable({ trucks, branches, onView, onEdit, onDelete, onChangeBranch, onBranchHistory }: TruckTableProps) {
  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-300/20 dark:bg-gray-200/60 dark:text-gray-600">
        No trucks yet. Click &ldquo;Add Truck&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {trucks.map((truck) => (
        <div
          key={truck.truckId}
          onClick={() => onView(truck)}
          className="group flex cursor-pointer flex-col gap-4 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)] dark:border-gray-300/20 dark:bg-gray-200/70 dark:hover:border-blue-400/30"
        >
          {/* Header — icon badge, Truck ID / Registration, truck type */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white shadow-sm dark:bg-blue-400/20 dark:text-blue-800">
                <TruckIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold text-gray-900 dark:text-gray-950">{truck.truckId}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-600">{truck.registrationNumber || "—"}</p>
              </div>
            </div>
            {truck.truckType && (
              <span className="shrink-0 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                {truck.truckType}
              </span>
            )}
          </div>

          {/* Manufacturer / model */}
          <p className="truncate text-sm text-gray-600 dark:text-gray-700">
            {[truck.manufacturer, truck.modelName].filter(Boolean).join(" ") || "—"}
          </p>

          {/* Specs row */}
          <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs dark:border-gray-300/20">
            <div className="min-w-0">
              <p className="font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Tyre Layout</p>
              <p className="mt-0.5 truncate font-medium text-gray-700 dark:text-gray-800">
                {getTyreLayout(truck.tyreLayout)?.label ?? (truck.tyreLayout || "—")}
              </p>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1 font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                <Gauge className="h-3 w-3" />
                Odometer
              </p>
              <p className="mt-0.5 truncate font-medium tabular-nums text-gray-700 dark:text-gray-800">
                {truck.odometer ? `${Number(truck.odometer).toLocaleString("en-IN")} km` : "—"}
              </p>
            </div>
          </div>

          {/* Compliance pills */}
          <div className="grid grid-cols-2 gap-2">
            <ExpiryPill label="FC Expiry" date={truck.fcExpiryDate} field="fc" />
            <ExpiryPill label="Insurance Expiry" date={truck.insuranceExpiryDate} field="insurance" />
          </div>

          {/* Branch Assigned To — click a branch to reassign this truck */}
          {branches.length > 0 && (
            <div
              className="flex flex-col gap-1.5 border-t border-gray-100 pt-3 dark:border-gray-300/20"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Branch Assigned To
              </p>
              <div className="flex flex-wrap gap-1.5">
                {branches.map((branch) => {
                  const active = truck.branchRegisteredTo === branch.name;
                  return (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => onChangeBranch(truck, branch.name)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                        active
                          ? "border-gray-900 bg-gray-900 text-white dark:border-blue-400/40 dark:bg-blue-400/20 dark:text-blue-800"
                          : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-300/30 dark:bg-gray-300/20 dark:text-gray-700 dark:hover:bg-gray-300/30",
                      )}
                    >
                      {branch.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div
            className="flex items-center justify-between gap-1 border-t border-gray-100 pt-3 dark:border-gray-300/20"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onBranchHistory(truck)}
              aria-label={`Branch history for ${truck.truckId}`}
              className="flex items-center gap-1.5 rounded-full border border-red-200/60 bg-red-50/50 px-3 py-1.5 text-xs font-semibold text-red-600 shadow-[0_2px_10px_rgba(239,68,68,0.12)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-red-300/70 hover:bg-red-100/60 hover:text-red-700 hover:shadow-[0_4px_16px_rgba(239,68,68,0.2)]"
            >
              <History className="h-3.5 w-3.5" />
              Branch History
            </button>
            <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onView(truck)}
              aria-label={`View ${truck.truckId}`}
              className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-emerald-50 hover:text-emerald-600"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(truck)}
              aria-label={`Edit ${truck.truckId}`}
              className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-blue-50 hover:text-blue-600"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(truck.id)}
              aria-label={`Delete ${truck.truckId}`}
              className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
