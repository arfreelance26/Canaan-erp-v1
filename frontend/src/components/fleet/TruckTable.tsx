"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { RiPencilLine as Pencil, RiDeleteBinLine as Trash2, RiEyeLine as Eye, RiTruckLine as TruckIcon, RiDashboard3Line as Gauge, RiHistoryLine as History, RiRecordCircleLine as CircleDot, RiShieldFlashLine as ShieldAlert, RiFileHistoryLine as FileClock } from "@remixicon/react";
import { getTyreLayout } from "@/lib/tyre-layouts";
import { getComplianceStatus, type ComplianceField, type ComplianceStatus } from "@/lib/compliance";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";
import type { Branch } from "@/types/branch";
import { truckImageUrl } from "@/components/fleet/VehicleImages";
import { COMPLIANCE_MANAGER_ROLES } from "@/lib/compliance-docs";

import { EmptyState } from "@/components/ui/EmptyState";
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
  "Expiring Soon": "bg-warning-solid/90 text-warning-text-strong",
  Expired:         "bg-danger-solid/90 text-on-solid",
  "Not Uploaded":  "bg-background-primary-default/90 text-text-secondary",
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
          className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold shadow-sm", ALERT_CHIP[i.status as Exclude<ComplianceStatus, "Valid">])}
        >
          <ShieldAlert className="h-3 w-3" />
          {i.label} {i.status === "Expired" ? "Expired" : i.status === "Not Uploaded" ? "Not Uploaded" : "Expiring"}
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
    <div className="relative -mx-4 -mt-4 h-[25rem] overflow-hidden rounded-t-2xl bg-accent-solid ">
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={truck.registrationNumber || truck.truckId}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover transition-transform duration-500"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 pb-16 text-on-solid/20">
          <TruckIcon className="h-14 w-14" strokeWidth={1.25} />
          <span className="text-caption-2-semibold">No vehicle image</span>
        </div>
      )}

      <ComplianceChips truck={truck} />
      {truck.truckType && (
        <span className="absolute right-3 top-3 rounded-full bg-background-primary-default px-2.5 py-0.5 text-caption-2-semibold text-accent-text-strong shadow-sm">
          {truck.truckType}
        </span>
      )}

      {/* Identity strip */}
      <div className="absolute inset-x-0 bottom-0 bg-scrim/80 px-4 pb-3 pt-10">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-title-3-semibold leading-tight text-on-solid">{truck.registrationNumber || "—"}</p>
            <p className="truncate text-xs text-on-solid/70">
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
      <EmptyState size="compact" illustration="logistics" title="No trucks yet" description="Click &ldquo;Add Truck&rdquo; to create one" />
    );
  }

  return (
    <div data-tour="truck-cards" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {trucks.map((truck) => (
        <div
          key={truck.truckId}
          onClick={() => onView(truck)}
          className="group flex cursor-pointer flex-col gap-3.5 rounded-2xl border border-separator-border bg-background-primary-default p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:border-accent-border hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)]"
        >
          <CardImage truck={truck} />

          {/* Specs — tyre layout + odometer as compact chips */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 rounded-lg bg-fill-1 px-2.5 py-1.5 font-medium text-text-primary" title="Tyre Layout">
              <CircleDot className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              <span className="truncate">{getTyreLayout(truck.tyreLayout)?.label ?? (truck.tyreLayout || "—")}</span>
            </span>
            <span className="flex items-center gap-1.5 rounded-lg bg-fill-1 px-2.5 py-1.5 font-medium tabular-nums text-text-primary" title="Odometer">
              <Gauge className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              {truck.odometer ? `${Number(truck.odometer).toLocaleString("en-IN")} km` : "—"}
              {isAdmin && onCorrectOdometer && (
                <button
                  type="button"
                  aria-label={`Correct odometer of ${truck.truckId}`}
                  title="Correct odometer"
                  onClick={(e) => { e.stopPropagation(); onCorrectOdometer(truck); }}
                  className="-mr-1 ml-0.5 rounded p-0.5 text-text-tertiary transition-colors hover:bg-accent-surface-strong hover:text-accent-text"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </span>
          </div>

          {/* Branch Assigned To — click a branch to reassign this truck */}
          {branches.length > 0 && (
            <div
              className="flex flex-col gap-1.5 border-t border-separator-border pt-3"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-caption-2-semibold text-text-tertiary">
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
                        "rounded-full border px-2.5 py-1 text-caption-2-semibold transition-colors",
                        active
                          ? "border-border-button-hover bg-inverse text-on-solid"
                          : "border-separator-border bg-fill-1 text-text-secondary hover:border-border-button-default hover:bg-fill-3",
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
            className="flex flex-wrap items-center justify-between gap-1.5 border-t border-separator-border pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center gap-1.5">
            {canSeeCompliance && (
              <button
                type="button"
                onClick={() => onComplianceHistory(truck)}
                aria-label={`Compliance history for ${truck.truckId}`}
                className="flex items-center gap-1.5 rounded-full border border-warning-border/70 bg-warning-surface/60 px-3 py-1.5 text-caption-1-semibold text-warning-text shadow-md transition duration-300 hover:border-warning-border-strong/80 hover:bg-warning-surface-strong/70 shadow-md"
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
              className="flex items-center gap-1.5 rounded-full border border-purple-border/60 bg-purple-surface/50 px-3 py-1.5 text-caption-1-semibold text-purple-text shadow-md transition duration-300 hover:border-purple-border-strong/70 hover:bg-purple-surface-strong/60 hover:text-purple-text shadow-md"
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
              className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-success-surface-strong hover:text-success-text"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(truck)}
              aria-label={`Edit ${truck.truckId}`}
              className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-accent-surface-strong hover:text-accent-text"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(truck.id)}
              aria-label={`Delete ${truck.truckId}`}
              className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-danger-surface-strong hover:text-danger-text"
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
