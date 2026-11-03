"use client";

import { RiPencilLine as Pencil, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import type { Customer } from "@/types/customer";
import { ProfileAvatar } from "@/components/ui/ProfileAvatar";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
type CustomerTableProps = {
  customers: Customer[];
  onEdit: (customer: Customer) => void;
  onDelete: (id: string) => void;
};

export function CustomerTable({ customers, onEdit, onDelete }: CustomerTableProps) {
  if (customers.length === 0) {
    return (
      <EmptyState size="compact" illustration="no-data" title="No customers yet" description="Click &ldquo;Add Customer&rdquo; to create one" />
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
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[900px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-separator-border bg-fill-1">
            {hasData.name && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Customer Name</th>}
            {hasData.gstin && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">GSTIN</th>}
            {hasData.contactPersonnel && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Contact Personnel</th>}
            {hasData.phone && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Phone</th>}
            {hasData.email && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Email</th>}
            {hasData.address && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Address</th>}
            {hasData.customerType && <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Customer Type</th>}
            <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">Actions</th>
          </tr>
        </thead>
        <PagedTbody className="divide-y divide-separator-border" items={customers}>
          {(customer) => (
            <tr key={customer.id} className="hover:bg-fill-2">
              {hasData.name && (
                <td className="px-4 py-3 font-medium text-text-primary">
                  <div className="flex items-center gap-3">
                    <ProfileAvatar look={customer.avatarStyle} seed={customer.avatarSeed || `customer-${customer.id}`} className="h-9 w-9 shrink-0" />
                    {customer.name}
                  </div>
                </td>
              )}
              {hasData.gstin && <td className="px-4 py-3 text-text-secondary">{customer.gstin}</td>}
              {hasData.contactPersonnel && <td className="px-4 py-3 text-text-secondary">{customer.contactPersonnelName}</td>}
              {hasData.phone && <td className="px-4 py-3 text-text-secondary">{customer.phone}</td>}
              {hasData.email && <td className="px-4 py-3 text-text-secondary">{customer.email}</td>}
              {hasData.address && <td className="px-4 py-3 text-text-secondary">{customer.address}</td>}
              {hasData.customerType && <td className="px-4 py-3 text-text-secondary">{customer.customerType}</td>}
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(customer)}
                    aria-label={`Edit ${customer.name}`}
                    className="transition duration-300 group rounded-md p-1.5 text-text-secondary hover:bg-accent-surface-strong hover:text-accent-text"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(customer.id)}
                    aria-label={`Delete ${customer.name}`}
                    className="transition duration-300 group rounded-md p-1.5 text-text-secondary hover:bg-danger-surface-strong hover:text-danger-text"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          )}
        </PagedTbody>
      </table>
    </div>
  );
}
