"use client";

import { RiEyeLine as Eye, RiFileTextLine as FileText, RiPencilLine as Pencil, RiDeleteBinLine as Trash2, RiMailLine as Mail, RiPhoneLine as Phone, RiMapPin2Line as MapPin } from "@remixicon/react";
import { ProfileAvatar } from "@/components/ui/ProfileAvatar";
import { cn } from "@/lib/utils";
import type { Vendor } from "@/types/vendor";

import { EmptyState } from "@/components/ui/EmptyState";
type VendorTableProps = {
  vendors: Vendor[];
  onView: (vendor: Vendor) => void;
  onEdit: (vendor: Vendor) => void;
  onDelete: (id: string) => void;
  /** "View Record" on each card — what it opens is still to be decided. */
  onViewRecord?: (vendor: Vendor) => void;
};

const categoryAccent: Record<string, string> = {
  Fuel: "bg-warning-surface text-warning-text",
  Maintenance: "bg-accent-surface text-accent-text",
  Tyre: "bg-purple-surface text-purple-text",
  Transport: "bg-teal-surface text-teal-text",
};

export function VendorTable({ vendors, onView, onEdit, onDelete, onViewRecord }: VendorTableProps) {
  if (vendors.length === 0) {
    return (
      <EmptyState size="compact" illustration="no-data" title="No vendors yet" description="Click &ldquo;Add Vendor&rdquo; to create one" />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {vendors.map((vendor) => (
        <div
          key={vendor.id}
          onClick={() => onView(vendor)}
          className="group flex cursor-pointer flex-col gap-4 rounded-2xl border border-separator-border bg-background-primary-default p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:border-accent-border hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ProfileAvatar look={vendor.avatarStyle} seed={vendor.avatarSeed || `vendor-${vendor.id}`} className="h-11 w-11 shrink-0" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-text-primary">{vendor.name}</p>
                <p className="truncate text-xs text-text-secondary">{vendor.gstin || vendor.pan || "—"}</p>
              </div>
            </div>
          </div>

          {/* Category badge */}
          {vendor.category && (
            <span className={cn(
              "w-fit rounded-md border border-transparent px-2 py-1 text-caption-2-semibold",
              categoryAccent[vendor.category] ?? "bg-fill-1 text-text-secondary"
            )}>
              {vendor.category}
            </span>
          )}

          {/* Contact details — only when there's something to show; an empty
              bordered block just left a gap on vendors with no details. */}
          {!(vendor.contactNumber || vendor.email || vendor.address || vendor.gstin || vendor.pan) && (
            <p className="border-t border-separator-border pt-3 text-xs text-text-tertiary">
              No contact details added
            </p>
          )}
          {(vendor.contactNumber || vendor.email || vendor.address) && (
          <div className="flex flex-col gap-2 border-t border-separator-border pt-3">
            {vendor.contactNumber && (
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <Phone className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                <span className="truncate">{vendor.contactNumber}</span>
              </div>
            )}
            {vendor.email && (
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <Mail className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                <span className="truncate">{vendor.email}</span>
              </div>
            )}
            {vendor.address && (
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                <span className="truncate">{vendor.address}</span>
              </div>
            )}
          </div>
          )}

          {/* GST / PAN row */}
          {(vendor.gstin || vendor.pan) && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {vendor.gstin && (
                <div className="min-w-0">
                  <p className="font-semibold text-text-tertiary">GSTIN</p>
                  <p className="mt-0.5 truncate font-medium text-text-primary">{vendor.gstin}</p>
                </div>
              )}
              {vendor.pan && (
                <div className="min-w-0">
                  <p className="font-semibold text-text-tertiary">PAN</p>
                  <p className="mt-0.5 truncate font-medium text-text-primary">{vendor.pan}</p>
                </div>
              )}
            </div>
          )}

          {/* Actions — mt-auto pins them to the bottom, so every card in a
              row (they stretch to the tallest) lines its buttons up. */}
          <div
            className="mt-auto flex items-center justify-end gap-1 border-t border-separator-border pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onViewRecord?.(vendor)}
              className="mr-auto flex items-center gap-1.5 rounded-full border border-accent-border bg-accent-surface px-3 py-1 text-caption-1-semibold text-accent-text transition-colors hover:bg-accent-surface-strong"
            >
              <FileText className="h-3.5 w-3.5" />
              View Record
            </button>
            <button
              type="button"
              onClick={() => onView(vendor)}
              aria-label={`View ${vendor.name}`}
              className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-success-surface-strong hover:text-success-text"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(vendor)}
              aria-label={`Edit ${vendor.name}`}
              className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-accent-surface-strong hover:text-accent-text"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(vendor.id)}
              aria-label={`Delete ${vendor.name}`}
              className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-danger-surface-strong hover:text-danger-text"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
