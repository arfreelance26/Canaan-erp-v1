"use client";

import { useEffect, useState } from "react";
import { Plus, GitBranch, Search } from "lucide-react";
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
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Branch Management</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Configure company branches and their driver halt day rates
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search branches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/branches" filename="branches.xlsx" />
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Branch
          </button>
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
