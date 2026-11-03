"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RiPriceTag3Line as Tag, RiAddLine as Plus, RiPencilLine as Pencil, RiDeleteBinLine as Trash2, RiLink as Link2, RiFlashlightLine as Zap, RiHistoryLine as History } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { sacCodesApi, type SacCodeEditEventRow } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/feedback";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import type { SacCode } from "@/types/sac-code";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { PillSearch } from "@/components/ui/PillSearch";
import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
const emptyForm = { description: "", code: "", gstRate: "" };

const EDIT_EVENT_ICON: Record<SacCodeEditEventRow["event"], typeof Plus> = {
  "SAC Code Created": Plus,
  "SAC Code Edited": Pencil,
  "SAC Code Deleted": Trash2,
};

const EDIT_EVENT_COLOR: Record<SacCodeEditEventRow["event"], string> = {
  "SAC Code Created": "bg-accent-surface-strong text-accent-text",
  "SAC Code Edited": "bg-warning-surface-strong text-warning-text",
  "SAC Code Deleted": "bg-danger-surface-strong text-danger-text",
};

const EXPENSE_HEADINGS = [
  "Hire Amount",
  "Lift On / Off",
  "Weight Sheet Expense",
  "Halt Pay",
  "Port Pass Expense",
  "Mamol Expense",
  "Claimable Mamol Expense",
  "Crane Operator",
  "Parking",
  "Toll Charges",
  "Other Expenses (Additional)",
];

