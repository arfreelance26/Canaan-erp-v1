"use client";

import { useEffect, useState } from "react";
import { Plus, Search, X, Download, FileText, Loader2 } from "lucide-react";
import { TruckTable } from "@/components/fleet/TruckTable";
import { TruckFormDialog, DRAFT_KEY as TRUCK_DRAFT_KEY } from "@/components/fleet/TruckFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { EditRequestDialog } from "@/components/attendance/EditRequestDialog";
import { BranchChangeNoteDialog } from "@/components/fleet/BranchChangeNoteDialog";
import { BranchHistoryDialog } from "@/components/fleet/BranchHistoryDialog";
import { trucksApi, branchesApi, uploadFile, fileUrl, editApprovalsApi } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { generateTruckId } from "@/lib/truck-data";
import type { Truck } from "@/types/truck";
import type { Branch } from "@/types/branch";
import type { TruckFiles } from "@/components/fleet/TruckFormDialog";
import type { EditApprovalRequest, EditApprovalAction } from "@/types/edit-approval";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useAuth } from "@/context/AuthContext";

export default function FleetPage() {
  const { user } = useAuth();
  // Every role except Admin must file an edit request to change truck records.
  const isGated = user?.softwareDesignation !== "Admin";
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewingTruck, setViewingTruck] = useState<Truck | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Edit approval state (non-Admin roles)
  const [activeApprovals, setActiveApprovals] = useState<EditApprovalRequest[]>([]);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: EditApprovalAction; resourceId: string; resourceName: string } | null>(null);
  const [branchChangeRequest, setBranchChangeRequest] = useState<{ truck: Truck; branchName: string } | null>(null);
  const [branchHistoryTruck, setBranchHistoryTruck] = useState<Truck | null>(null);

  const filteredTrucks = trucks.filter(t =>
    !searchQuery ||
    t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.truckId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.branchRegisteredTo?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
        trucksApi.list().then(setTrucks).catch(() => {}).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => {});
  }, []);

  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));
  useComplianceAlerts(trucks);

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
      a.resourceType === "Truck" &&
      String(a.resourceId) === resourceId &&
      a.action === action &&
      a.expiresAt != null &&
      new Date(a.expiresAt.endsWith("Z") ? a.expiresAt : a.expiresAt + "Z") > new Date()
    );
  }

  function handleAdd() {
    setEditingTruck(null);
    setDialogOpen(true);
  }

  function handleEdit(truck: Truck) {
    if (isGated && !hasActiveApproval(truck.id, "Edit")) {
      setPendingAction({ type: "Edit", resourceId: truck.id, resourceName: truck.registrationNumber || truck.truckId });
      setEditRequestOpen(true);
      return;
    }
    setEditingTruck(truck);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    const truck = trucks.find((t) => t.id === id);
    if (isGated && !hasActiveApproval(id, "Delete")) {
      setPendingAction({ type: "Delete", resourceId: id, resourceName: truck?.registrationNumber || truck?.truckId || id });
      setEditRequestOpen(true);
      return;
    }
    const result = await confirmDelete("truck");
    if (!result.isConfirmed) return;
    try {
      await trucksApi.delete(id);
      setTrucks((prev) => prev.filter((t) => t.id !== id));
      showSuccess("Truck deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete truck.");
    }
  }

  async function handleEditRequestSubmit(reason: string) {
    if (!pendingAction) return;
    try {
      await editApprovalsApi.create({
        resourceType: "Truck",
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

  function handleBranchHistory(truck: Truck) {
    setBranchHistoryTruck(truck);
  }

  // Changing a truck's branch is never gated behind edit approval — every role,
  // Admin included, can do it directly, but must leave a short note explaining
  // why (see BranchChangeNoteDialog). It's a record, not a review workflow.
  function handleChangeBranch(truck: Truck, branchName: string) {
    if (truck.branchRegisteredTo === branchName) return;
    setBranchChangeRequest({ truck, branchName });
  }

  async function submitBranchChange(note: string) {
    if (!branchChangeRequest) return;
    const { truck, branchName } = branchChangeRequest;
    const previous = truck.branchRegisteredTo;
    setTrucks((prev) => prev.map((t) => (t.id === truck.id ? { ...t, branchRegisteredTo: branchName } : t)));
    try {
      const saved = await trucksApi.update(truck.id, { ...truck, branchRegisteredTo: branchName }, note);
      setTrucks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      showSuccess(`Branch updated to ${branchName}.`);
      setBranchChangeRequest(null);
    } catch (err: unknown) {
      setTrucks((prev) => prev.map((t) => (t.id === truck.id ? { ...t, branchRegisteredTo: previous } : t)));
      showError(err instanceof Error ? err.message : "Failed to update branch.");
    }
  }

  async function handleSave(truck: Truck, files: TruckFiles) {
    try {
      let saved: Truck;
      if (editingTruck) {
        saved = await trucksApi.update(truck.id, truck);
        setTrucks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        const truckWithId = { ...truck, truckId: truck.truckId || generateTruckId(trucks) };
        saved = await trucksApi.create(truckWithId);
        setTrucks((prev) => [...prev, saved]);
        clearFormDraft(TRUCK_DRAFT_KEY);
      }
      const uploadMap: [File | null | undefined, string][] = [
        [files.photo,           "photo"],
        [files.rc,              "rc"],
        [files.fc,              "fc"],
        [files.road_tax,        "road_tax"],
        [files.insurance_proof, "insurance"],
        [files.national_permit, "national_permit"],
        [files.local_permit,    "local_permit"],
        [files.pollution_cert,  "pollution_cert"],
      ];
      await Promise.all(
        uploadMap
          .filter(([f]) => !!f)
          .map(([f, field]) => uploadFile("trucks", saved.id, field, f!))
      );
      setDialogOpen(false);
      showSuccess(editingTruck ? "Truck updated successfully." : "Truck added successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save truck.");
    }
  }

  async function handleDownloadPDF(truck: Truck) {
    if (downloading) return;
    setDownloading(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const marginX = 14;
      const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
      const fmtDate = (d: string) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "—";

      // Header
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(27, 43, 94);
      pdf.text("Truck Details", marginX, 18);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Generated on ${today}`, marginX, 24);
      pdf.text(truck.truckId ?? "", pageW - marginX, 24, { align: "right" });

      // Divider
      pdf.setDrawColor(209, 213, 219);
      pdf.line(marginX, 27, pageW - marginX, 27);

      // Field rows
      const sections: { heading: string; fields: [string, string][] }[] = [
        {
          heading: "General Information",
          fields: [
            ["Truck ID", truck.truckId ?? "—"],
            ["Registration Number", truck.registrationNumber ?? "—"],
            ["Truck Type", truck.truckType ?? "—"],
            ["Manufacturer", truck.manufacturer ?? "—"],
            ["Model Name", truck.modelName ?? "—"],
            ["Chassis Number", truck.chassisNumber ?? "—"],
            ["Year of Manufacture", truck.yearOfManufacture ?? "—"],
            ["Branch", truck.branchRegisteredTo ?? "—"],
            ["Tyre Layout", truck.tyreLayout ?? "—"],
            ["Fuel Capacity (L)", truck.fuelCapacity ?? "—"],
            ["Odometer (km)", truck.odometer ?? "—"],
          ],
        },
        {
          heading: "Compliance & Documents",
          fields: [
            ["FC Expiry Date", fmtDate(truck.fcExpiryDate)],
            ["Insurance Expiry Date", fmtDate(truck.insuranceExpiryDate)],
            ["National Permit Number", truck.nationalPermitNumber ?? "—"],
            ["National Permit Expiry", fmtDate(truck.nationalPermitDate)],
            ["Local Permit Number", truck.localPermitNumber ?? "—"],
            ["Local Permit Expiry", fmtDate(truck.localPermitDate)],
            ["PUC Certificate Number", truck.pollutionCertificateNumber ?? "—"],
            ["PUC Expiry Date", fmtDate(truck.pollutionCertificateDate)],
            ["Road Tax Number", truck.roadTaxNumber ?? "—"],
            ["Road Tax Expiry", fmtDate(truck.roadTaxDate)],
            ["RC Validity Date", fmtDate(truck.rcValidityDate)],
          ],
        },
      ];

      let y = 33;
      const lineH = 7;
      const sectionGap = 5;

      for (const section of sections) {
        // Section heading
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

      pdf.save(`truck-${truck.truckId ?? truck.id}.pdf`);
    } catch {
      const { showError: se } = await import("@/lib/swal");
      se("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <PageSkeleton hasButton hasSearch cards cardCount={8} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Our Fleet</h1>
          <p className="mt-1 text-sm text-gray-500">Manage trucks across all branches</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search fleet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-gray-300/30 dark:bg-gray-200/60 dark:text-gray-950 dark:placeholder-gray-500 dark:focus:bg-gray-200"
            />
          </div>
          <DownloadExcelButton path="/exports/trucks" filename="fleet.xlsx" />
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Add Truck
          </button>
        </div>
      </div>

      <div>
        <TruckTable
          trucks={filteredTrucks}
          branches={branches}
          onView={setViewingTruck}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onChangeBranch={handleChangeBranch}
          onBranchHistory={handleBranchHistory}
        />
      </div>

      <TruckFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingTruck}
        existingTrucks={trucks}
      />

      {/* Edit approval request dialog — shown when a non-Admin edits/deletes without active approval */}
      {pendingAction && (
        <EditRequestDialog
          open={editRequestOpen}
          resourceType="Truck"
          resourceName={pendingAction.resourceName}
          action={pendingAction.type}
          onSubmit={handleEditRequestSubmit}
          onClose={() => { setEditRequestOpen(false); setPendingAction(null); }}
        />
      )}

      <BranchChangeNoteDialog
        open={!!branchChangeRequest}
        truckLabel={branchChangeRequest ? `${branchChangeRequest.truck.registrationNumber} (${branchChangeRequest.truck.truckId})` : ""}
        fromBranch={branchChangeRequest?.truck.branchRegisteredTo || ""}
        toBranch={branchChangeRequest?.branchName || ""}
        onSubmit={submitBranchChange}
        onClose={() => setBranchChangeRequest(null)}
      />

      <BranchHistoryDialog
        open={!!branchHistoryTruck}
        truck={branchHistoryTruck}
        onClose={() => setBranchHistoryTruck(null)}
      />

      {viewingTruck && (() => {
        const t = viewingTruck;
        const fmtDate = (d: string) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "—";
        const isExpired = (d: string) => !!d && new Date(d) < new Date();
        const Field = ({ label, value, expired }: { label: string; value: string; expired?: boolean }) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
            <span className={`text-sm font-medium ${expired ? "text-red-600" : "text-gray-800"}`}>{value || "—"}</span>
          </div>
        );
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setViewingTruck(null); }}>
            <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
                <div>
                  <p className="font-semibold text-gray-900">{t.truckId} — {t.registrationNumber}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.manufacturer} {t.modelName} · {t.truckType}</p>
                </div>
                <button type="button" onClick={() => setViewingTruck(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">
                {/* General */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-3">General Information</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Field label="Truck ID" value={t.truckId} />
                    <Field label="Registration No." value={t.registrationNumber} />
                    <Field label="Truck Type" value={t.truckType} />
                    <Field label="Manufacturer" value={t.manufacturer} />
                    <Field label="Model Name" value={t.modelName} />
                    <Field label="Chassis Number" value={t.chassisNumber} />
                    <Field label="Year of Manufacture" value={t.yearOfManufacture} />
                    <Field label="Branch" value={t.branchRegisteredTo} />
                    <Field label="Tyre Layout" value={t.tyreLayout} />
                    <Field label="Fuel Capacity (L)" value={t.fuelCapacity} />
                    <Field label="Odometer (km)" value={t.odometer} />
                  </div>
                </div>

                {/* Compliance */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-3">Compliance & Documents</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Field label="FC Expiry" value={fmtDate(t.fcExpiryDate)} expired={isExpired(t.fcExpiryDate)} />
                    <Field label="Insurance Expiry" value={fmtDate(t.insuranceExpiryDate)} expired={isExpired(t.insuranceExpiryDate)} />
                    <Field label="RC Validity" value={fmtDate(t.rcValidityDate)} expired={isExpired(t.rcValidityDate)} />
                    <Field label="National Permit No." value={t.nationalPermitNumber} />
                    <Field label="National Permit Expiry" value={fmtDate(t.nationalPermitDate)} expired={isExpired(t.nationalPermitDate)} />
                    <Field label="Local Permit No." value={t.localPermitNumber} />
                    <Field label="Local Permit Expiry" value={fmtDate(t.localPermitDate)} expired={isExpired(t.localPermitDate)} />
                    <Field label="PUC Certificate No." value={t.pollutionCertificateNumber} />
                    <Field label="PUC Expiry" value={fmtDate(t.pollutionCertificateDate)} expired={isExpired(t.pollutionCertificateDate)} />
                    <Field label="Road Tax No." value={t.roadTaxNumber} />
                    <Field label="Road Tax Expiry" value={fmtDate(t.roadTaxDate)} expired={isExpired(t.roadTaxDate)} />
                  </div>
                </div>

                {/* Uploaded documents — only shown if the file was actually uploaded */}
                {(t.truckPhotosFileName || t.rcDocumentUrl || t.fcDocumentFileName || t.roadTaxDocumentFileName || t.insuranceDocumentProofFileName || t.nationalPermitProofFileName || t.localPermitProofFileName || t.pollutionCertificateProofFileName) && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-3">Uploaded Documents</p>
                    <div className="flex flex-wrap gap-3">
                      {t.truckPhotosFileName && (
                        <a href={fileUrl("trucks", t.id, "photo")} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> Photo
                        </a>
                      )}
                      {t.rcDocumentUrl && (
                        <a href={fileUrl("trucks", t.id, "rc")} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> RC
                        </a>
                      )}
                      {t.fcDocumentFileName && (
                        <a href={fileUrl("trucks", t.id, "fc")} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> FC
                        </a>
                      )}
                      {t.roadTaxDocumentFileName && (
                        <a href={fileUrl("trucks", t.id, "road_tax")} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> Road Tax
                        </a>
                      )}
                      {t.insuranceDocumentProofFileName && (
                        <a href={fileUrl("trucks", t.id, "insurance")} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> Insurance
                        </a>
                      )}
                      {t.nationalPermitProofFileName && (
                        <a href={fileUrl("trucks", t.id, "national_permit")} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> National Permit
                        </a>
                      )}
                      {t.localPermitProofFileName && (
                        <a href={fileUrl("trucks", t.id, "local_permit")} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> Local Permit
                        </a>
                      )}
                      {t.pollutionCertificateProofFileName && (
                        <a href={fileUrl("trucks", t.id, "pollution_cert")} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
                          <FileText className="h-3.5 w-3.5 shrink-0" /> PUC Certificate
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t px-5 py-3 flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={async () => { await handleDownloadPDF(t); setViewingTruck(null); }}
                  disabled={downloading}
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {downloading ? "Generating..." : "Download PDF"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
