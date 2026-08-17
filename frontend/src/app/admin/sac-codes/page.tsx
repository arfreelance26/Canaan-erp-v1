"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Tag, Plus, Pencil, Trash2, Search, Link2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { sacCodesApi } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import type { SacCode } from "@/types/sac-code";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { DecimalInput } from "@/components/ui/DecimalInput";

const emptyForm = { description: "", code: "", gstRate: "" };

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
        <div>
          <div className="flex items-center gap-2">
            <Tag className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">SAC Code Management</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Manage SAC (Services Accounting Codes) used for GST invoicing on transport services.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search codes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/sac-codes" filename="sac_codes.xlsx" />
          {canEdit && (
            <button
              type="button"
              onClick={openAdd}
              className="flex items-center whitespace-nowrap gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              SAC Code
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-auto max-h-[75vh]">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Description of Service</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">SAC Code</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">GST (%)</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Linked Expense</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Auto Populate</th>
              {canEdit && <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredSacCodes.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-4 py-8 text-center text-sm text-gray-400">
                  No SAC codes configured yet. Add one to get started.
                </td>
              </tr>
            )}
            {filteredSacCodes.map((sc) => (
              <tr key={sc.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-700">{sc.description}</td>
                <td className="px-4 py-3 font-mono font-semibold text-gray-800">{sc.code}</td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {parseFloat(sc.gstRate) > 0 ? `${sc.gstRate}%` : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  {sc.linkedExpense ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-100">
                      <Link2 className="h-3 w-3 flex-shrink-0" />
                      {sc.linkedExpense}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Not linked</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {sc.autoPopulateInvoiceType ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 border border-violet-100">
                      <Zap className="h-3 w-3 flex-shrink-0" />
                      {sc.autoPopulateInvoiceType}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Not set</span>
                  )}
                </td>
                {canEdit && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAutoPopDialog({ open: true, sc })}
                        title="Auto Populate"
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:border-violet-200 hover:text-violet-600 hover:bg-violet-50"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Auto Populate
                      </button>
                      <button
                        type="button"
                        onClick={() => setRetrieveDialog({ open: true, sc })}
                        title="Retrieve Values From"
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-200 hover:text-blue-600 hover:bg-blue-50"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Retrieve Values From
                      </button>
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
                )}
              </tr>
            ))}
          </tbody>
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

      {/* Retrieve Values From dialog */}
      <Dialog
        open={retrieveDialog.open}
        onClose={() => setRetrieveDialog({ open: false, sc: null })}
        title="Retrieve Values From"
        className="max-w-lg"
      >
        <div className="flex flex-col gap-3">
          {retrieveDialog.sc && (
            <p className="text-sm text-gray-500">
              Select an expense heading to link to <span className="font-semibold text-gray-700">{retrieveDialog.sc.description}</span>.
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
                  className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-medium text-left transition-colors disabled:opacity-50 ${
                    isLinked
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                >
                  <span>{heading}</span>
                  {isLinked && <span className="text-xs text-blue-500 font-normal">Click to unlink</span>}
                </button>
              );
            })}
          </div>
          {retrieveDialog.sc?.linkedExpense && (
            <button
              type="button"
              disabled={linking}
              onClick={() => handleLinkExpense("")}
              className="mt-1 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
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
            <p className="text-sm text-gray-500">
              Select an invoice type to auto-populate <span className="font-semibold text-gray-700">{autoPopDialog.sc.description}</span> as a service line whenever that invoice type is generated.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {/* Clear / remove option — shown prominently when a type is already set */}
            {autoPopDialog.sc?.autoPopulateInvoiceType && (
              <button
                type="button"
                disabled={autoPopping}
                onClick={() => handleSetAutoPopulate(null)}
                className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-left text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
              >
                <span>Remove Auto Populate</span>
                <span className="text-xs font-normal text-red-400">Currently: {autoPopDialog.sc.autoPopulateInvoiceType}</span>
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
                  className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-medium text-left transition-colors disabled:cursor-not-allowed ${
                    blockedByGst
                      ? "border-gray-100 bg-gray-50 text-gray-300"
                      : isActive
                      ? "border-violet-300 bg-violet-50 text-violet-700"
                      : "border-gray-200 text-gray-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                  }`}
                >
                  <span>{type}</span>
                  {isActive && !blockedByGst && <span className="text-xs text-violet-500 font-normal">Currently set</span>}
                  {blockedByGst && <span className="text-xs text-red-400 font-normal">GST code — not allowed</span>}
                </button>
              );
            })}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
