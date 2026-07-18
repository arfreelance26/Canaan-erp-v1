"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Wrench, Plus, Pencil, Trash2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { repairTypesApi } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import type { RepairType } from "@/types/repair-type";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { DecimalInput } from "@/components/ui/DecimalInput";

export default function RepairsManagementPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const [repairs, setRepairs] = useState<RepairType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RepairType | null>(null);
  const [form, setForm] = useState({ name: "", defaultCost: "" });
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (ready && user?.softwareDesignation !== "Admin") router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    repairTypesApi.list().then(setRepairs).finally(() => setLoading(false));
  }, []);

  useAutoRefresh(() => { repairTypesApi.list().then(setRepairs); }, 10000);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", defaultCost: "" });
    setDialogOpen(true);
  }

  function openEdit(rt: RepairType) {
    setEditing(rt);
    setForm({ name: rt.name, defaultCost: rt.defaultCost === "0" ? "" : rt.defaultCost });
    setDialogOpen(true);
  }

  async function handleDelete(rt: RepairType) {
    const result = await confirmDelete("repair type");
    if (!result.isConfirmed) return;
    try {
      await repairTypesApi.delete(rt.id);
      setRepairs((prev) => prev.filter((r) => r.id !== rt.id));
      showSuccess("Repair type deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete repair type.");
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const payload = { name: form.name.trim(), defaultCost: form.defaultCost || "0" };
    try {
      if (editing) {
        const updated = await repairTypesApi.update(editing.id, payload);
        setRepairs((prev) => prev.map((r) => (r.id === editing.id ? updated : r)));
        showSuccess("Repair type updated successfully.");
      } else {
        const created = await repairTypesApi.create(payload);
        setRepairs((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        showSuccess("Repair type created successfully.");
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save repair type.");
    }
  }

  if (!ready || user?.softwareDesignation !== "Admin") return null;
  if (loading) return <PageSkeleton hasButton hasSearch columns={3} />;

  const filteredRepairs = repairs.filter((rt) => !searchQuery || rt.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Repairs Management</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Manage repair types — these appear as quick-select options when logging major repairs on a trip sheet.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search repairs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/repair-types" filename="repair_types.xlsx" />
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Repair Type
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-auto max-h-[75vh]">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Repair Name</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Default Cost (₹)</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRepairs.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">
                  No repair types configured yet. Add one to get started.
                </td>
              </tr>
            )}
            {filteredRepairs.map((rt) => (
              <tr key={rt.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{rt.name}</td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {parseFloat(rt.defaultCost) > 0
                    ? `₹${parseFloat(rt.defaultCost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(rt)}
                      className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-blue-200 hover:text-blue-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rt)}
                      className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-red-200 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? "Edit Repair Type" : "Add Repair Type"}
        className="max-w-md"
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Field label="Repair Name *">
            <input
              className={inputClass}
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Engine Overhaul"
            />
          </Field>
          <Field label="Default Cost (₹)">
            <DecimalInput type="number"
              min="0"
              step="0.01"
              className={inputClass}
              value={form.defaultCost}
              onChange={(e) => setForm((f) => ({ ...f, defaultCost: e.target.value }))}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="e.g. 2500 (optional)"
            />
            <p className="mt-1 text-xs text-gray-400">
              Pre-fills the cost field when this repair is selected on a trip sheet.
            </p>
          </Field>
          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {editing ? "Save Changes" : "Add Repair Type"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
