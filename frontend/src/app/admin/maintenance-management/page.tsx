"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Settings2, Plus, Pencil, Trash2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { maintenanceTypesApi } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import type { MaintenanceTypeItem } from "@/types/maintenance-type";

export default function MaintenanceManagementPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const [types, setTypes] = useState<MaintenanceTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceTypeItem | null>(null);
  const [form, setForm] = useState({ name: "", intervalKm: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ready && user?.softwareDesignation !== "Admin") router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    maintenanceTypesApi.list().then(setTypes).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useAutoRefresh(() => { maintenanceTypesApi.list().then(setTypes).catch(() => {}); }, 15000);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", intervalKm: "" });
    setDialogOpen(true);
  }

  function openEdit(item: MaintenanceTypeItem) {
    setEditing(item);
    setForm({ name: item.name, intervalKm: String(item.intervalKm) });
    setDialogOpen(true);
  }

  async function handleDelete(item: MaintenanceTypeItem) {
    const result = await confirmDelete("maintenance type");
    if (!result.isConfirmed) return;
    try {
      await maintenanceTypesApi.delete(item.id);
      setTypes((prev) => prev.filter((t) => t.id !== item.id));
      showSuccess("Maintenance type deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete maintenance type.");
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const intervalKm = parseInt(form.intervalKm, 10);
    if (!name || !intervalKm || intervalKm <= 0) return;
    setSaving(true);
    try {
      if (editing) {
        const updated = await maintenanceTypesApi.update(editing.id, name, intervalKm, editing.version);
        setTypes((prev) => prev.map((t) => (t.id === editing.id ? updated : t)));
        showSuccess("Maintenance type updated successfully.");
      } else {
        const created = await maintenanceTypesApi.create(name, intervalKm);
        setTypes((prev) =>
          [...prev, created].sort((a, b) => a.intervalKm - b.intervalKm || a.name.localeCompare(b.name))
        );
        showSuccess("Maintenance type added successfully.");
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save maintenance type.");
    } finally {
      setSaving(false);
    }
  }

  if (!ready || user?.softwareDesignation !== "Admin") return null;
  if (loading) return <PageSkeleton hasButton hasSearch columns={3} />;

  const filtered = types.filter(
    (t) => !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 shadow-sm">
            <Settings2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-900">Maintenance Alert Management</h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-600">
              Define maintenance types and their kilometer intervals. These appear as options when logging maintenance records for trucks.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search types..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-gray-300/30 dark:bg-gray-200 dark:text-gray-900 dark:placeholder-gray-500 dark:focus:bg-gray-200"
            />
          </div>
          <DownloadExcelButton path="/exports/maintenance-types" filename="maintenance_types.xlsx" />
          <button
            type="button"
            onClick={openAdd}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Type
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-gray-200 bg-white dark:border-gray-300/20 dark:bg-gray-100">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-300/20 dark:bg-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
                Maintenance Type
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
                KM Interval
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-300/20">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-600">
                  {searchQuery
                    ? "No maintenance types match your search."
                    : "No maintenance types configured yet. Click \"Add Type\" to get started."}
                </td>
              </tr>
            )}
            {filtered.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-200/60">
                <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-800">{item.name}</td>
                <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-700">
                  Every {item.intervalKm.toLocaleString("en-IN")} km
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-blue-200 hover:text-blue-600 dark:border-gray-300/30 dark:text-gray-600 dark:hover:border-blue-400/40 dark:hover:text-blue-800"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-red-200 hover:text-red-500 dark:border-gray-300/30 dark:text-gray-600 dark:hover:border-red-300/50 dark:hover:text-red-400"
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
        title={editing ? "Edit Maintenance Type" : "Add Maintenance Type"}
        className="max-w-md"
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Field label="Maintenance Type Name *">
            <input
              className={inputClass}
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Engine oil change"
            />
          </Field>
          <Field label="Kilometer Interval *">
            <input
              type="number"
              className={inputClass}
              required
              min="1"
              step="1"
              value={form.intervalKm}
              onChange={(e) => setForm((f) => ({ ...f, intervalKm: e.target.value }))}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="e.g. 5000"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              How often this maintenance should be performed (in kilometers).
            </p>
          </Field>
          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-300/20">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-300/30 dark:text-gray-600 dark:hover:bg-gray-200/40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Type"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
