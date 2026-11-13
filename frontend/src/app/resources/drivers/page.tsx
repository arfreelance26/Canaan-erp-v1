"use client";

import { useEffect, useState } from "react";
import { RiDownloadLine as Download, RiFileTextLine as FileText, RiLoader4Line as Loader2, RiAddLine as Plus, RiCloseLine as X, RiProfileLine as IdCard, RiHistoryLine as History, RiPencilLine as Pencil, RiDeleteBinLine as Trash2, RiArrowGoBackLine as Undo2 } from "@remixicon/react";
import { DriverTable } from "@/components/drivers/DriverTable";
import { DriverFormDialog, DRAFT_KEY as DRIVER_DRAFT_KEY } from "@/components/drivers/DriverFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { driversApi, uploadFile, fileUrl, editApprovalsApi, deletionApprovalsApi, type DriverEditEventRow } from "@/lib/api";
import { confirmAction, showSuccess, showError } from "@/lib/feedback";
import type { Driver } from "@/types/driver";
import type { DriverFiles } from "@/components/drivers/DriverFormDialog";
import type { EditApprovalRequest, EditApprovalAction } from "@/types/edit-approval";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { ReportViewButton } from "@/components/ui/ReportViewButton";
import type { ResourceReport } from "@/lib/resource-report-pdf";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { ReminderAlertBanner } from "@/components/ui/ReminderAlertBanner";

import { PillSearch } from "@/components/ui/PillSearch";

import { EmptyState } from "@/components/ui/EmptyState";
import dynamic from "next/dynamic";
import { PagedTbody } from "@/components/ui/PagedTbody";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const EditRequestDialog = dynamic(() => import("@/components/attendance/EditRequestDialog").then((m) => m.EditRequestDialog));
const FileViewer = dynamic(() => import("@/components/ui/FileViewer").then((m) => m.FileViewer));
const EDIT_EVENT_ICON: Record<DriverEditEventRow["event"], typeof Plus> = {
  "Driver Created": Plus,
  "Driver Edited": Pencil,
  "Driver Deleted": Trash2,
  "Driver Restored": Undo2,
};

