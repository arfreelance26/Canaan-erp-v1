"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { VendorTable } from "@/components/vendors/VendorTable";
import { VendorFormDialog } from "@/components/vendors/VendorFormDialog";
import { vendorsApi } from "@/lib/api";
import type { Vendor } from "@/types/vendor";

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  useEffect(() => {
    vendorsApi.list().then(setVendors).finally(() => setLoading(false));
  }, []);

  function handleAdd() {
    setEditingVendor(null);
    setDialogOpen(true);
  }

  function handleEdit(vendor: Vendor) {
    setEditingVendor(vendor);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this vendor?")) return;
    await vendorsApi.delete(id);
    setVendors((prev) => prev.filter((vendor) => vendor.id !== id));
  }

  async function handleSave(vendor: Vendor) {
    const exists = vendors.some((existing) => existing.id === vendor.id);
    if (exists) {
      const updated = await vendorsApi.update(vendor.id, vendor);
      setVendors((prev) => prev.map((existing) => (existing.id === vendor.id ? updated : existing)));
    } else {
      const created = await vendorsApi.create(vendor);
      setVendors((prev) => [...prev, created]);
    }
    setDialogOpen(false);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Our Vendors</h1>
          <p className="mt-1 text-sm text-gray-500">Manage vendor records and contacts</p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Vendor
        </button>
      </div>

      <VendorTable vendors={vendors} onEdit={handleEdit} onDelete={handleDelete} />

      <VendorFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingVendor}
      />
    </div>
  );
}
