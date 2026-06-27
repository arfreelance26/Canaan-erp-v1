"use client";

import { useEffect, useState } from "react";
import { Plus, GitBranch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { BranchTable } from "@/components/branches/BranchTable";
import { BranchFormDialog } from "@/components/branches/BranchFormDialog";
import { branchesApi } from "@/lib/api";
import { confirmDelete } from "@/lib/swal";
import type { Branch } from "@/types/branch";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

export default function BranchesPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  useEffect(() => {
    if (ready && user?.softwareDesignation !== "Admin") {
      router.replace("/");
    }
  }, [ready, user, router]);

  useEffect(() => {
    branchesApi.list().then(setBranches).finally(() => setLoading(false));
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
    await branchesApi.delete(id);
    setBranches((prev) => prev.filter((b) => b.id !== id));
  }

  async function handleSave(branch: Branch) {
    const exists = branches.some((b) => b.id === branch.id);
    if (exists) {
      const updated = await branchesApi.update(branch.id, branch);
      setBranches((prev) => prev.map((b) => (b.id === branch.id ? updated : b)));
    } else {
      const created = await branchesApi.create(branch);
      setBranches((prev) => [...prev, created]);
    }
    setDialogOpen(false);
  }

  if (!ready || user?.softwareDesignation !== "Admin") return null;
  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Branch Management</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Configure company branches and their driver halt day rates
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Branch
        </button>
      </div>

      <BranchTable branches={branches} onEdit={handleEdit} onDelete={handleDelete} />

      <BranchFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingBranch}
      />
    </div>
  );
}
