"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { inputClass } from "@/components/ui/Field";
import { vendorCategoriesApi } from "@/lib/api";
import { confirmDelete, showError } from "@/lib/swal";
import type { VendorCategory } from "@/types/vendor-category";

type VendorCategoryDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function VendorCategoryDialog({ open, onClose }: VendorCategoryDialogProps) {
  const [categories, setCategories] = useState<VendorCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    vendorCategoriesApi
      .list()
      .then(setCategories)
      .finally(() => setLoading(false));
  }, [open]);

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const created = await vendorCategoriesApi.create(trimmed);
      setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to add vendor category");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(category: VendorCategory) {
    const confirmed = await confirmDelete(category.name);
    if (!confirmed) return;
    try {
      await vendorCategoriesApi.delete(category.id);
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to delete vendor category");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Vendor Categories" className="sm:max-w-md">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="e.g. Electrician"
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !name.trim()}
            className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          {loading ? (
            <p className="py-4 text-center text-sm text-gray-400">Loading…</p>
          ) : categories.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No vendor categories yet.</p>
          ) : (
            categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <span className="text-sm text-gray-800">{category.name}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(category)}
                  aria-label={`Delete ${category.name}`}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
