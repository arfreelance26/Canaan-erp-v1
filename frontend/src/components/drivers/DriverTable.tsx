"use client";

import { Eye, FileText, Mail, Pencil, Phone, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Driver } from "@/types/driver";
import { formatDate } from "@/lib/format-date";
import { getComplianceStatus, type ComplianceStatus } from "@/lib/compliance";
import { cn } from "@/lib/utils";

type DriverTableProps = {
  drivers: Driver[];
  onView: (driver: Driver) => void;
  onEdit: (driver: Driver) => void;
  /** Omit to hide the delete action — driver deletion is Admin-only. */
  onDelete?: (id: string) => void;
};

const STATUS_PILL: Record<ComplianceStatus, string> = {
  Valid:           "bg-green-50 text-green-700 ring-green-200",
  "Expiring Soon": "bg-amber-50 text-amber-700 ring-amber-200",
  Expired:         "bg-red-50 text-red-600 ring-red-200",
};

function ProofBadge({ fileName }: { fileName: string | null }) {
  if (!fileName) return <p className="mt-0.5 text-gray-300">—</p>;
  return (
    <p className="mt-0.5 flex items-center gap-1 truncate font-medium text-gray-700">
      <FileText className="h-3 w-3 shrink-0 text-gray-400" />
      <span className="truncate">{fileName}</span>
    </p>
  );
}

export function DriverTable({ drivers, onView, onEdit, onDelete }: DriverTableProps) {
  if (drivers.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No driver records yet. Click &ldquo;Add Driver&rdquo; to create one.
      </div>
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
            className="group flex cursor-pointer flex-col gap-4 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)]"
          >
            {/* Header — avatar, name / driver ID */}
            <div className="flex items-center gap-3">
              <Avatar photoUrl={driver.photoUrl} label={driver.name} size={44} />
              <div className="min-w-0">
                <p className="truncate font-bold text-gray-900">{driver.name}</p>
                <p className="truncate text-xs text-gray-500">{driver.driverId || "—"}</p>
              </div>
            </div>

            {/* Contact */}
            <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3 text-xs">
              <div className="flex min-w-0 items-center gap-1.5 text-gray-600">
                <Phone className="h-3 w-3 shrink-0 text-gray-400" />
                <span className="truncate">{driver.contactNumber || "—"}</span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5 text-gray-600">
                <Mail className="h-3 w-3 shrink-0 text-gray-400" />
                <span className="truncate">{driver.email || "—"}</span>
              </div>
            </div>

            {/* Aadhaar / License numbers */}
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs">
              <div className="min-w-0">
                <p className="font-semibold uppercase tracking-wide text-gray-400">Aadhaar Number</p>
                <p className="mt-0.5 truncate font-medium text-gray-700">{driver.aadhaarNumber || "—"}</p>
              </div>
              <div className="min-w-0">
                <p className="font-semibold uppercase tracking-wide text-gray-400">License Number</p>
                <p className="mt-0.5 truncate font-medium text-gray-700">{driver.licenseNumber || "—"}</p>
              </div>
            </div>

            {/* License Expiry — color-coded pill */}
            <div className="flex flex-col gap-1 rounded-lg bg-gray-50 px-2.5 py-2 text-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">License Expiry</span>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-gray-700">{formatDate(driver.licenseExpiryDate) || "—"}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", STATUS_PILL[licenseStatus])}>
                  {licenseStatus}
                </span>
              </div>
            </div>

            {/* Aadhaar / License proof */}
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs">
              <div className="min-w-0">
                <p className="font-semibold uppercase tracking-wide text-gray-400">Aadhaar Proof</p>
                <ProofBadge fileName={driver.aadhaarFileName} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold uppercase tracking-wide text-gray-400">License Proof</p>
                <ProofBadge fileName={driver.licenseFileName} />
              </div>
            </div>

            {/* Actions */}
            <div
              className="flex items-center justify-end gap-1 border-t border-gray-100 pt-3"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => onView(driver)}
                aria-label={`View ${driver.driverId}`}
                className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-emerald-50 hover:text-emerald-600"
              >
                <Eye className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onEdit(driver)}
                aria-label={`Edit ${driver.driverId}`}
                className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-blue-50 hover:text-blue-600"
              >
                <Pencil className="h-4 w-4" />
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(driver.id)}
                  aria-label={`Delete ${driver.driverId}`}
                  className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-red-50 hover:text-red-600"
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
