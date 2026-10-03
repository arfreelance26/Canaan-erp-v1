"use client";

import { useAuth } from "@/context/AuthContext";
import { useEffect, useState, type FormEvent } from "react";
import { Wrench, Plus, Pencil, Trash2, FolderOpen, History } from "lucide-react";
import { maintenanceCategoriesApi, type MaintenanceCategoryEditEventRow } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import type { MaintenanceCategory, MaintenanceCategoryRepair } from "@/types/maintenance-category";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PillSearch } from "@/components/ui/PillSearch";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

const EDIT_EVENT_ICON: Record<MaintenanceCategoryEditEventRow["event"], typeof Plus> = {
  "Category Created": Plus,
  "Category Edited": Pencil,
  "Category Deleted": Trash2,
  "Repair Created": Plus,
  "Repair Edited": Pencil,
  "Repair Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<MaintenanceCategoryEditEventRow["event"], string> = {
  "Category Created": "bg-blue-100 text-blue-700",
  "Category Edited": "bg-amber-100 text-amber-700",
  "Category Deleted": "bg-red-100 text-red-700",
  "Repair Created": "bg-indigo-100 text-indigo-700",
  "Repair Edited": "bg-amber-100 text-amber-700",
  "Repair Deleted": "bg-red-100 text-red-700",
};

