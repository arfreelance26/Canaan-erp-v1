"use client";

import { useEffect, useState } from "react";
import { Plus, X, Download, FileText, Loader2, Truck as TruckLucideIcon, History, Pencil, Trash2, Undo2, HandCoins, Factory } from "lucide-react";
import { TruckTable } from "@/components/fleet/TruckTable";
import { TruckFormDialog, DRAFT_KEY as TRUCK_DRAFT_KEY } from "@/components/fleet/TruckFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { EditRequestDialog } from "@/components/attendance/EditRequestDialog";
import { BranchChangeNoteDialog } from "@/components/fleet/BranchChangeNoteDialog";
import { BranchHistoryDialog } from "@/components/fleet/BranchHistoryDialog";
import { RemoveTruckDialog } from "@/components/fleet/RemoveTruckDialog";
import { TruckManufacturersDialog } from "@/components/fleet/TruckManufacturersDialog";
import { TruckTyreStepDialog, type TruckTyrePlan, type TyrePlanRow, type TruckStepDetails } from "@/components/fleet/TruckTyreStepDialog";
import { trucksApi, branchesApi, uploadFile, fileUrl, editApprovalsApi, deletionApprovalsApi, type TruckEditEventRow } from "@/lib/api";
import { cacheInvalidate } from "@/lib/api-cache";
import { confirmAction, confirmDelete, showSuccess, showError } from "@/lib/swal";
import type { Truck } from "@/types/truck";
import type { Branch } from "@/types/branch";
import type { TruckFiles } from "@/components/fleet/TruckFormDialog";
import type { EditApprovalRequest, EditApprovalAction } from "@/types/edit-approval";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { ComplianceAlertBanner } from "@/components/dashboard/ComplianceAlertBanner";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { useAuth } from "@/context/AuthContext";

import { PillSearch } from "@/components/ui/PillSearch";

const EDIT_EVENT_ICON: Record<TruckEditEventRow["event"], typeof Plus> = {
  "Truck Created": Plus,
  "Truck Edited": Pencil,
  "Truck Deleted": Trash2,
  "Truck Restored": Undo2,
};

