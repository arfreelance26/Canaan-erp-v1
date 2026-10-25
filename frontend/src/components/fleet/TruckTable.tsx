"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Pencil, Trash2, Eye, Truck as TruckIcon, Gauge, History, CircleDot, ShieldAlert, FileClock } from "lucide-react";
import { getTyreLayout } from "@/lib/tyre-layouts";
import { getComplianceStatus, type ComplianceField, type ComplianceStatus } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";
import type { Branch } from "@/types/branch";
import { truckImageUrl } from "@/components/fleet/VehicleImages";
import { COMPLIANCE_MANAGER_ROLES } from "@/lib/compliance-docs";

type TruckTableProps = {
  trucks: Truck[];
  branches: Branch[];
  onView: (truck: Truck) => void;
  onEdit: (truck: Truck) => void;
  onDelete: (id: string) => void;
  onChangeBranch: (truck: Truck, branchName: string) => void;
  onBranchHistory: (truck: Truck) => void;
  onComplianceHistory: (truck: Truck) => void;
  /** Admin only — the pencil on the odometer chip. */
  onCorrectOdometer?: (truck: Truck) => void;
};

const ALERT_CHIP: Record<Exclude<ComplianceStatus, "Valid">, string> = {
  "Expiring Soon": "bg-amber-400/90 text-amber-950",
  Expired:         "bg-red-500/90 text-white",
};

/** FC / Insurance problems as small chips over the image — nothing when both are valid. */
function ComplianceChips({ truck }: { truck: Truck }) {
  const items = ([
    ["FC", truck.fcExpiryDate, "fc"],
    ["Insurance", truck.insuranceExpiryDate, "insurance"],
  ] as [string, string, ComplianceField][])
    .map(([label, date, field]) => ({ label, date, status: getComplianceStatus(date, field) }))
    .filter((i) => i.status !== "Valid");
  if (items.length === 0) return null;
  return (
    <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span
          key={i.label}
          title={`${i.label} ${i.status.toLowerCase()}${i.date ? ` · ${formatDate(i.date)}` : " · no date on record"}`}
          className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur-md", ALERT_CHIP[i.status as Exclude<ComplianceStatus, "Valid">])}
        >
          <ShieldAlert className="h-3 w-3" />
          {i.label} {i.status === "Expired" ? "Expired" : "Expiring"}
        </span>
      ))}
    </div>
  );
}

/** Card hero — the Vehicle Identity Image (or a navy placeholder) with the
 *  truck's ID, registration and type laid over it. */
function CardImage({ truck }: { truck: Truck }) {
  const src = truck.truckPhotosFileName ? truckImageUrl(truck, "photo") : null;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const model = [truck.manufacturer, truck.modelName]
    .filter((v) => v && v.toLowerCase() !== "nan")
    .join(" ");
  return (
    <div className="relative -mx-4 -mt-4 h-[25rem] overflow-hidden rounded-t-2xl bg-gradient-to-br from-[#16213e] via-[#1b2a52] to-[#0f172a]">
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={truck.registrationNumber || truck.truckId}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 pb-16 text-white/20">
          <TruckIcon className="h-14 w-14" strokeWidth={1.25} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">No vehicle image</span>
        </div>
      )}

      <ComplianceChips truck={truck} />
      {truck.truckType && (
        <span className="absolute right-3 top-3 rounded-full bg-white/85 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#16213e] shadow-sm backdrop-blur-md">
          {truck.truckType}
        </span>
      )}

      {/* Identity strip */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-4 pb-3 pt-10">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold leading-tight text-white">{truck.registrationNumber || "—"}</p>
            <p className="truncate text-xs text-white/70">
              {truck.truckId}{model && <> · {model}</>}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TruckTable({ trucks, branches, onView, onEdit, onDelete, onChangeBranch, onBranchHistory, onComplianceHistory, onCorrectOdometer }: TruckTableProps) {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const canSeeCompliance = COMPLIANCE_MANAGER_ROLES.includes(authUser?.softwareDesignation ?? "");
  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-300/20 dark:bg-gray-200/60 dark:text-gray-600">
        No trucks yet. Click &ldquo;Add Truck&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {trucks.map((truck) => (
        <div
          key={truck.truckId}
          onClick={() => onView(truck)}
          className="group flex cursor-pointer flex-col gap-3.5 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)] dark:border-gray-300/20 dark:bg-gray-200/70 dark:hover:border-blue-400/30"
        >
          <CardImage truck={truck} />

          {/* Specs — tyre layout + odometer as compact chips */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 font-medium text-gray-700 dark:bg-gray-300/30 dark:text-gray-800" title="Tyre Layout">
              <CircleDot className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{getTyreLayout(truck.tyreLayout)?.label ?? (truck.tyreLayout || "—")}</span>
            </span>
            <span className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 font-medium tabular-nums text-gray-700 dark:bg-gray-300/30 dark:text-gray-800" title="Odometer">
              <Gauge className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              {truck.odometer ? `${Number(truck.odometer).toLocaleString("en-IN")} km` : "—"}
              {isAdmin && onCorrectOdometer && (
                <button
                  type="button"
                  aria-label={`Correct odometer of ${truck.truckId}`}
                  title="Correct odometer"
                  onClick={(e) => { e.stopPropagation(); onCorrectOdometer(truck); }}
                  className="-mr-1 ml-0.5 rounded p-0.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </span>
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
            className="flex flex-wrap items-center justify-between gap-1.5 border-t border-gray-100 pt-3 dark:border-gray-300/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center gap-1.5">
            {canSeeCompliance && (
              <button
                type="button"
                onClick={() => onComplianceHistory(truck)}
                aria-label={`Compliance history for ${truck.truckId}`}
                className="flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-50/60 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-[0_2px_10px_rgba(245,158,11,0.12)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-300/80 hover:bg-amber-100/70 hover:shadow-[0_4px_16px_rgba(245,158,11,0.2)]"
              >
                <FileClock className="h-3.5 w-3.5" />
                Compliance History
              </button>
            )}
            {isAdmin && (
<button
              type="button"
              onClick={() => onBranchHistory(truck)}
              aria-label={`Branch history for ${truck.truckId}`}
              className="flex items-center gap-1.5 rounded-full border border-purple-200/60 bg-purple-50/50 px-3 py-1.5 text-xs font-semibold text-purple-600 shadow-[0_2px_10px_rgba(168,85,247,0.12)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-purple-300/70 hover:bg-purple-100/60 hover:text-purple-700 hover:shadow-[0_4px_16px_rgba(168,85,247,0.2)]"
            >
              <History className="h-3.5 w-3.5" />
              Branch History
            </button>
)}
            </div>
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