export default function MaintenanceManagementPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const [categories, setCategories] = useState<MaintenanceCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MaintenanceCategory | null>(null);
  const [categoryName, setCategoryName] = useState("");

  const [repairDialogCategory, setRepairDialogCategory] = useState<MaintenanceCategory | null>(null);
  const [editingRepair, setEditingRepair] = useState<MaintenanceCategoryRepair | null>(null);
  const [repairName, setRepairName] = useState("");

  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<MaintenanceCategoryEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    maintenanceCategoriesApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  function loadCategories() {
    return maintenanceCategoriesApi.list().then(setCategories).catch(() => {});
  }

  useEffect(() => {
    loadCategories().finally(() => setLoading(false));
  }, []);
  useAutoRefresh(() => { loadCategories(); }, 10000);

  function openAddCategory() {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryDialogOpen(true);
  }

  function openEditCategory(category: MaintenanceCategory) {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryDialogOpen(true);
  }

  async function handleSaveCategory(e: FormEvent) {
    e.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    try {
      if (editingCategory) {
        const updated = await maintenanceCategoriesApi.update(editingCategory.id, name, editingCategory.version);
        setCategories((prev) => prev.map((c) => (c.id === editingCategory.id ? { ...updated, repairs: c.repairs } : c)));
        showSuccess("Category updated successfully.");
      } else {
        const created = await maintenanceCategoriesApi.create(name);
        setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        showSuccess("Category added successfully.");
      }
      setCategoryDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save category.");
    }
  }

  async function handleDeleteCategory(category: MaintenanceCategory) {
    const result = await confirmDelete(
      category.repairs.length > 0
        ? `category "${category.name}" and its ${category.repairs.length} repair type${category.repairs.length > 1 ? "s" : ""}`
        : `category "${category.name}"`
    );
    if (!result.isConfirmed) return;
    try {
      await maintenanceCategoriesApi.delete(category.id);
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      showSuccess("Category deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete category.");
    }
  }

  function openAddRepair(category: MaintenanceCategory) {
    setRepairDialogCategory(category);
    setEditingRepair(null);
    setRepairName("");
  }

  function openEditRepair(category: MaintenanceCategory, repair: MaintenanceCategoryRepair) {
    setRepairDialogCategory(category);
    setEditingRepair(repair);
    setRepairName(repair.name);
  }

  async function handleSaveRepair(e: FormEvent) {
    e.preventDefault();
    if (!repairDialogCategory) return;
    const name = repairName.trim();
    if (!name) return;
    const categoryId = repairDialogCategory.id;
    try {
      if (editingRepair) {
        const updated = await maintenanceCategoriesApi.updateRepair(categoryId, editingRepair.id, name, editingRepair.version);
        setCategories((prev) => prev.map((c) =>
          c.id === categoryId ? { ...c, repairs: c.repairs.map((r) => (r.id === editingRepair.id ? updated : r)) } : c
        ));
        showSuccess("Repair type updated successfully.");
      } else {
        const created = await maintenanceCategoriesApi.createRepair(categoryId, name);
        setCategories((prev) => prev.map((c) =>
          c.id === categoryId ? { ...c, repairs: [...c.repairs, created].sort((a, b) => a.name.localeCompare(b.name)) } : c
        ));
        showSuccess("Repair type added successfully.");
      }
      setRepairDialogCategory(null);
      setEditingRepair(null);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save repair type.");
    }
  }

  async function handleDeleteRepair(category: MaintenanceCategory, repair: MaintenanceCategoryRepair) {
    const result = await confirmDelete(`repair type "${repair.name}"`);
    if (!result.isConfirmed) return;
    try {
      await maintenanceCategoriesApi.deleteRepair(category.id, repair.id);
      setCategories((prev) => prev.map((c) =>
        c.id === category.id ? { ...c, repairs: c.repairs.filter((r) => r.id !== repair.id) } : c
      ));
      showSuccess("Repair type deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete repair type.");
    }
  }

  if (loading) return <PageSkeleton hasButton hasSearch={false} cards cardCount={3} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Maintenance Management</h1>
            <p className="mt-0.5 text-sm text-gray-500">Organize repair types into categories</p>
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
            onClick={openAddCategory}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No categories yet. Click &ldquo;Add Category&rdquo; to create one.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {categories.map((category) => (
            <div key={category.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <FolderOpen className="h-4 w-4" />
                  </span>
                  <p className="truncate font-semibold text-gray-900">{category.name}</p>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    {category.repairs.length}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEditCategory(category)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-all duration-200 hover:scale-110 hover:border-blue-200 hover:text-blue-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(category)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-all duration-200 hover:scale-110 hover:border-red-200 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
                {category.repairs.length === 0 ? (
                  <p className="py-2 text-center text-xs text-gray-400">No repair types yet.</p>
                ) : (
                  category.repairs.map((repair) => (
                    <div
                      key={repair.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5"
                    >
                      <span className="truncate text-sm text-gray-700">{repair.name}</span>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => openEditRepair(category, repair)}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-blue-100 hover:text-blue-600"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRepair(category, repair)}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-100 hover:text-red-500"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => openAddRepair(category)}
                  className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-200 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Repair Type
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Category */}
      <Dialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        title={editingCategory ? "Edit Category" : "Add Category"}
        className="max-w-md"
      >
        <form onSubmit={handleSaveCategory} className="flex flex-col gap-4">
          <Field label="Category Name *">
            <input
              className={inputClass}
              required
              autoFocus
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="e.g. Engine"
            />
          </Field>
          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setCategoryDialogOpen(false)}
              className="flex h-10 items-center whitespace-nowrap rounded-full border border-gray-200 bg-white px-6 text-sm font-medium text-gray-600 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex h-10 items-center whitespace-nowrap rounded-full bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
            >
              {editingCategory ? "Save Changes" : "Add Category"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Add / Edit Repair Type */}
      <Dialog
        open={repairDialogCategory !== null}
        onClose={() => { setRepairDialogCategory(null); setEditingRepair(null); }}
        title={`${editingRepair ? "Edit" : "Add"} Repair Type — ${repairDialogCategory?.name ?? ""}`}
        className="max-w-md"
      >
        <form onSubmit={handleSaveRepair} className="flex flex-col gap-4">
          <Field label="Repair Type Name *">
            <input
              className={inputClass}
              required
              autoFocus
              value={repairName}
              onChange={(e) => setRepairName(e.target.value)}
              placeholder="e.g. Piston Repair"
            />
          </Field>
          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => { setRepairDialogCategory(null); setEditingRepair(null); }}
              className="flex h-10 items-center whitespace-nowrap rounded-full border border-gray-200 bg-white px-6 text-sm font-medium text-gray-600 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex h-10 items-center whitespace-nowrap rounded-full bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
            >
              {editingRepair ? "Save Changes" : "Add Repair Type"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Edit History — every Create/Edit/Delete ever logged, across every
          category AND every repair type nested under one, in one searchable
          log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by category, repair, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q ||
              ev.categoryName.toLowerCase().includes(q) ||
              (ev.repairName ?? "").toLowerCase().includes(q) ||
              ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No category or repair type edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Category</th>
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Repair Type</th>
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
                          <td className="px-3 py-2 font-semibold text-gray-800">{ev.categoryName}</td>
                          <td className="px-3 py-2 text-gray-600">{ev.repairName ?? <span className="text-gray-400">—</span>}</td>
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
