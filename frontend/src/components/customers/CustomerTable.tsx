"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { Customer } from "@/types/customer";

type CustomerTableProps = {
  customers: Customer[];
  onEdit: (customer: Customer) => void;
  onDelete: (id: string) => void;
};

const columns = [
  "Customer Name",
  "GSTIN",
  "Contact Personnel",
  "Phone",
  "Email",
  "Address",
  "Customer Type",
  "Actions",
];

export function CustomerTable({ customers, onEdit, onDelete }: CustomerTableProps) {
  if (customers.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No customers yet. Click &ldquo;Add Customer&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[900px] text-left text-sm">
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
              <td className="px-4 py-3 font-medium text-gray-900">{customer.name}</td>
              <td className="px-4 py-3 text-gray-600">{customer.gstin}</td>
              <td className="px-4 py-3 text-gray-600">{customer.contactPersonnelName}</td>
              <td className="px-4 py-3 text-gray-600">{customer.phone}</td>
              <td className="px-4 py-3 text-gray-600">{customer.email}</td>
              <td className="px-4 py-3 text-gray-600">{customer.address}</td>
              <td className="px-4 py-3 text-gray-600">{customer.customerType}</td>
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
