"use client";

import { useEffect, useState } from "react";
import { RiAddLine as Plus, RiGroupLine as Users, RiHistoryLine as History, RiPencilLine as Pencil, RiDeleteBinLine as Trash2, RiArrowGoBackLine as Undo2, RiLockLine as Lock, RiLockUnlockLine as LockOpen } from "@remixicon/react";
import { useAuth } from "@/context/AuthContext";
import { StaffTable } from "@/components/staff/StaffTable";
import { StaffFormDialog, DRAFT_KEY as STAFF_DRAFT_KEY } from "@/components/staff/StaffFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { staffApi, uploadFile, fileUrl, type StaffEditEventRow, type StaffFreezeEventRow } from "@/lib/api";
import { confirmAction, confirmDelete, showSuccess, showError } from "@/lib/feedback";
import type { Staff } from "@/types/staff";
import type { StaffFiles } from "@/components/staff/StaffFormDialog";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

import { PillSearch } from "@/components/ui/PillSearch";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const FreezeAccountDialog = dynamic(() => import("@/components/staff/FreezeAccountDialog").then((m) => m.FreezeAccountDialog));
const StaffDetailDialog = dynamic(() => import("@/components/staff/StaffDetailDialog").then((m) => m.StaffDetailDialog));
const EDIT_EVENT_ICON: Record<StaffEditEventRow["event"], typeof Plus> = {
  "Staff Created": Plus,
  "Staff Edited": Pencil,
  "Staff Deleted": Trash2,
  "Staff Restored": Undo2,
};

const EDIT_EVENT_COLOR: Record<StaffEditEventRow["event"], string> = {
  "Staff Created": "bg-accent-surface-strong text-accent-text",
  "Staff Edited": "bg-warning-surface-strong text-warning-text",
  "Staff Deleted": "bg-danger-surface-strong text-danger-text",
  "Staff Restored": "bg-success-surface-strong text-success-text",
};

