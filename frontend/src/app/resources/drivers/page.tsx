"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Plus, Search, X } from "lucide-react";
import { DriverTable } from "@/components/drivers/DriverTable";
import { DriverFormDialog, DRAFT_KEY as DRIVER_DRAFT_KEY } from "@/components/drivers/DriverFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { driversApi, uploadFile, fileUrl } from "@/lib/api";
import { confirmAction, showSuccess, showError } from "@/lib/swal";
import { generateDriverId } from "@/lib/driver-data";
import type { Driver } from "@/types/driver";
import type { DriverFiles } from "@/components/drivers/DriverFormDialog";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useAuth } from "@/context/AuthContext";

export default function DriversPage() {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewingDriver, setViewingDriver] = useState<Driver | null>(null);
  const [downloading, setDownloading] = useState(false);

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

  function handleAdd() {
    setEditingDriver(null);
    setDialogOpen(true);
  }

  function handleEdit(driver: Driver) {
    setEditingDriver(driver);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
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

  async function handleSave(driver: Driver, files: DriverFiles) {
    try {
      let saved: Driver;
      if (editingDriver) {
        saved = await driversApi.update(driver.id, driver, driver.password || undefined);
        setDrivers((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
      } else {
        const driverWithId = { ...driver, driverId: driver.driverId || generateDriverId(drivers) };
        saved = await driversApi.create(driverWithId, driver.password);
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
      const { showError: se } = await import("@/lib/swal");
      se("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <PageSkeleton hasButton hasSearch columns={11} rows={8} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Our Drivers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage driver records across all branches
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search drivers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/drivers" filename="drivers.xlsx" />
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Add Driver
          </button>
        </div>
      </div>

      <div>
        <DriverTable drivers={filteredDrivers} onView={setViewingDriver} onEdit={handleEdit} onDelete={isAdmin ? handleDelete : undefined} />
      </div>

      <DriverFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingDriver}
        existingDrivers={drivers}
      />

      {viewingDriver && (() => {
        const d = viewingDriver;
        const fmtD = (v: string) => v ? new Date(v + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "—";
        const isExpired = (v: string) => !!v && new Date(v) < new Date();
        const Field = ({ label, value, expired }: { label: string; value: string; expired?: boolean }) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
            <span className={`text-sm font-medium ${expired ? "text-red-600" : "text-gray-800"}`}>{value || "—"}</span>
          </div>
        );
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setViewingDriver(null); }}>
            <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
                <div>
                  <p className="font-semibold text-gray-900">{d.driverId} — {d.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{d.contactNumber} · {d.email}</p>
                </div>
                <button type="button" onClick={() => setViewingDriver(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-3">General Information</p>
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
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-3">License & Identity</p>
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
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-3">Banking Details</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Field label="Bank Name" value={d.bankName} />
                    <Field label="Branch Name" value={d.bankBranchName} />
                    <Field label="Account Number" value={d.accountNumber} />
                    <Field label="IFSC Code" value={d.ifscCode} />
                  </div>
                </div>
              </div>

              <div className="border-t px-5 py-3 flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={async () => { await handleDownloadPDF(d); setViewingDriver(null); }}
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
