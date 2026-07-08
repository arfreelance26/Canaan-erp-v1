"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { VendorTable } from "@/components/vendors/VendorTable";
import { VendorFormDialog, DRAFT_KEY as VENDOR_DRAFT_KEY } from "@/components/vendors/VendorFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { EditRequestDialog } from "@/components/attendance/EditRequestDialog";
import { vendorsApi, editApprovalsApi } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import type { Vendor } from "@/types/vendor";
import type { EditApprovalRequest, EditApprovalAction } from "@/types/edit-approval";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { useAuth } from "@/context/AuthContext";

export default function VendorsPage() {
  const { user } = useAuth();
  const isStaff = user?.softwareDesignation === "Trip Sheet Register";

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Edit approval state (Staff only)
  const [activeApprovals, setActiveApprovals] = useState<EditApprovalRequest[]>([]);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: EditApprovalAction; resourceId: string; resourceName: string } | null>(null);

  const filteredVendors = vendors.filter(v =>
    !searchQuery ||
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.contactNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
        vendorsApi.list().then(setVendors).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => {
    vendorsApi.list().then(setVendors).finally(() => setLoading(false));
      }, 5000);

  useWebSocketEvent("vendor_updated", () => setRefreshKey(k => k + 1));

  // Load and refresh active edit approvals for Staff
  useEffect(() => {
    if (!isStaff) return;
    editApprovalsApi.getMyActive().then(setActiveApprovals).catch(() => {});
  }, [isStaff]);
  useWebSocketEvent("edit_approval_updated", () => {
    if (!isStaff) return;
    editApprovalsApi.getMyActive().then(setActiveApprovals).catch(() => {});
  });

  function hasActiveApproval(resourceId: string, action: EditApprovalAction): boolean {
    return activeApprovals.some((a) =>
      a.resourceType === "Vendor" &&
      String(a.resourceId) === resourceId &&
      a.action === action &&
      a.expiresAt != null &&
      new Date(a.expiresAt.endsWith("Z") ? a.expiresAt : a.expiresAt + "Z") > new Date()
    );
  }

  function handleAdd() {
    setEditingVendor(null);
    setDialogOpen(true);
  }

  function handleEdit(vendor: Vendor) {
    if (isStaff && !hasActiveApproval(vendor.id, "Edit")) {
      setPendingAction({ type: "Edit", resourceId: vendor.id, resourceName: vendor.name });
      setEditRequestOpen(true);
      return;
    }
    setEditingVendor(vendor);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    const vendor = vendors.find((v) => v.id === id);
    if (isStaff && !hasActiveApproval(id, "Delete")) {
      setPendingAction({ type: "Delete", resourceId: id, resourceName: vendor?.name ?? id });
      setEditRequestOpen(true);
      return;
    }
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

  async function handleEditRequestSubmit(reason: string) {
    if (!pendingAction) return;
    await editApprovalsApi.create({
      resourceType: "Vendor",
      resourceId: parseInt(pendingAction.resourceId),
      resourceName: pendingAction.resourceName,
      action: pendingAction.type,
      reason,
    });
    showSuccess("Edit request has been sent.");
    setEditRequestOpen(false);
    setPendingAction(null);
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
        clearFormDraft(VENDOR_DRAFT_KEY);
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

      {/* Edit approval request dialog — shown when Staff clicks Edit/Delete without active approval */}
      {pendingAction && (
        <EditRequestDialog
          open={editRequestOpen}
          resourceType="Vendor"
          resourceName={pendingAction.resourceName}
          action={pendingAction.type}
          onSubmit={handleEditRequestSubmit}
          onClose={() => { setEditRequestOpen(false); setPendingAction(null); }}
        />
      )}
    </div>
  );
}
