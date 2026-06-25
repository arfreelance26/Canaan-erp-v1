"use client";

import { FileText, Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Driver } from "@/types/driver";

type DriverTableProps = {
  drivers: Driver[];
  onEdit: (driver: Driver) => void;
  onDelete: (id: string) => void;
};

const columns = [
  "Photo",
  "Driver ID",
  "Driver's Name",
  "Branch",
  "Contact Number",
  "Email",
  "Aadhaar Number",
  "Aadhaar Proof",
  "License Number",
  "License Expiry",
  "License Proof",
  "Actions",
];

export function DriverTable({ drivers, onEdit, onDelete }: DriverTableProps) {
  if (drivers.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No driver records yet. Click &ldquo;Add Driver&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[1200px] text-left text-sm">
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
          {drivers.map((driver) => (
            <tr key={driver.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <Avatar photoUrl={driver.photoUrl} label={driver.name} size={44} />
              </td>
              <td className="px-4 py-3 font-medium text-gray-900">{driver.driverId}</td>
              <td className="px-4 py-3 text-gray-600">{driver.name}</td>
              <td className="px-4 py-3 text-gray-600">{driver.branch}</td>
              <td className="px-4 py-3 text-gray-600">{driver.contactNumber}</td>
              <td className="px-4 py-3 text-gray-600">{driver.email}</td>
              <td className="px-4 py-3 text-gray-600">{driver.aadhaarNumber}</td>
              <td className="px-4 py-3 text-gray-600">
                {driver.aadhaarFileName ? (
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-gray-400" />
                    {driver.aadhaarFileName}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-600">{driver.licenseNumber}</td>
              <td className="px-4 py-3 text-gray-600">{driver.licenseExpiryDate}</td>
              <td className="px-4 py-3 text-gray-600">
                {driver.licenseFileName ? (
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-gray-400" />
                    {driver.licenseFileName}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(driver)}
                    aria-label={`Edit ${driver.driverId}`}
                    className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(driver.id)}
                    aria-label={`Delete ${driver.driverId}`}
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
