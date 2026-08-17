"use client";

import { useEffect, useState } from "react";
import { Plus, Search, X, Download, Loader2 } from "lucide-react";
import { TruckTable } from "@/components/fleet/TruckTable";
import { TruckFormDialog, DRAFT_KEY as TRUCK_DRAFT_KEY } from "@/components/fleet/TruckFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { trucksApi, uploadFile, fileUrl } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { generateTruckId } from "@/lib/truck-data";
import type { Truck } from "@/types/truck";
import type { TruckFiles } from "@/components/fleet/TruckFormDialog";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { useComplianceAlerts } from "@/hooks/useComplianceAlerts";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function FleetPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewingTruck, setViewingTruck] = useState<Truck | null>(null);
  const [downloading, setDownloading] = useState(false);

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

  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));
  useComplianceAlerts(trucks);

  function handleAdd() {
    setEditingTruck(null);
    setDialogOpen(true);
  }

  function handleEdit(truck: Truck) {
    setEditingTruck(truck);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
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

  if (loading) return <PageSkeleton hasButton hasSearch columns={10} rows={8} />;

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
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
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
        <TruckTable trucks={filteredTrucks} onView={setViewingTruck} onEdit={handleEdit} onDelete={handleDelete} />
      </div>

      <TruckFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingTruck}
        existingTrucks={trucks}
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
