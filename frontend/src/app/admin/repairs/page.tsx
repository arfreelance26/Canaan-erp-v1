"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Wrench, Plus, Pencil, Trash2, History } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { repairTypesApi, type RepairTypeEditEventRow } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import type { RepairType } from "@/types/repair-type";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { PillSearch } from "@/components/ui/PillSearch";

const EDIT_EVENT_ICON: Record<RepairTypeEditEventRow["event"], typeof Plus> = {
  "Repair Type Created": Plus,
  "Repair Type Edited": Pencil,
  "Repair Type Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<RepairTypeEditEventRow["event"], string> = {
  "Repair Type Created": "bg-blue-100 text-blue-700",
  "Repair Type Edited": "bg-amber-100 text-amber-700",
  "Repair Type Deleted": "bg-red-100 text-red-700",
};

export default function RepairsManagementPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const { user, ready } = useAuth();
  const router = useRouter();

  const [repairs, setRepairs] = useState<RepairType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RepairType | null>(null);
  const [form, setForm] = useState({ name: "", defaultCost: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<RepairTypeEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    repairTypesApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  const ALLOWED = ["Admin", "Commercial Manager", "Assistant Commercial Manager", "Yard Supervisor", "Trip Sheet Register"];
  useEffect(() => {
    if (ready && user && !ALLOWED.includes(user.softwareDesignation)) router.replace("/");
  }, [ready, user, router]);

  useEffect(() => {
    repairTypesApi.list().then(setRepairs).catch(() => {}).finally(() => setLoading(false));
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

  if (!ready || !user || !ALLOWED.includes(user.softwareDesignation)) return null;
  if (loading) return <PageSkeleton hasButton hasSearch columns={3} />;

  const filteredRepairs = repairs.filter((rt) => !searchQuery || rt.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white text-orange-600 shadow-sm">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Repairs Management</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Manage repair types — these appear as quick-select options when logging major repairs on a trip sheet.
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
              onClick={openAdd}
              className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
            >
              <Plus className="h-4 w-4" />
              Add Repair Type
            </button>
          </div>
      </div>

      {/* Toolbar: search on the left, View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search repairs..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto">
          <DownloadExcelButton path="/exports/repair-types" filename="repair_types.xlsx" />
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
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-all duration-200 hover:scale-110 hover:border-blue-200 hover:text-blue-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rt)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-all duration-200 hover:scale-110 hover:border-red-200 hover:text-red-500"
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
              className="flex h-10 items-center whitespace-nowrap rounded-full border border-gray-200 bg-white px-6 text-sm font-medium text-gray-600 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex h-10 items-center whitespace-nowrap rounded-full bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
            >
              {editing ? "Save Changes" : "Add Repair Type"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Edit History — every Create/Edit/Delete ever logged, across every
          repair type, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by repair name or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
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
                {editHistoryEvents.length === 0 ? "No repair type edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Repair</th>
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
