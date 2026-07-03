"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { VendorTable } from "@/components/vendors/VendorTable";
import { VendorFormDialog } from "@/components/vendors/VendorFormDialog";
import { vendorsApi } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import type { Vendor } from "@/types/vendor";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredVendors = vendors.filter(v =>
    !searchQuery ||
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.contactNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
        vendorsApi.list().then(setVendors).finally(() => setLoading(false));
      }, []);
      useAutoRefresh(() => {
    vendorsApi.list().then(setVendors).finally(() => setLoading(false));
      }, 5000);


  function handleAdd() {
    setEditingVendor(null);
    setDialogOpen(true);
  }

  function handleEdit(vendor: Vendor) {
    setEditingVendor(vendor);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    const result = await confirmDelete("vendor");
    if (!result.isConfirmed) return;
    try {
      await vendorsApi.delete(id);
      setVendors((prev) => prev.filter((vendor) => vendor.id !== id));
      showSuccess("Vendor deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete vendor.");
    }
  }

  async function handleSave(vendor: Vendor) {
    try {
      const exists = vendors.some((existing) => existing.id === vendor.id);
      if (exists) {
        const updated = await vendorsApi.update(vendor.id, vendor);
        setVendors((prev) => prev.map((existing) => (existing.id === vendor.id ? updated : existing)));
        showSuccess("Vendor updated successfully.");
      } else {
        const created = await vendorsApi.create(vendor);
        setVendors((prev) => [...prev, created]);
        showSuccess("Vendor created successfully.");
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save vendor.");
    }
  }

  if (loading) return <PageSkeleton hasButton hasSearch columns={5} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Our Vendors</h1>
          <p className="mt-1 text-sm text-gray-500">Manage vendor records and contacts</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/vendors" filename="vendors.xlsx" />
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Add Vendor
          </button>
        </div>
      </div>

      <VendorTable vendors={filteredVendors} onEdit={handleEdit} onDelete={handleDelete} />

      <VendorFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingVendor}
      />
    </div>
  );
}
