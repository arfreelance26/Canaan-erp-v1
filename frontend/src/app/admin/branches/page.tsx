"use client";

import { useEffect, useState } from "react";
import { Plus, GitBranch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { BranchTable } from "@/components/branches/BranchTable";
import { BranchFormDialog } from "@/components/branches/BranchFormDialog";
import { branchesApi } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import type { Branch } from "@/types/branch";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

import { PillSearch } from "@/components/ui/PillSearch";
export default function BranchesPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (ready && user?.softwareDesignation !== "Admin") {
      router.replace("/");
    }
  }, [ready, user, router]);

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useAutoRefresh(() => {
    branchesApi.list().then(setBranches);
  }, 5000);

  function handleAdd() {
    setEditingBranch(null);
    setDialogOpen(true);
  }

  function handleEdit(branch: Branch) {
    setEditingBranch(branch);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    const result = await confirmDelete("branch");
    if (!result.isConfirmed) return;
    try {
      await branchesApi.delete(id);
      setBranches((prev) => prev.filter((b) => b.id !== id));
      showSuccess("Branch deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete branch.");
    }
  }

  async function handleSave(branch: Branch) {
    try {
      const exists = branches.some((b) => b.id === branch.id);
      if (exists) {
        const updated = await branchesApi.update(branch.id, branch);
        setBranches((prev) => prev.map((b) => (b.id === branch.id ? updated : b)));
        showSuccess("Branch updated successfully.");
      } else {
        const created = await branchesApi.create(branch);
        setBranches((prev) => [...prev, created]);
        showSuccess("Branch created successfully.");
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save branch.");
    }
  }

  if (!ready || user?.softwareDesignation !== "Admin") return null;
  if (loading) return <PageSkeleton hasButton hasSearch columns={4} />;

  const filteredBranches = branches.filter((b) =>
    !searchQuery || b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
            <GitBranch className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Branch Management</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Configure company branches and their driver halt day rates
            </p>
          </div>
        </div>
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add Branch
          </button>
      </div>

      {/* Toolbar: search on the left, View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search branches..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto">
          <DownloadExcelButton path="/exports/branches" filename="branches.xlsx" />
        </div>
      </div>

      <BranchTable branches={filteredBranches} onEdit={handleEdit} onDelete={handleDelete} />

      <BranchFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingBranch}
      />
    </div>
  );
}