const EDIT_EVENT_COLOR: Record<DriverEditEventRow["event"], string> = {
  "Driver Created": "bg-accent-surface-strong text-accent-text",
  "Driver Edited": "bg-warning-surface-strong text-warning-text",
  "Driver Deleted": "bg-danger-surface-strong text-danger-text",
  "Driver Restored": "bg-success-surface-strong text-success-text",
};
export default function DriversPage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  // License-expiry reminders used to only surface as "Renewals & Payments"
  // in the Topbar bell — lives here now, where you'd actually come to
  // update a driver's license. See routers/notifications.py's reminders
  // endpoint: "license" kind, href already points at this page.
  const { reminders } = useNotifications();
  const licenseReminders = reminders.filter((r) => r.kind === "license");
  const isCommercialManagerRole = user?.softwareDesignation === "Commercial Manager";
  const isCommercialManager =
    isCommercialManagerRole || user?.softwareDesignation === "Assistant Commercial Manager";
  // Every role except Admin and Commercial Manager must file an edit request to
  // change driver records. Assistant Commercial Manager is intentionally still
  // gated here (unlike on "Our Fleet") — only asked to change for Commercial
  // Manager specifically.
  const isGated = !isAdmin && !isCommercialManagerRole;
  // Admin deletes directly. Commercial Manager / Assistant Commercial Manager can
  // see the delete button too, but it files a DeletionApprovalRequest instead —
  // the driver is only soft-deleted once an Admin approves it on the "Deletion
  // Approvals" page. Backend enforces the same split (drivers.py's delete_driver
  // is Admin-only; deletion_approvals.py's approve_deletion does the actual
  // soft-delete for everyone else).
  const canDelete = isAdmin || isCommercialManager;
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewingDriver, setViewingDriver] = useState<Driver | null>(null);
  const [viewingFile, setViewingFile] = useState<{ url: string; title: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<DriverEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every driver edit ever
  // logged — searching by driver name/ID here doubles as that driver's own
  // edit history.
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    driversApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  // Edit approval state (non-Admin roles)
  const [activeApprovals, setActiveApprovals] = useState<EditApprovalRequest[]>([]);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: EditApprovalAction; resourceId: string; resourceName: string } | null>(null);
  // Deletion request state (Commercial Manager / Assistant Commercial Manager)
  const [deleteRequestDriver, setDeleteRequestDriver] = useState<Driver | null>(null);

  const filteredDrivers = drivers.filter(d =>
    !searchQuery ||
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.driverId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
        driversApi.list().then(setDrivers).catch(() => {}).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("driver_updated", () => setRefreshKey(k => k + 1));

  // Load and refresh active edit approvals for non-Admin roles
  useEffect(() => {
    if (!isGated) return;
    editApprovalsApi.getMyActive().then(setActiveApprovals).catch(() => {});
  }, [isGated]);
  useWebSocketEvent("edit_approval_updated", () => {
    if (!isGated) return;
    editApprovalsApi.getMyActive().then(setActiveApprovals).catch(() => {});
  });

  function hasActiveApproval(resourceId: string, action: EditApprovalAction): boolean {
    return activeApprovals.some((a) =>
      a.resourceType === "Driver" &&
      String(a.resourceId) === resourceId &&
      a.action === action &&
      a.expiresAt != null &&
      new Date(a.expiresAt.endsWith("Z") ? a.expiresAt : a.expiresAt + "Z") > new Date()
    );
  }

  function handleAdd() {
    setEditingDriver(null);
    setDialogOpen(true);
  }

  function handleEdit(driver: Driver) {
    if (isGated && !hasActiveApproval(driver.id, "Edit")) {
      setPendingAction({ type: "Edit", resourceId: driver.id, resourceName: driver.name });
      setEditRequestOpen(true);
      return;
    }
    setEditingDriver(driver);
    setDialogOpen(true);
  }

  async function handleEditRequestSubmit(reason: string) {
    if (!pendingAction) return;
    try {
      await editApprovalsApi.create({
        resourceType: "Driver",
        resourceId: parseInt(pendingAction.resourceId),
        resourceName: pendingAction.resourceName,
        action: pendingAction.type,
        reason,
      });
      showSuccess("Edit request has been sent.");
      setEditRequestOpen(false);
      setPendingAction(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to send edit request.");
    }
  }

  async function handleDelete(id: string) {
    if (!isAdmin) {
      const driver = drivers.find((d) => d.id === id);
      if (driver) setDeleteRequestDriver(driver);
      return;
    }
    const result = await confirmAction(
      "Delete this driver?",
      "They'll be removed from Our Drivers and assignment lists, but their trip history, attendance, and compensation records are kept intact and will keep showing their name.",
      "Yes, delete"
    );
    if (!result.isConfirmed) return;
    try {
      await driversApi.delete(id);
      setDrivers((prev) => prev.filter((d) => d.id !== id));
      showSuccess("Driver deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete driver.");
    }
  }

  async function handleDeleteRequestSubmit(reason: string) {
    if (!deleteRequestDriver) return;
    try {
      await deletionApprovalsApi.create({
        resourceType: "Driver",
        resourceId: parseInt(deleteRequestDriver.id),
        resourceName: `${deleteRequestDriver.driverId} — ${deleteRequestDriver.name}`,
        reason,
      });
      showSuccess("Delete request sent to Admin — you'll see it approved or rejected on the Deletion Approvals page.");
      setDeleteRequestDriver(null);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to send delete request.");
    }
  }

  async function handleSave(driver: Driver, files: DriverFiles) {
    try {
      let saved: Driver;
      if (editingDriver) {
        saved = await driversApi.update(driver.id, driver, driver.password || undefined);
        setDrivers((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
      } else {
        saved = await driversApi.create(driver, driver.password);
        setDrivers((prev) => [...prev, saved]);
        clearFormDraft(DRIVER_DRAFT_KEY);
      }
      // Upload files to BLOB storage
      await Promise.all([
        files.photo   && uploadFile("drivers", saved.id, "photo",   files.photo),
        files.aadhaar && uploadFile("drivers", saved.id, "aadhaar", files.aadhaar),
        files.license && uploadFile("drivers", saved.id, "license", files.license),
      ].filter(Boolean));
      // Set photo URL to the backend file endpoint so the avatar renders from DB
      if (files.photo) {
        setDrivers((prev) => prev.map((d) =>
          d.id === saved.id ? { ...d, photoUrl: fileUrl("drivers", saved.id, "photo") } : d
        ));
      }
      setDialogOpen(false);
      showSuccess(editingDriver ? "Driver updated successfully." : "Driver added successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save driver.");
    }
  }

  async function handleDownloadPDF(driver: Driver) {
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
      pdf.text("Driver Details", marginX, 18);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Generated on ${today}`, marginX, 24);
      pdf.text(driver.driverId ?? "", pageW - marginX, 24, { align: "right" });

      pdf.setDrawColor(209, 213, 219);
      pdf.line(marginX, 27, pageW - marginX, 27);

      const sections: { heading: string; fields: [string, string][] }[] = [
        {
          heading: "General Information",
          fields: [
            ["Driver ID", driver.driverId ?? "—"],
            ["Name", driver.name ?? "—"],
            ["Contact Number", driver.contactNumber ?? "—"],
            ["Email", driver.email ?? "—"],
            ["Date of Birth", fmtD(driver.dateOfBirth)],
            ["Date of Joining", fmtD(driver.dateOfJoining)],
            ["Address", driver.address ?? "—"],
          ],
        },
        {
          heading: "License & Identity",
          fields: [
            ["Aadhaar Number", driver.aadhaarNumber ?? "—"],
            ["License Number", driver.licenseNumber ?? "—"],
            ["License Expiry", fmtD(driver.licenseExpiryDate)],
            ["PAN Number", driver.panNumber ?? "—"],
            ["ESI Number", driver.esiNumber ?? "—"],
            ["Form 11", driver.form11 ?? "—"],
            ["Agreement Signed", driver.agreementSigned ? "Yes" : "No"],
          ],
        },
        {
          heading: "Banking Details",
          fields: [
            ["Bank Name", driver.bankName ?? "—"],
            ["Branch Name", driver.bankBranchName ?? "—"],
            ["Account Number", driver.accountNumber ?? "—"],
            ["IFSC Code", driver.ifscCode ?? "—"],
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

      pdf.save(`driver-${driver.driverId ?? driver.id}.pdf`);
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
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-border bg-accent-surface text-accent-text shadow-sm">
          <IdCard className="h-5 w-5" />
        </span>
          <div>
            <h1 className="text-title-1-semibold tracking-tight text-text-primary">Our Drivers</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Manage driver records across all branches
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
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-accent-solid px-5 text-body-medium text-on-solid shadow-sm transition duration-300 hover:bg-accent-solid-hover hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add Driver
          </button>
        </div>
      </div>

      <ReminderAlertBanner items={licenseReminders} />

      {/* Toolbar: search on the left, View on the right (same place as on the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search drivers..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* A file per driver: Summary + one sheet each, last 12 months, IDs masked (+ its PDF). */}
          <ReportViewButton
            path="/exports/resource-report"
            filename="Our_Drivers.xlsx"
            title={`Our Drivers Report — last 12 months${searchQuery.trim() ? ` — "${searchQuery.trim()}"` : ""}`}
            params={{ kind: "drivers", ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}) }}
            pdf={(report, file) => import("@/lib/resource-report-pdf").then((m) => m.downloadResourceReportPdf({ report: report as ResourceReport, filename: file }))}
          />
        </div>
      </div>

      <div>
        <DriverTable drivers={filteredDrivers} onView={setViewingDriver} onEdit={handleEdit} onDelete={canDelete ? handleDelete : undefined} />
      </div>

      <DriverFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingDriver}
      />

      {/* Edit approval request dialog — shown when a non-Admin clicks Edit without active approval */}
      {pendingAction && (
        <EditRequestDialog
          open={editRequestOpen}
          resourceType="Driver"
          resourceName={pendingAction.resourceName}
          action={pendingAction.type}
          onSubmit={handleEditRequestSubmit}
          onClose={() => { setEditRequestOpen(false); setPendingAction(null); }}
        />
      )}

      {/* Delete request dialog — Commercial Manager / Assistant Commercial Manager
          submit this with a reason instead of deleting directly; it lands on the
          Admin's "Deletion Approvals" page for approval. */}
      {deleteRequestDriver && (
        <EditRequestDialog
          open={deleteRequestDriver !== null}
          resourceType="Driver"
          resourceName={`${deleteRequestDriver.driverId} — ${deleteRequestDriver.name}`}
          action="Delete"
          onSubmit={handleDeleteRequestSubmit}
          onClose={() => setDeleteRequestDriver(null)}
        />
      )}

      <FileViewer
        open={!!viewingFile}
        onClose={() => setViewingFile(null)}
        url={viewingFile?.url ?? ""}
        title={viewingFile?.title ?? ""}
      />

      {viewingDriver && (() => {
        const d = viewingDriver;
        const fmtD = (v: string) => v ? new Date(v + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "—";
        const isExpired = (v: string) => !!v && new Date(v) < new Date();
        const Field = ({ label, value, expired }: { label: string; value: string; expired?: boolean }) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-caption-1-medium text-text-tertiary">{label}</span>
            <span className={`text-body-medium ${expired ? "text-danger-text" : "text-text-primary"}`}>{value || "—"}</span>
          </div>
        );
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-scrim/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setViewingDriver(null); }}>
            <div className="w-full max-w-2xl rounded-xl bg-background-primary-default shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
                <div>
                  <p className="font-semibold text-text-primary">{d.driverId} — {d.name}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{d.contactNumber} · {d.email}</p>
                </div>
                <button type="button" onClick={() => setViewingDriver(null)} className="rounded-lg p-1.5 text-text-tertiary hover:bg-fill-3">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">
                <div>
                  <p className="text-caption-1-semibold text-accent-text mb-3">General Information</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Field label="Driver ID" value={d.driverId} />
                    <Field label="Name" value={d.name} />
                    <Field label="Contact Number" value={d.contactNumber} />
                    <Field label="Email" value={d.email} />
                    <Field label="Date of Birth" value={fmtD(d.dateOfBirth)} />
                    <Field label="Date of Joining" value={fmtD(d.dateOfJoining)} />
                    <Field label="Address" value={d.address} />
                  </div>
                </div>

                <div>
                  <p className="text-caption-1-semibold text-accent-text mb-3">License & Identity</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Field label="Aadhaar Number" value={d.aadhaarNumber} />
                    <Field label="License Number" value={d.licenseNumber} />
                    <Field label="License Expiry" value={fmtD(d.licenseExpiryDate)} expired={isExpired(d.licenseExpiryDate)} />
                    <Field label="PAN Number" value={d.panNumber} />
                    <Field label="ESI Number" value={d.esiNumber} />
                    <Field label="Form 11" value={d.form11} />
                    <Field label="Agreement Signed" value={d.agreementSigned ? "Yes" : "No"} />
                  </div>
                </div>

                <div>
                  <p className="text-caption-1-semibold text-accent-text mb-3">Banking Details</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Field label="Bank Name" value={d.bankName} />
                    <Field label="Branch Name" value={d.bankBranchName} />
                    <Field label="Account Number" value={d.accountNumber} />
                    <Field label="IFSC Code" value={d.ifscCode} />
                  </div>
                </div>

                {(d.photoUrl || d.aadhaarFileName || d.licenseFileName) && (
                  <div>
                    <p className="text-caption-1-semibold text-accent-text mb-3">Uploaded Documents</p>
                    <div className="flex flex-wrap gap-3">
                      {d.photoUrl && (
                        <button type="button" onClick={() => setViewingFile({ url: fileUrl("drivers", d.id, "photo"), title: `${d.name} — Photo` })}
                          className="flex items-center gap-2 rounded-lg border border-accent-border bg-accent-surface px-3 py-2 text-caption-1-medium text-accent-text transition-colors hover:bg-accent-surface-strong">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> Photo
                        </button>
                      )}
                      {d.aadhaarFileName && (
                        <button type="button" onClick={() => setViewingFile({ url: fileUrl("drivers", d.id, "aadhaar"), title: `${d.name} — Aadhaar` })}
                          className="flex items-center gap-2 rounded-lg border border-accent-border bg-accent-surface px-3 py-2 text-caption-1-medium text-accent-text transition-colors hover:bg-accent-surface-strong">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> Aadhaar
                        </button>
                      )}
                      {d.licenseFileName && (
                        <button type="button" onClick={() => setViewingFile({ url: fileUrl("drivers", d.id, "license"), title: `${d.name} — License` })}
                          className="flex items-center gap-2 rounded-lg border border-accent-border bg-accent-surface px-3 py-2 text-caption-1-medium text-accent-text transition-colors hover:bg-accent-surface-strong">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> License
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t px-5 py-3 flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={async () => { await handleDownloadPDF(d); setViewingDriver(null); }}
                  disabled={downloading}
                  className="flex items-center gap-2 rounded-lg border border-danger-border bg-danger-surface px-4 py-2 text-body-medium text-danger-text hover:bg-danger-surface-strong disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {downloading ? "Generating..." : "Download PDF"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit History — every Create/Edit/Delete/Restore ever logged, across
          every driver (not just the ones currently on this page), in one
          searchable log instead of having to open each driver individually.
          Searching by a specific driver name/ID doubles as that driver's
          own history. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by driver name, ID, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-text-tertiary">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.driverIdStr.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.driverName.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <EmptyState size="compact" illustration={editHistoryEvents.length === 0 ? "logistics" : "not-found"} title={editHistoryEvents.length === 0 ? "No driver edits have been logged yet" : "No history matches this search"} />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-separator-border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-fill-1">
                    <tr className="border-b border-separator-border">
                      <th className="px-3 py-2 text-caption-2-semibold text-text-tertiary">Driver</th>
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
                            <p className="font-semibold text-text-primary">{ev.driverName}</p>
                            <p className="text-[11px] text-text-tertiary">{ev.driverIdStr}</p>
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