export default function SacCodeManagementPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const [sacCodes, setSacCodes] = useState<SacCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SacCode | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [retrieveDialog, setRetrieveDialog] = useState<{ open: boolean; sc: SacCode | null }>({ open: false, sc: null });
  const [autoPopDialog, setAutoPopDialog] = useState<{ open: boolean; sc: SacCode | null }>({ open: false, sc: null });
  const [linking, setLinking] = useState(false);
  const [autoPopping, setAutoPopping] = useState(false);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<SacCodeEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    sacCodesApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  const isAdmin = user?.softwareDesignation === "Admin";
  const isAccounts = user?.softwareDesignation === "Accounts";
  const canView = isAdmin || isAccounts;
  const canEdit = isAdmin || isAccounts;

  useEffect(() => {
    if (ready && !canView) router.replace("/");
  }, [ready, canView, router]);

  useEffect(() => {
    sacCodesApi.list().then(setSacCodes).catch(() => {}).finally(() => setLoading(false));
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
    try {
      await sacCodesApi.delete(sc.id);
      setSacCodes((prev) => prev.filter((s) => s.id !== sc.id));
      showSuccess("SAC code deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete SAC code.");
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const payload = {
      description: form.description.trim(),
      code: form.code.trim(),
      gstRate: form.gstRate || "0",
    };
    try {
      if (editing) {
        const updated = await sacCodesApi.update(editing.id, payload);
        setSacCodes((prev) => prev.map((s) => (s.id === editing.id ? updated : s)));
        showSuccess("SAC code updated successfully.");
      } else {
        const created = await sacCodesApi.create(payload);
        setSacCodes((prev) => [...prev, created].sort((a, b) => a.code.localeCompare(b.code)));
        showSuccess("SAC code created successfully.");
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save SAC code.");
    }
  }

  async function handleLinkExpense(expense: string) {
    const sc = retrieveDialog.sc;
    if (!sc) return;
    setLinking(true);
    try {
      await sacCodesApi.linkExpense(sc.id, expense);
      const fresh = await sacCodesApi.list();
      setSacCodes(fresh);
      setRetrieveDialog({ open: false, sc: null });
      showSuccess(expense ? `Linked "${expense}" to ${sc.description}.` : "Linked expense removed.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to link expense.");
    } finally {
      setLinking(false);
    }
  }

  async function handleSetAutoPopulate(invoiceType: string | null) {
    const sc = autoPopDialog.sc;
    if (!sc) return;
    setAutoPopping(true);
    try {
      await sacCodesApi.setAutoPopulate(sc.id, invoiceType);
      const fresh = await sacCodesApi.list();
      setSacCodes(fresh);
      setAutoPopDialog({ open: false, sc: null });
      showSuccess(invoiceType ? `"${sc.description}" will auto-populate in ${invoiceType}.` : "Auto Populate setting removed.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update Auto Populate setting.");
    } finally {
      setAutoPopping(false);
    }
  }

  if (!ready || !canView) return null;
  if (loading) return <PageSkeleton hasButton={canEdit} hasSearch columns={4} />;

  const filteredSacCodes = sacCodes.filter((sc) => !searchQuery || sc.code.toLowerCase().includes(searchQuery.toLowerCase()) || sc.description.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
            <Tag className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">SAC Code Management</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Manage SAC (Services Accounting Codes) used for GST invoicing on transport services.
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
            {canEdit && (
              <button
                type="button"
                onClick={openAdd}
                className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md"
              >
                <Plus className="h-4 w-4" />
                SAC Code
              </button>
            )}
          </div>
      </div>

      {/* Toolbar: search on the left, View on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search codes..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto">
          <DownloadExcelButton path="/exports/sac-codes" filename="sac_codes.xlsx" />
        </div>
      </div>

      <div className="rounded-xl border border-separator-border bg-background-primary-default overflow-auto max-h-[75vh]">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-fill-1 border-b border-separator-border">
            <tr>
              <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary">Description of Service</th>
              <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary">SAC Code</th>
              <th className="px-4 py-3 text-right text-caption-1-semibold text-text-secondary">GST (%)</th>
              <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary">Linked Expense</th>
              <th className="px-4 py-3 text-left text-caption-1-semibold text-text-secondary">Auto Populate</th>
              {canEdit && <th className="px-4 py-3 text-right text-caption-1-semibold text-text-secondary">Actions</th>}
            </tr>
          </thead>
          <PagedTbody className="divide-y divide-separator-border" items={filteredSacCodes} head={<>{filteredSacCodes.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="p-0"><EmptyState size="compact" illustration="no-data" title="No SAC codes configured yet" description="Add one to get started" /></td>
              </tr>
            )}</>}>
            {(sc) => (
              <tr key={sc.id} className="hover:bg-fill-2 transition-colors">
                <td className="px-4 py-3 text-text-primary">{sc.description}</td>
                <td className="px-4 py-3 font-mono font-semibold text-text-primary">{sc.code}</td>
                <td className="px-4 py-3 text-right text-text-secondary">
                  {parseFloat(sc.gstRate) > 0 ? `${sc.gstRate}%` : <span className="text-text-tertiary">—</span>}
                </td>
                <td className="px-4 py-3">
                  {sc.linkedExpense ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface px-2.5 py-1 text-caption-1-medium text-accent-text border border-accent-border">
                      <Link2 className="h-3 w-3 flex-shrink-0" />
                      {sc.linkedExpense}
                    </span>
                  ) : (
                    <span className="text-xs text-text-tertiary">Not linked</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {sc.autoPopulateInvoiceType ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface px-2.5 py-1 text-caption-1-medium text-accent-text border border-accent-border">
                      <Zap className="h-3 w-3 flex-shrink-0" />
                      {sc.autoPopulateInvoiceType}
                    </span>
                  ) : (
                    <span className="text-xs text-text-tertiary">Not set</span>
                  )}
                </td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAutoPopDialog({ open: true, sc })}
                        title="Auto Populate"
                        className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-separator-border px-3.5 text-caption-1-medium text-text-secondary transition duration-200 hover:border-accent-border hover:bg-accent-surface-strong hover:text-accent-text"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Auto Populate
                      </button>
                      <button
                        type="button"
                        onClick={() => setRetrieveDialog({ open: true, sc })}
                        title="Retrieve Values From"
                        className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-separator-border px-3.5 text-caption-1-medium text-text-secondary transition duration-200 hover:border-accent-border hover:bg-accent-surface-strong hover:text-accent-text"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Retrieve Values From
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(sc)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-separator-border text-text-secondary transition duration-200 hover:border-accent-border hover:text-accent-text"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(sc)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-separator-border text-text-secondary transition duration-200 hover:border-danger-border hover:text-danger-text"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            )}
          </PagedTbody>
        </table>
      </div>

      {/* Add / Edit SAC Code dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? "Edit SAC Code" : "Add SAC Code"}
        className="max-w-xl"
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
            <DecimalInput type="number"
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
              {editing ? "Save Changes" : "Add SAC Code"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Retrieve Values From dialog */}
      <Dialog
        open={retrieveDialog.open}
        onClose={() => setRetrieveDialog({ open: false, sc: null })}
        title="Retrieve Values From"
        className="max-w-lg"
      >
        <div className="flex flex-col gap-3">
          {retrieveDialog.sc && (
            <p className="text-sm text-text-secondary">
              Select an expense heading to link to <span className="font-semibold text-text-primary">{retrieveDialog.sc.description}</span>.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {EXPENSE_HEADINGS.map((heading) => {
              const isLinked = retrieveDialog.sc?.linkedExpense === heading;
              return (
                <button
                  key={heading}
                  type="button"
                  disabled={linking}
                  onClick={() => handleLinkExpense(isLinked ? "" : heading)}
                  className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-body-medium text-left transition-colors disabled:opacity-50 ${
                    isLinked
                      ? "border-accent-border-strong bg-accent-surface text-accent-text"
                      : "border-separator-border text-text-primary hover:border-accent-border hover:bg-accent-surface-strong hover:text-accent-text"
                  }`}
                >
                  <span>{heading}</span>
                  {isLinked && <span className="text-caption-1-regular text-accent-text">Click to unlink</span>}
                </button>
              );
            })}
          </div>
          {retrieveDialog.sc?.linkedExpense && (
            <button
              type="button"
              disabled={linking}
              onClick={() => handleLinkExpense("")}
              className="mt-1 flex h-9 items-center justify-center gap-1.5 rounded-full border border-danger-border bg-danger-surface px-5 text-caption-1-semibold text-danger-text transition duration-300 hover:bg-danger-surface-strong disabled:pointer-events-none disabled:opacity-50"
            >
              Remove linked expense
            </button>
          )}
        </div>
      </Dialog>

      {/* Auto Populate dialog */}
      <Dialog
        open={autoPopDialog.open}
        onClose={() => setAutoPopDialog({ open: false, sc: null })}
        title="Auto Populate"
        className="max-w-lg"
      >
        <div className="flex flex-col gap-3">
          {autoPopDialog.sc && (
            <p className="text-sm text-text-secondary">
              Select an invoice type to auto-populate <span className="font-semibold text-text-primary">{autoPopDialog.sc.description}</span> as a service line whenever that invoice type is generated.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {/* Clear / remove option — shown prominently when a type is already set */}
            {autoPopDialog.sc?.autoPopulateInvoiceType && (
              <button
                type="button"
                disabled={autoPopping}
                onClick={() => handleSetAutoPopulate(null)}
                className="flex items-center justify-between rounded-lg border border-danger-border bg-danger-surface px-4 py-2.5 text-body-medium text-left text-danger-text transition-colors hover:bg-danger-surface-strong disabled:opacity-50"
              >
                <span>Remove Auto Populate</span>
                <span className="text-caption-1-regular text-danger-text">Currently: {autoPopDialog.sc.autoPopulateInvoiceType}</span>
              </button>
            )}
            {(["Transport Memo", "Tax Invoice", "Bill of Supply"] as const).map((type) => {
              const isActive = autoPopDialog.sc?.autoPopulateInvoiceType === type;
              const hasGst = parseFloat(autoPopDialog.sc?.gstRate ?? "0") > 0;
              const blockedByGst = type === "Transport Memo" && hasGst;
              return (
                <button
                  key={type}
                  type="button"
                  disabled={autoPopping || blockedByGst}
                  onClick={() => !blockedByGst && handleSetAutoPopulate(type)}
                  title={blockedByGst ? "Transport Memo is strictly no-GST — this SAC code carries a GST rate and cannot be assigned to Transport Memo" : undefined}
                  className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-body-medium text-left transition-colors disabled:cursor-not-allowed ${
                    blockedByGst
                      ? "border-separator-border bg-fill-1 text-text-tertiary"
                      : isActive
                      ? "border-accent-border-strong bg-accent-surface text-accent-text"
                      : "border-separator-border text-text-primary hover:border-accent-border hover:bg-accent-surface-strong hover:text-accent-text"
                  }`}
                >
                  <span>{type}</span>
                  {isActive && !blockedByGst && <span className="text-caption-1-regular text-accent-text">Currently set</span>}
                  {blockedByGst && <span className="text-caption-1-regular text-danger-text">GST code — not allowed</span>}
                </button>
              );
            })}
          </div>
        </div>
      </Dialog>

      {/* Edit History — every Create/Edit/Delete ever logged, across every
          SAC code, in one searchable log. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by code, description, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = editHistorySearch.toLowerCase();
            const filtered = editHistoryEvents.filter((ev) =>
              !q ||
              ev.code.toLowerCase().includes(q) ||
              ev.description.toLowerCase().includes(q) ||
              ev.actorName.toLowerCase().includes(q)
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration="not-found" title={editHistoryEvents.length === 0 ? "No SAC code edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">SAC Code</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Description</th>
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
                          <td className="px-3 py-2 font-mono font-semibold text-text-primary">{ev.code}</td>
                          <td className="px-3 py-2 text-text-secondary">{ev.description}</td>
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
