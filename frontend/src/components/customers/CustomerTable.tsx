"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { Customer } from "@/types/customer";

type CustomerTableProps = {
  customers: Customer[];
  onEdit: (customer: Customer) => void;
  onDelete: (id: string) => void;
};

export function CustomerTable({ customers, onEdit, onDelete }: CustomerTableProps) {
  if (customers.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No customers yet. Click &ldquo;Add Customer&rdquo; to create one.
      </div>
    );
  }

  const hasData = {
    name: customers.some((c) => c.name),
    gstin: customers.some((c) => c.gstin),
    contactPersonnel: customers.some((c) => c.contactPersonnelName),
    phone: customers.some((c) => c.phone),
    email: customers.some((c) => c.email),
    address: customers.some((c) => c.address),
    customerType: customers.some((c) => c.customerType),
  };

  return (
    <div className="overflow-auto max-h-[65vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[900px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-200 bg-gray-50">
            {hasData.name && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Customer Name</th>}
            {hasData.gstin && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">GSTIN</th>}
            {hasData.contactPersonnel && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Contact Personnel</th>}
            {hasData.phone && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Phone</th>}
            {hasData.email && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Email</th>}
            {hasData.address && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Address</th>}
            {hasData.customerType && <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Customer Type</th>}
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {customers.map((customer) => (
            <tr key={customer.id} className="hover:bg-gray-50">
              {hasData.name && <td className="px-4 py-3 font-medium text-gray-900">{customer.name}</td>}
              {hasData.gstin && <td className="px-4 py-3 text-gray-600">{customer.gstin}</td>}
              {hasData.contactPersonnel && <td className="px-4 py-3 text-gray-600">{customer.contactPersonnelName}</td>}
              {hasData.phone && <td className="px-4 py-3 text-gray-600">{customer.phone}</td>}
              {hasData.email && <td className="px-4 py-3 text-gray-600">{customer.email}</td>}
              {hasData.address && <td className="px-4 py-3 text-gray-600">{customer.address}</td>}
              {hasData.customerType && <td className="px-4 py-3 text-gray-600">{customer.customerType}</td>}
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