export default function StaffPage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewingStaff, setViewingStaff] = useState<Staff | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<StaffEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");
  // Freeze Account
  const [freezeTarget, setFreezeTarget] = useState<Staff | null>(null);
  const [frozenOnly, setFrozenOnly] = useState(false);
  const [freezeHistoryOpen, setFreezeHistoryOpen] = useState(false);
  const [freezeEvents, setFreezeEvents] = useState<StaffFreezeEventRow[]>([]);
  const [freezeHistoryLoading, setFreezeHistoryLoading] = useState(false);
  const [freezeHistorySearch, setFreezeHistorySearch] = useState("");

  function openFreezeHistory() {
    setFreezeHistoryOpen(true);
    setFreezeHistoryLoading(true);
    staffApi.listFreezeEvents()
      .then(setFreezeEvents)
      .catch(() => {})
      .finally(() => setFreezeHistoryLoading(false));
  }

  function handleFrozenChange(updated: Staff) {
    setStaff((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
    setViewingStaff((v) => (v && v.id === updated.id ? { ...v, ...updated } : v));
    setFreezeTarget(null);
  }

  // Fetched fresh every time it's opened, covering every staff edit ever
  // logged — searching by staff name/ID here doubles as that staff member's
  // own edit history.
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    staffApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  const frozenCount = staff.filter((s) => s.frozenAt).length;
  const filteredStaff = staff.filter(s =>
    (!frozenOnly || !!s.frozenAt) && (
    !searchQuery ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.staffId?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  useEffect(() => {
        staffApi.list().then(setStaff).catch(() => {}).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("staff_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("driver_updated", () => setRefreshKey(k => k + 1));

  function handleAdd() {
    setEditingStaff(null);
    setDialogOpen(true);
  }

  function handleEdit(member: Staff) {
    setEditingStaff(member);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    const result = await confirmDelete("staff member");
    if (!result.isConfirmed) return;
    try {
      await staffApi.delete(id);
      setStaff((prev) => prev.filter((member) => member.id !== id));
      showSuccess("Staff member deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete staff member.");
    }
  }

  async function handleResetDevice(id: string, name: string) {
    const result = await confirmAction(
      `Reset device binding for "${name}"?`,
      "The staff member will be able to log in from a new machine on their next login.",
      "Reset device",
    );
    if (!result.isConfirmed) return;
    try {
      await staffApi.resetDevice(id);
      setStaff((prev) => prev.map((m) => (m.id === id ? { ...m, deviceBound: false, devices: [] } : m)));
      setViewingStaff((v) => (v && v.id === id ? { ...v, deviceBound: false, devices: [] } : v));
      showSuccess("Device reset. The user can now log in from a new machine.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to reset device.");
    }
  }

  // Reset a single bound device from the staff detail view.
  async function handleResetOneDevice(staffDbId: string, deviceId: string, label: string) {
    const result = await confirmAction(
      `Reset "${label}"?`,
      "This device will need to log in and bind again on its next login.",
      "Reset device",
    );
    if (!result.isConfirmed) return;
    try {
      await staffApi.resetDevice(staffDbId, deviceId);
      const drop = (m: Staff): Staff => {
        const remaining = (m.devices ?? []).filter((d) => d.id !== deviceId);
        return { ...m, devices: remaining, deviceBound: remaining.length > 0 };
      };
      setStaff((prev) => prev.map((m) => (m.id === staffDbId ? drop(m) : m)));
      setViewingStaff((v) => (v && v.id === staffDbId ? drop(v) : v));
      showSuccess("Device removed. It can bind again on the next login.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to reset device.");
    }
  }

  async function handleSave(member: Staff, files: StaffFiles) {
    try {
      let saved: Staff;
      const exists = staff.some((existing) => existing.id === member.id);
      if (exists) {
        const newPassword = member.password?.trim() || undefined;
        saved = await staffApi.update(member.id, member, newPassword);
        setStaff((prev) => prev.map((existing) => (existing.id === saved.id ? saved : existing)));
      } else {
        saved = await staffApi.create(member, member.password ?? "");
        setStaff((prev) => [...prev, saved]);
        clearFormDraft(STAFF_DRAFT_KEY);
      }
      await Promise.all([
        files.photo    && uploadFile("staff", saved.id, "photo",    files.photo),
        files.aadhar   && uploadFile("staff", saved.id, "aadhar",   files.aadhar),
        files.identity && uploadFile("staff", saved.id, "identity", files.identity),
      ].filter(Boolean));
      if (files.photo || files.identity) {
        setStaff((prev) => prev.map((s) =>
          s.id === saved.id ? {
            ...s,
            photoUrl: files.photo ? fileUrl("staff", saved.id, "photo") : s.photoUrl,
            identityImageUrl: files.identity ? fileUrl("staff", saved.id, "identity") : s.identityImageUrl,
          } : s
        ));
      }
      setDialogOpen(false);
      showSuccess(exists ? "Staff member updated successfully." : "Staff member added successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save staff member.");
    }
  }

  async function handleDownloadPDF(member: Staff) {
    if (downloading) return;
    setDownloading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const marginX = 14;
      const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
      const fmtD = (d: string) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "—";

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(27, 43, 94);
      pdf.text("Staff Details", marginX, 18);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Generated on ${today}`, marginX, 24);
      pdf.text(member.staffId ?? "", pageW - marginX, 24, { align: "right" });

      pdf.setDrawColor(209, 213, 219);
      pdf.line(marginX, 27, pageW - marginX, 27);

      const sections: { heading: string; fields: [string, string][] }[] = [
        {
          heading: "General Information",
          fields: [
            ["Staff ID", member.staffId ?? "—"],
            ["Name", member.name ?? "—"],
            ["Department", member.department ?? "—"],
            ["Designation", member.designation ?? "—"],
            ["Software Designation", member.softwareDesignation ?? "—"],
            ["Contact Number", member.contactNumber ?? "—"],
            ["Email", member.email ?? "—"],
            ["Date of Birth", fmtD(member.dateOfBirth)],
            ["Date of Joining", fmtD(member.dateOfJoining)],
            ["Address", member.address ?? "—"],
          ],
        },
        {
          heading: "Identity Documents",
          fields: [
            ["Aadhaar Number", member.aadharNumber ?? "—"],
          ],
        },
      ];

      let y = 33;
      const lineH = 7;
      const sectionGap = 5;

      for (const section of sections) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setTextColor(27, 43, 94);
        pdf.text(section.heading.toUpperCase(), marginX, y);
        y += 4;
        pdf.setDrawColor(27, 43, 94);
        pdf.line(marginX, y, pageW - marginX, y);
        y += 4;

        for (const [label, value] of section.fields) {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8.5);
          pdf.setTextColor(100, 100, 100);
          pdf.text(label, marginX, y);
          pdf.setTextColor(30, 30, 30);
          pdf.setFont("helvetica", "bold");
          pdf.text(value, pageW / 2, y);
          y += lineH;
        }
        y += sectionGap;
      }

      pdf.save(`staff-${member.staffId ?? member.id}.pdf`);
    } catch {
      const { showError: se } = await import("@/lib/feedback");
      se("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <PageSkeleton hasButton hasSearch cards cardCount={8} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-success-border bg-success-surface text-success-text shadow-sm">
          <Users className="h-5 w-5" />
        </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Our Staff</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Manage staff records across all branches
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          {isAdmin && (
          <button
            type="button"
            onClick={openFreezeHistory}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-button-default bg-background-primary-default px-4 text-body-semibold text-text-primary shadow-sm transition duration-300 hover:bg-fill-2"
          >
            <Lock className="h-4 w-4" />
            Freeze History
          </button>
          )}
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add Staff
          </button>
        </div>
      </div>

      {/* Toolbar: search on the left, View on the right (same place as on the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search staff..." value={searchQuery} onChange={setSearchQuery} />
        {isAdmin && (frozenCount > 0 || frozenOnly) && (
          <button
            type="button"
            onClick={() => setFrozenOnly((v) => !v)}
            className={cn(
              "flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-body-semibold shadow-sm transition duration-300",
              frozenOnly ? "border-danger-border-strong bg-danger-surface text-danger-text" : "border-border-button-default bg-background-primary-default text-text-primary hover:bg-fill-2",
            )}
          >
            <Lock className="h-4 w-4" />
            Frozen ({frozenCount})
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <ReportViewButton
            path="/exports/resource-report"
            filename="Our_Staff.xlsx"
            title={`Our Staff Report — last 12 months${searchQuery.trim() ? ` — "${searchQuery.trim()}"` : ""}`}
            params={{ kind: "staff", ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}) }}
            pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
          />
        </div>
      </div>

      <StaffTable staff={filteredStaff} onView={setViewingStaff} onEdit={handleEdit} onDelete={handleDelete} onResetDevice={handleResetDevice} onFreeze={setFreezeTarget} />

      <FreezeAccountDialog staff={freezeTarget} onClose={() => setFreezeTarget(null)} onDone={handleFrozenChange} />

      <StaffFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingStaff}
      />

      <StaffDetailDialog
        staff={viewingStaff}
        onClose={() => setViewingStaff(null)}
        isAdmin={isAdmin}
        downloading={downloading}
        onDownloadPdf={(m) => handleDownloadPDF(m)}
        onResetDevice={handleResetOneDevice}
        onFreeze={setFreezeTarget}
      />

      {/* Freeze History — every Freeze / Unfreeze, newest first. Search by a
          name or ID for one staff member's history. */}
      <Dialog
        open={freezeHistoryOpen}
        onClose={() => setFreezeHistoryOpen(false)}
        title="Freeze History"
        className="sm:max-w-4xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by staff name, ID, reason, or actor…" value={freezeHistorySearch} onChange={setFreezeHistorySearch} />
          {freezeHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const q = freezeHistorySearch.toLowerCase();
            const filtered = freezeEvents.filter((ev) =>
              !q || [ev.staffIdStr, ev.staffName, ev.actorName, ev.reason].some((v) => v.toLowerCase().includes(q))
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={freezeEvents.length === 0 ? "no-data" : "not-found"} title={freezeEvents.length === 0 ? "No account has been frozen yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Staff</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Action</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Reason</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">By</th>
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">When</th>
                    </tr>
                  </thead>
                  <PagedTbody className="divide-y divide-separator-border" items={filtered}>
                    {(ev) => (
                      <tr key={ev.id}>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-text-primary">{ev.staffName}</p>
                          <p className="text-[11px] text-text-tertiary">{ev.staffIdStr}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption-2-semibold",
                            ev.event === "Frozen" ? "bg-danger-surface-strong text-danger-text" : "bg-success-surface-strong text-success-text")}>
                            {ev.event === "Frozen" ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />} {ev.event}
                          </span>
                        </td>
                        <td className="max-w-[260px] whitespace-pre-wrap break-words px-3 py-2 text-text-primary">{ev.reason}</td>
                        <td className="px-3 py-2 text-text-secondary">
                          {ev.actorName}
                          {ev.actorRole && <span className="text-[11px] text-text-tertiary"> ({ev.actorRole})</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{formatDateTime(ev.createdAt)}</td>
                      </tr>
                    )}
                  </PagedTbody>
                </table>
              </div>
            );
          })()}
        </div>
      </Dialog>

      {/* Edit History — every Create/Edit/Delete/Restore ever logged, across
          every staff member (not just the ones currently on this page), in
          one searchable log instead of having to open each staff member
          individually. Searching by a specific name/ID doubles as that
          staff member's own history. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by staff name, ID, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.staffIdStr.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.staffName.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "no-data" : "not-found"} title={editHistoryEvents.length === 0 ? "No staff edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Staff</th>
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
                          <td className="px-3 py-2">
                            <p className="font-semibold text-text-primary">{ev.staffName}</p>
                            <p className="text-[11px] text-text-tertiary">{ev.staffIdStr}</p>
                          </td>
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
