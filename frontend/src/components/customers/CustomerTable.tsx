"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types/customer";

type CustomerTableProps = {
  customers: Customer[];
  onEdit: (customer: Customer) => void;
  onDelete: (id: string) => void;
};

const columns = [
  "Photo",
  "Customer Name",
  "GSTIN",
  "Contact Personnel",
  "Phone",
  "Email",
  "Address",
  "Customer Type",
  "Status",
  "Actions",
];

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700",
  INACTIVE: "bg-gray-100 text-gray-600",
  BLACKLISTED: "bg-red-50 text-red-700",
};

export function CustomerTable({ customers, onEdit, onDelete }: CustomerTableProps) {
  if (customers.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No customers yet. Click &ldquo;Add Customer&rdquo; to create one.
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
          {customers.map((customer) => (
            <tr key={customer.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <Avatar photoUrl={customer.photoUrl} label={customer.name} size={44} />
              </td>
              <td className="px-4 py-3 font-medium text-gray-900">{customer.name}</td>
              <td className="px-4 py-3 text-gray-600">{customer.gstin}</td>
              <td className="px-4 py-3 text-gray-600">{customer.contactPersonnelName}</td>
              <td className="px-4 py-3 text-gray-600">{customer.phone}</td>
              <td className="px-4 py-3 text-gray-600">{customer.email}</td>
              <td className="px-4 py-3 text-gray-600">{customer.address}</td>
              <td className="px-4 py-3 text-gray-600">{customer.customerType}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    statusStyles[customer.status] ?? "bg-gray-100 text-gray-600"
                  )}
                >
                  {customer.status}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(customer)}
                    aria-label={`Edit ${customer.name}`}
                    className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(customer.id)}
                    aria-label={`Delete ${customer.name}`}
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