const EDIT_EVENT_COLOR: Record<TruckEditEventRow["event"], string> = {
  "Truck Created": "bg-blue-100 text-blue-700",
  "Truck Edited": "bg-amber-100 text-amber-700",
  "Truck Deleted": "bg-red-100 text-red-700",
  "Truck Restored": "bg-emerald-100 text-emerald-700",
};
export default function FleetPage() {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  const { user } = useAuth();
  // Every role except Admin, Assistant Commercial Manager, and Commercial Manager
  // (who all have free edit rights on the fleet) must file an edit request to
  // change truck records.
  const isGated =
    user?.softwareDesignation !== "Admin" &&
    user?.softwareDesignation !== "Assistant Commercial Manager" &&
    user?.softwareDesignation !== "Commercial Manager";
  // Deletion has a narrower direct-access list than editing: Commercial Manager
  // can edit trucks directly but must still file a DeletionApprovalRequest for
  // deletes (reviewed on the "Deletion Approvals" page) — matches backend's
  // DELETE /trucks/{id}, which only allows Admin / Assistant Commercial Manager
  // through directly (trucks.py's delete_truck).
  const isDeleteGated =
    user?.softwareDesignation !== "Admin" &&
    user?.softwareDesignation !== "Assistant Commercial Manager";
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewingTruck, setViewingTruck] = useState<Truck | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);
  const [editHistoryEvents, setEditHistoryEvents] = useState<TruckEditEventRow[]>([]);
  const [editHistoryLoading, setEditHistoryLoading] = useState(false);
  const [editHistorySearch, setEditHistorySearch] = useState("");

  // Fetched fresh every time it's opened, covering every truck edit ever
  // logged — searching by registration/ID here doubles as that truck's own
  // edit history.
  function openEditHistory() {
    setEditHistoryOpen(true);
    setEditHistoryLoading(true);
    trucksApi.listEditEvents()
      .then(setEditHistoryEvents)
      .catch(() => {})
      .finally(() => setEditHistoryLoading(false));
  }

  // Edit approval state (non-Admin roles)
  const [activeApprovals, setActiveApprovals] = useState<EditApprovalRequest[]>([]);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: EditApprovalAction; resourceId: string; resourceName: string } | null>(null);
  const [branchChangeRequest, setBranchChangeRequest] = useState<{ truck: Truck; branchName: string } | null>(null);
  const [branchHistoryTruck, setBranchHistoryTruck] = useState<Truck | null>(null);
  // Deletion request state (non-Admin, non-Assistant Commercial Manager roles) — files a
  // DeletionApprovalRequest instead of an EditApprovalRequest, so it lands on the Admin's
  // "Deletion Approvals" page (and the Archive page's audit trail) instead of "Edit Approvals".
  const [deleteRequestTruck, setDeleteRequestTruck] = useState<Truck | null>(null);
  // The trash button first asks: Sell Truck or Delete Truck.
  const [removeTruck, setRemoveTruck] = useState<Truck | null>(null);
  // Second step of Sell / Delete Truck: what happens to each fitted tyre
  // (Sell also asks for the sale date, odometer and a note).
  const [tyreStep, setTyreStep] = useState<{ truck: Truck; mode: "sell" | "delete" } | null>(null);
  // Tyre choices carried into a non-Admin's delete request.
  const [pendingTyrePlan, setPendingTyrePlan] = useState<{ plan: TruckTyrePlan; rows: TyrePlanRow[] } | null>(null);
  // Active Trucks (the working fleet) vs Sold Trucks (removed with "Sell Truck").
  // Deleted trucks go to the Archive instead.
  const [fleetView, setFleetView] = useState<"active" | "sold">("active");
  const [soldTrucks, setSoldTrucks] = useState<Truck[]>([]);
  // The Manufacturer list used by the Add/Edit Truck form.
  const [manufacturersOpen, setManufacturersOpen] = useState(false);

  const filteredTrucks = trucks.filter(t =>
    !searchQuery ||
    t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.truckId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.branchRegisteredTo?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredSoldTrucks = soldTrucks.filter((t) => {
    const q = searchQuery.trim().toLowerCase();
    return !q || [t.registrationNumber, t.truckId, t.modelName, t.manufacturer, t.soldNote]
      .some((v) => v?.toLowerCase().includes(q));
  });

  useEffect(() => {
        trucksApi.list().then(setTrucks).catch(() => {}).finally(() => setLoading(false));
        trucksApi.listSold().then(setSoldTrucks).catch(() => {});
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useEffect(() => {
    branchesApi.list().then(setBranches).catch(() => {});
  }, []);

  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));
  const { expiredItems: complianceExpired, expiringSoonItems: complianceExpiringSoon } = useComplianceAlerts(trucks);

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

  function handleDelete(id: string) {
    const truck = trucks.find((t) => t.id === id);
    if (truck) setRemoveTruck(truck);
  }

  // "Sell Truck" — sale details + the tyre step in one dialog.
  function handleSellTruck(truck: Truck) {
    setRemoveTruck(null);
    setTyreStep({ truck, mode: "sell" });
  }

  // "Delete Truck" — the tyre step first (skipped when nothing is fitted).
  function handleDeleteTruck(truck: Truck) {
    setRemoveTruck(null);
    setTyreStep({ truck, mode: "delete" });
  }

  async function handleTyreStepConfirm(plan: TruckTyrePlan | null, rows: TyrePlanRow[], details: TruckStepDetails) {
    const step = tyreStep;
    setTyreStep(null);
    if (!step) return;
    if (step.mode === "sell") {
      await sellTruck(step.truck, plan, rows, details);
      return;
    }
    const truck = step.truck;
    const id = truck.id;
    if (isDeleteGated) {
      setPendingTyrePlan(plan ? { plan, rows } : null);
      setDeleteRequestTruck(truck);
      return;
    }
    const result = await confirmDelete("truck");
    if (!result.isConfirmed) return;
    try {
      await trucksApi.delete(id, plan);
      setTrucks((prev) => prev.filter((t) => t.id !== id));
      showSuccess("Truck deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete truck.");
    }
  }

  // Sell: Admins / Assistant Commercial Managers sell directly; other roles
  // send a request (with the sale + tyre choices) to Deletion Approvals.
  async function sellTruck(truck: Truck, plan: TruckTyrePlan | null, rows: TyrePlanRow[], details: TruckStepDetails) {
    const label = `${truck.truckId} — ${truck.registrationNumber}`;
    const sale = { sold_date: details.date, sold_odometer: details.odometer, note: details.note || null };
    try {
      if (isDeleteGated) {
        await deletionApprovalsApi.create({
          resourceType: "Truck",
          resourceId: parseInt(truck.id),
          resourceName: label,
          reason: details.reason,
          logDetails: { action: "sell", sale, tyre_plan: plan, tyre_rows: rows },
        });
        showSuccess("Sell request sent to Admin — you'll see it approved or rejected on the Deletion Approvals page.");
        return;
      }
      const ok = await confirmAction("Sell this truck?", `${label} will move to Sold Trucks and leave the active fleet.`, "Yes, Sell");
      if (!ok.isConfirmed) return;
      const sold = await trucksApi.sell(truck.id, {
        soldDate: details.date, soldOdometer: details.odometer, note: details.note, tyrePlan: plan,
      });
      setTrucks((prev) => prev.filter((t) => t.id !== truck.id));
      setSoldTrucks((prev) => [sold, ...prev.filter((t) => t.id !== sold.id)]);
      showSuccess("Truck sold — it's now under Sold Trucks.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to sell the truck.");
    }
  }

  async function handleDeleteRequestSubmit(reason: string) {
    if (!deleteRequestTruck) return;
    try {
      await deletionApprovalsApi.create({
        resourceType: "Truck",
        resourceId: parseInt(deleteRequestTruck.id),
        resourceName: `${deleteRequestTruck.truckId} — ${deleteRequestTruck.registrationNumber}`,
        reason,
        ...(pendingTyrePlan ? { logDetails: { tyre_plan: pendingTyrePlan.plan, tyre_rows: pendingTyrePlan.rows } } : {}),
      });
      setPendingTyrePlan(null);
      showSuccess("Delete request sent to Admin — you'll see it approved or rejected on the Deletion Approvals page.");
      setDeleteRequestTruck(null);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to send delete request.");
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
        // The dialog can stay open long enough that the truck's version stamp
        // (loaded when it was opened) goes stale — e.g. a background refresh
        // or a branch-change action bumps it in the meantime. Pull the latest
        // version right before saving so the server's optimistic-lock check
        // doesn't false-positive against the user's own session.
        let truckToSave = truck;
        try {
          cacheInvalidate("/trucks");
          const fresh = await trucksApi.list();
          const latest = fresh.find((t) => t.id === truck.id);
          if (latest?.version != null) {
            truckToSave = { ...truck, version: latest.version };
          }
        } catch { /* fall back to the version already on the form */ }
        saved = await trucksApi.update(truck.id, truckToSave);
        setTrucks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        saved = await trucksApi.create(truck);
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white text-indigo-600 shadow-sm">
          <TruckLucideIcon className="h-5 w-5" />
        </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Our Fleet</h1>
            <p className="mt-0.5 text-sm text-gray-500">Manage trucks across all branches</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
            onClick={() => setManufacturersOpen(true)}
            className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-300 hover:scale-105 hover:bg-gray-50"
          >
            <Factory className="h-4 w-4" />
            Manufacturers
          </button>
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-blue-600 px-5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:scale-105 hover:bg-blue-700 hover:shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add Truck
          </button>
        </div>
      </div>

      {/* Compliance status for this exact fleet — lives here instead of the
          notification bell: this is where you'd actually come to renew a
          document, so the alert belongs on the page, not in a dropdown. */}
      <ComplianceAlertBanner
        expired={complianceExpired}
        expiringSoon={complianceExpiringSoon}
      />

      {/* Toolbar: search on the left, View on the right (same place as on the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search fleet..." value={searchQuery} onChange={setSearchQuery} />
        <div role="radiogroup" aria-label="Fleet view" className="flex shrink-0 gap-0.5 rounded-full border border-gray-200 bg-gray-100 p-0.5 shadow-inner">
          {([["active", "Active Trucks"], ["sold", "Sold Trucks"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={fleetView === key}
              onClick={() => setFleetView(key)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200",
                fleetView === key
                  ? "bg-brand-navy text-white shadow-[0_2px_6px_-1px_rgba(27,43,94,0.45)]"
                  : "text-gray-500 hover:bg-white/70 hover:text-gray-800"
              )}
            >
              {label}
              <span className={cn("ml-1.5 tabular-nums", fleetView === key ? "text-white/70" : "text-gray-400")}>
                {key === "active" ? trucks.length : soldTrucks.length}
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DownloadExcelButton path="/exports/trucks" filename="fleet.xlsx" />
        </div>
      </div>

      <div>
        {fleetView === "active" ? (
          <TruckTable
            trucks={filteredTrucks}
            branches={branches}
            onView={setViewingTruck}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onChangeBranch={handleChangeBranch}
            onBranchHistory={handleBranchHistory}
          />
        ) : filteredSoldTrucks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <HandCoins className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-700">
              {soldTrucks.length === 0 ? "No sold trucks yet" : "No sold trucks match this search"}
            </p>
            {soldTrucks.length === 0 && (
              <p className="mt-1 text-xs text-gray-400">
                Trucks removed with &ldquo;Sell Truck&rdquo; are listed here with their sale details.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {["Truck", "Model", "Tyre Layout", "Sold On", "Odometer at Sale", "Note", "Sold By"].map((h) => (
                    <th key={h} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSoldTrucks.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <span className="block font-semibold text-gray-900">{t.registrationNumber}</span>
                      <span className="block text-xs text-gray-400">{t.truckId}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{[t.manufacturer, t.modelName].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{t.tyreLayout || "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">{t.soldDate ? formatDate(t.soldDate) : "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">
                      {t.soldOdometer != null ? `${t.soldOdometer.toLocaleString("en-IN")} km` : "—"}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-gray-500" title={t.soldNote ?? ""}>{t.soldNote || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{t.soldByName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TruckFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingTruck}
      />

      {/* Edit approval request dialog — shown when a non-Admin edits without active approval */}
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

      <TruckManufacturersDialog
        open={manufacturersOpen}
        onClose={() => setManufacturersOpen(false)}
        trucks={trucks}
      />

      <RemoveTruckDialog
        truck={removeTruck}
        onClose={() => setRemoveTruck(null)}
        onSell={handleSellTruck}
        onDelete={handleDeleteTruck}
      />

      <TruckTyreStepDialog
        truck={tyreStep?.truck ?? null}
        mode={tyreStep?.mode ?? "delete"}
        requireReason={tyreStep?.mode === "sell" && isDeleteGated}
        onClose={() => setTyreStep(null)}
        onConfirm={handleTyreStepConfirm}
      />

      {/* Delete request dialog — non-Admin, non-Assistant Commercial Manager roles submit
          this with a reason instead of deleting directly; it lands on the Admin's
          "Deletion Approvals" page for approval. */}
      {deleteRequestTruck && (
        <EditRequestDialog
          open={deleteRequestTruck !== null}
          resourceType="Truck"
          resourceName={`${deleteRequestTruck.truckId} — ${deleteRequestTruck.registrationNumber}`}
          action="Delete"
          onSubmit={handleDeleteRequestSubmit}
          onClose={() => { setDeleteRequestTruck(null); setPendingTyrePlan(null); }}
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

      {/* Edit History — every Create/Edit/Delete/Restore ever logged, across
          every truck (not just the ones currently on this page), in one
          searchable log instead of having to open each truck individually.
          Searching by a specific registration/ID doubles as that truck's
          own history. Does not include the automatic odometer sync fired on
          every trip sheet save. */}
      <Dialog
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Edit History"
        className="sm:max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <PillSearch placeholder="Search by registration, truck ID, or actor…" value={editHistorySearch} onChange={setEditHistorySearch} />
          {editHistoryLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>
          ) : (() => {
            const filtered = editHistoryEvents.filter((ev) =>
              !editHistorySearch ||
              ev.truckIdStr.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.registrationNumber.toLowerCase().includes(editHistorySearch.toLowerCase()) ||
              ev.actorName.toLowerCase().includes(editHistorySearch.toLowerCase())
            );
            return filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {editHistoryEvents.length === 0 ? "No truck edits have been logged yet." : "No history matches this search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">Truck</th>
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
                          <td className="px-3 py-2">
                            <p className="font-semibold text-gray-800">{ev.registrationNumber}</p>
                            <p className="text-[11px] text-gray-400">{ev.truckIdStr}</p>
                          </td>
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
