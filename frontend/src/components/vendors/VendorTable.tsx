"use client";

import { Eye, Pencil, Trash2, Store, Mail, Phone, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Vendor } from "@/types/vendor";

type VendorTableProps = {
  vendors: Vendor[];
  onView: (vendor: Vendor) => void;
  onEdit: (vendor: Vendor) => void;
  onDelete: (id: string) => void;
};

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  INACTIVE: "bg-gray-100 text-gray-600 ring-gray-200",
  BLACKLISTED: "bg-red-50 text-red-700 ring-red-200",
};

const categoryAccent: Record<string, string> = {
  Fuel: "bg-amber-50 text-amber-700",
  Maintenance: "bg-blue-50 text-blue-700",
  Tyre: "bg-violet-50 text-violet-700",
  Transport: "bg-cyan-50 text-cyan-700",
};

export function VendorTable({ vendors, onView, onEdit, onDelete }: VendorTableProps) {
  if (vendors.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-300/20 dark:bg-gray-200/60 dark:text-gray-600">
        No vendors yet. Click &ldquo;Add Vendor&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {vendors.map((vendor) => (
        <div
          key={vendor.id}
          onClick={() => onView(vendor)}
          className="group flex cursor-pointer flex-col gap-4 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)] dark:border-gray-300/20 dark:bg-gray-200/70 dark:hover:border-blue-400/30"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white shadow-sm dark:bg-blue-400/20 dark:text-blue-800">
                <Store className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold text-gray-900 dark:text-gray-950">{vendor.name}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-600">{vendor.gstin || vendor.pan || "—"}</p>
              </div>
            </div>
            <span className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1",
              statusStyles[vendor.status] ?? "bg-gray-100 text-gray-600 ring-gray-200"
            )}>
              {vendor.status || "—"}
            </span>
          </div>

          {/* Category badge */}
          {vendor.category && (
            <span className={cn(
              "w-fit rounded-md border border-transparent px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              categoryAccent[vendor.category] ?? "bg-gray-50 text-gray-600"
            )}>
              {vendor.category}
            </span>
          )}

          {/* Contact details */}
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-3 dark:border-gray-300/20">
            {vendor.contactNumber && (
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-700">
                <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                <span className="truncate">{vendor.contactNumber}</span>
              </div>
            )}
            {vendor.email && (
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-700">
                <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                <span className="truncate">{vendor.email}</span>
              </div>
            )}
            {vendor.address && (
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-700">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
                <span className="truncate">{vendor.address}</span>
              </div>
            )}
          </div>

          {/* GST / PAN row */}
          {(vendor.gstin || vendor.pan) && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {vendor.gstin && (
                <div className="min-w-0">
                  <p className="font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">GSTIN</p>
                  <p className="mt-0.5 truncate font-medium text-gray-700 dark:text-gray-800">{vendor.gstin}</p>
                </div>
              )}
              {vendor.pan && (
                <div className="min-w-0">
                  <p className="font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">PAN</p>
                  <p className="mt-0.5 truncate font-medium text-gray-700 dark:text-gray-800">{vendor.pan}</p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div
            className="flex items-center justify-end gap-1 border-t border-gray-100 pt-3 dark:border-gray-300/20"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onView(vendor)}
              aria-label={`View ${vendor.name}`}
              className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-emerald-50 hover:text-emerald-600"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(vendor)}
              aria-label={`Edit ${vendor.name}`}
              className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-blue-50 hover:text-blue-600"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(vendor.id)}
              aria-label={`Delete ${vendor.name}`}
              className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
