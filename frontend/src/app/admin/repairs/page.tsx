"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RiToolsLine as Wrench, RiAddLine as Plus, RiPencilLine as Pencil, RiDeleteBinLine as Trash2, RiHistoryLine as History } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { repairTypesApi, type RepairTypeEditEventRow } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/feedback";
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

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
const EDIT_EVENT_ICON: Record<RepairTypeEditEventRow["event"], typeof Plus> = {
  "Repair Type Created": Plus,
  "Repair Type Edited": Pencil,
  "Repair Type Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<RepairTypeEditEventRow["event"], string> = {
  "Repair Type Created": "bg-accent-surface-strong text-accent-text",
  "Repair Type Edited": "bg-warning-surface-strong text-warning-text",
  "Repair Type Deleted": "bg-danger-surface-strong text-danger-text",
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
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-border bg-orange-surface text-orange-text shadow-sm">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Repairs Management</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Manage repair types — these appear as quick-select options when logging major repairs on a trip sheet.
            </p>
          </div>
        </div>
          <div className="flex shrink-0 items-center gap-3">
            {isAdmin && (
<button
              type="button"
              onClick={openEditHistory}
              className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
            >
              <History className="h-4 w-4" />
              Edit History
            </button>
)}
            <button
              type="button"
              onClick={openAdd}
              className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md"
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

      <div className="rounded-xl border border-separator-border bg-background-primary-default overflow-auto max-h-[75vh]">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-fill-1 border-b border-separator-border">
            <tr>
              <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary">Repair Name</th>
              <th className="px-4 py-3 text-right text-caption-1-semibold text-text-secondary">Default Cost (₹)</th>
              <th className="px-4 py-3 text-right text-caption-1-semibold text-text-secondary">Actions</th>
            </tr>
          </thead>
          <PagedTbody className="divide-y divide-separator-border" items={filteredRepairs} head={<>{filteredRepairs.length === 0 && (
              <tr>
                <td colSpan={3} className="p-0"><EmptyState size="compact" illustration="no-data" title="No repair types configured yet" description="Add one to get started" /></td>
              </tr>
            )}</>}>
            {(rt) => (
              <tr key={rt.id} className="hover:bg-fill-2 transition-colors">
                <td className="px-4 py-3 font-medium text-text-primary">{rt.name}</td>
                <td className="px-4 py-3 text-right text-text-secondary">
                  {parseFloat(rt.defaultCost) > 0
                    ? `₹${parseFloat(rt.defaultCost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                    : <span className="text-text-tertiary">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(rt)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-separator-border text-text-secondary transition duration-200 hover:border-accent-border hover:text-accent-text"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(rt)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-separator-border text-text-secondary transition duration-200 hover:border-danger-border hover:text-danger-text"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </PagedTbody>
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
            <p className="mt-1 text-xs text-text-tertiary">
              Pre-fills the cost field when this repair is selected on a trip sheet.
            </p>
          </Field>
          <div className="flex justify-end gap-3 border-t border-separator-border pt-4">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="flex h-10 items-center whitespace-nowrap rounded-full border border-separator-border bg-background-primary-default px-6 text-body-medium text-text-secondary shadow-sm transition duration-300 hover:shadow-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex h-10 items-center whitespace-nowrap rounded-full bg-accent-solid px-6 text-body-semibold text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md"
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
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.name.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration="not-found" title={editHistoryEvents.length === 0 ? "No repair type edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Repair</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => {
                      const Icon = EDIT_EVENT_ICON[ev.event];
                      return (
                        <tr key={ev.id}>
                          <td className="px-3 py-2 font-semibold text-text-primary">{ev.name}</td>
                          <td className="px-3 py-2">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold", EDIT_EVENT_COLOR[ev.event])}>
                              <Icon className="h-3 w-3" /> {ev.event}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {ev.actorName}
                            {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                        </tr>
                      );
                    }}
                  </PagedTbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>
    </div>
  );
}
