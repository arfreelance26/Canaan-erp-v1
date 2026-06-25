"use client";

import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Vendor } from "@/types/vendor";

type VendorTableProps = {
  vendors: Vendor[];
  onEdit: (vendor: Vendor) => void;
  onDelete: (id: string) => void;
};

const columns = [
  "Vendor Name",
  "Category",
  "Contact Number",
  "GSTIN",
  "PAN",
  "Email",
  "Address",
  "Status",
  "Created At",
  "Actions",
];

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700",
  INACTIVE: "bg-gray-100 text-gray-600",
  BLACKLISTED: "bg-red-50 text-red-700",
};

export function VendorTable({ vendors, onEdit, onDelete }: VendorTableProps) {
  if (vendors.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No vendors yet. Click &ldquo;Add Vendor&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((column) => (
              <th
                key={column}
                className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {vendors.map((vendor) => (
            <tr key={vendor.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{vendor.name}</td>
              <td className="px-4 py-3 text-gray-600">{vendor.category}</td>
              <td className="px-4 py-3 text-gray-600">{vendor.contactNumber}</td>
              <td className="px-4 py-3 text-gray-600">{vendor.gstin}</td>
              <td className="px-4 py-3 text-gray-600">{vendor.pan}</td>
              <td className="px-4 py-3 text-gray-600">{vendor.email}</td>
              <td className="px-4 py-3 text-gray-600">{vendor.address}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    statusStyles[vendor.status] ?? "bg-gray-100 text-gray-600"
                  )}
                >
                  {vendor.status}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600">{vendor.createdAt}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(vendor)}
                    aria-label={`Edit ${vendor.name}`}
                    className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(vendor.id)}
                    aria-label={`Delete ${vendor.name}`}
                    className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
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
