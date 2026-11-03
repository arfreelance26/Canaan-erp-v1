"use client";

import { RiEyeLine as Eye, RiFileTextLine as FileText, RiMailLine as Mail, RiPencilLine as Pencil, RiPhoneLine as Phone, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import { Avatar } from "@/components/ui/Avatar";
import type { Driver } from "@/types/driver";
import { formatDate } from "@/lib/format-date";
import { getComplianceStatus, type ComplianceStatus } from "@/lib/compliance";
import { cn } from "@/lib/utils";

import { EmptyState } from "@/components/ui/EmptyState";
type DriverTableProps = {
  drivers: Driver[];
  onView: (driver: Driver) => void;
  onEdit: (driver: Driver) => void;
  /** Omit to hide the delete action — driver deletion is Admin-only. */
  onDelete?: (id: string) => void;
};

const STATUS_PILL: Record<ComplianceStatus, string> = {
  Valid:           "bg-success-surface text-success-text ring-success-border",
  "Expiring Soon": "bg-warning-surface text-warning-text ring-warning-border",
  Expired:         "bg-danger-surface text-danger-text ring-danger-border",
};

function ProofBadge({ fileName }: { fileName: string | null }) {
  if (!fileName) return <p className="mt-0.5 text-text-tertiary">—</p>;
  return (
    <p className="mt-0.5 flex items-center gap-1 truncate font-medium text-text-primary">
      <FileText className="h-3 w-3 shrink-0 text-text-tertiary" />
      <span className="truncate">{fileName}</span>
    </p>
  );
}

export function DriverTable({ drivers, onView, onEdit, onDelete }: DriverTableProps) {
  if (drivers.length === 0) {
    return (
      <EmptyState size="compact" illustration="logistics" title="No driver records yet" description="Click &ldquo;Add Driver&rdquo; to create one" />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {drivers.map((driver) => {
        const licenseStatus = getComplianceStatus(driver.licenseExpiryDate, "default");
        return (
          <div
            key={driver.id}
            onClick={() => onView(driver)}
            className="group flex cursor-pointer flex-col gap-4 rounded-2xl border border-separator-border bg-background-primary-default p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:border-accent-border hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)]"
          >
            {/* Header — avatar, name / driver ID */}
            <div className="flex items-center gap-3">
              <Avatar photoUrl={driver.photoUrl} label={driver.name} size={44} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-text-primary">{driver.name}</p>
                <p className="truncate text-xs text-text-secondary">{driver.driverId || "—"}</p>
              </div>
            </div>

            {/* Contact */}
            <div className="flex flex-col gap-1.5 border-t border-separator-border pt-3 text-xs">
              <div className="flex min-w-0 items-center gap-1.5 text-text-secondary">
                <Phone className="h-3 w-3 shrink-0 text-text-tertiary" />
                <span className="truncate">{driver.contactNumber || "—"}</span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5 text-text-secondary">
                <Mail className="h-3 w-3 shrink-0 text-text-tertiary" />
                <span className="truncate">{driver.email || "—"}</span>
              </div>
            </div>

            {/* Aadhaar / License numbers */}
            <div className="grid grid-cols-2 gap-3 border-t border-separator-border pt-3 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-text-tertiary">Aadhaar Number</p>
                <p className="mt-0.5 truncate font-medium text-text-primary">{driver.aadhaarNumber || "—"}</p>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-text-tertiary">License Number</p>
                <p className="mt-0.5 truncate font-medium text-text-primary">{driver.licenseNumber || "—"}</p>
              </div>
            </div>

            {/* License Expiry — color-coded pill */}
            <div className="flex flex-col gap-1 rounded-lg bg-fill-1 px-2.5 py-2 text-xs">
              <span className="text-caption-2-semibold text-text-tertiary">License Expiry</span>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-text-primary">{formatDate(driver.licenseExpiryDate) || "—"}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-caption-2-semibold ring-1", STATUS_PILL[licenseStatus])}>
                  {licenseStatus}
                </span>
              </div>
            </div>

            {/* Aadhaar / License proof */}
            <div className="grid grid-cols-2 gap-3 border-t border-separator-border pt-3 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-text-tertiary">Aadhaar Proof</p>
                <ProofBadge fileName={driver.aadhaarFileName} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-text-tertiary">License Proof</p>
                <ProofBadge fileName={driver.licenseFileName} />
              </div>
            </div>

            {/* Actions */}
            <div
              className="flex items-center justify-end gap-1 border-t border-separator-border pt-3"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => onView(driver)}
                aria-label={`View ${driver.driverId}`}
                className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-success-surface-strong hover:text-success-text"
              >
                <Eye className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onEdit(driver)}
                aria-label={`Edit ${driver.driverId}`}
                className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-accent-surface-strong hover:text-accent-text"
              >
                <Pencil className="h-4 w-4" />
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(driver.id)}
                  aria-label={`Delete ${driver.driverId}`}
                  className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-danger-surface-strong hover:text-danger-text"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
