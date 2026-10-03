"use client";

import { useEffect, useState } from "react";
import { Plus, GitBranch, History, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { BranchTable } from "@/components/branches/BranchTable";
import { BranchFormDialog } from "@/components/branches/BranchFormDialog";
import { branchesApi, type BranchEditEventRow } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import type { Branch } from "@/types/branch";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { PillSearch } from "@/components/ui/PillSearch";

const EDIT_EVENT_ICON: Record<BranchEditEventRow["event"], typeof Plus> = {
  "Branch Created": Plus,
  "Branch Edited": Pencil,
  "Branch Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<BranchEditEventRow["event"], string> = {
  "Branch Created": "bg-blue-100 text-blue-700",
  "Branch Edited": "bg-amber-100 text-amber-700",
  "Branch Deleted": "bg-red-100 text-red-700",
};

export default function BranchesPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const { user, ready } = useAuth();
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<BranchEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    branchesApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

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
          <div className="flex shrink-0 items-center gap-3">
            {isAdmin && (
<button
              type="button"
              onClick={openEditHistory}
              className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-50"
            >
              <History className="h-4 w-4" />
              Edit History
            </button>
)}
            <button
              type="button"
              onClick={handleAdd}
              className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
            >
              <Plus className="h-4 w-4" />
              Add Branch
            </button>
          </div>
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

      {/* Edit History — every Create/Edit/Delete ever logged, across every
          branch, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by branch name or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.name.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No branch edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Branch</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Action</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">By</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-gray-800">{ev.name}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-gray-400"> ({ev.actorRole})</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
