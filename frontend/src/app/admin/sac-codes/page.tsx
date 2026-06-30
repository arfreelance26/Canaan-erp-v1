"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Tag, Plus, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { sacCodesApi } from "@/lib/api";
import { confirmDelete } from "@/lib/swal";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import type { SacCode } from "@/types/sac-code";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

const emptyForm = { description: "", code: "", gstRate: "" };

export default function SacCodeManagementPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const [sacCodes, setSacCodes] = useState<SacCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SacCode | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (ready && user?.softwareDesignation !== "Admin") router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    sacCodesApi.list().then(setSacCodes).finally(() => setLoading(false));
  }, []);

  useAutoRefresh(() => { sacCodesApi.list().then(setSacCodes); }, 10000);

  function updateForm(key: keyof typeof emptyForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(sc: SacCode) {
    setEditing(sc);
    setForm({
      description: sc.description,
      code: sc.code,
      gstRate: sc.gstRate === "0" ? "" : sc.gstRate,
    });
    setDialogOpen(true);
  }

  async function handleDelete(sc: SacCode) {
    const result = await confirmDelete("SAC code");
    if (!result.isConfirmed) return;
    await sacCodesApi.delete(sc.id);
    setSacCodes((prev) => prev.filter((s) => s.id !== sc.id));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const payload = {
      description: form.description.trim(),
      code: form.code.trim(),
      gstRate: form.gstRate || "0",
    };
    if (editing) {
      const updated = await sacCodesApi.update(editing.id, payload);
      setSacCodes((prev) => prev.map((s) => (s.id === editing.id ? updated : s)));
    } else {
      const created = await sacCodesApi.create(payload);
      setSacCodes((prev) => [...prev, created].sort((a, b) => a.code.localeCompare(b.code)));
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
            <Tag className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">SAC Code Management</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Manage SAC (Services Accounting Codes) used for GST invoicing on transport services.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add SAC Code
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Description of Service</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">SAC Code</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">GST (%)</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sacCodes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  No SAC codes configured yet. Add one to get started.
                </td>
              </tr>
            )}
            {sacCodes.map((sc) => (
              <tr key={sc.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-700">{sc.description}</td>
                <td className="px-4 py-3 font-mono font-semibold text-gray-800">{sc.code}</td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {parseFloat(sc.gstRate) > 0 ? `${sc.gstRate}%` : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(sc)}
                      className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-blue-200 hover:text-blue-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(sc)}
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
        title={editing ? "Edit SAC Code" : "Add SAC Code"}
        className="max-w-md"
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <Field label="Description of Service *">
            <input
              className={inputClass}
              required
              value={form.description}
              onChange={(e) => updateForm("description", e.target.value)}
              placeholder="e.g. Goods Transport Services"
            />
          </Field>
          <Field label="SAC Code *">
            <input
              className={inputClass}
              required
              value={form.code}
              onChange={(e) => updateForm("code", e.target.value)}
              placeholder="e.g. 9965"
            />
          </Field>
          <Field label="GST (%)">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputClass}
              value={form.gstRate}
              onChange={(e) => updateForm("gstRate", e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="e.g. 5"
            />
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
              {editing ? "Save Changes" : "Add SAC Code"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
