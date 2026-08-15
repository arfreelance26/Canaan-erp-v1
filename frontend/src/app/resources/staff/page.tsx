"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Plus, Search, X, Smartphone, Laptop } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { StaffTable } from "@/components/staff/StaffTable";
import { StaffFormDialog, DRAFT_KEY as STAFF_DRAFT_KEY } from "@/components/staff/StaffFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { staffApi, uploadFile, fileUrl } from "@/lib/api";
import { confirmAction, confirmDelete, showSuccess, showError } from "@/lib/swal";
import type { Staff } from "@/types/staff";
import type { StaffFiles } from "@/components/staff/StaffFormDialog";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

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

  const filteredStaff = staff.filter(s =>
    !searchQuery ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.staffId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
        staffApi.list().then(setStaff).finally(() => setLoading(false));
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
        files.photo  && uploadFile("staff", saved.id, "photo",  files.photo),
        files.aadhar && uploadFile("staff", saved.id, "aadhar", files.aadhar),
      ].filter(Boolean));
      if (files.photo) {
        setStaff((prev) => prev.map((s) =>
          s.id === saved.id ? { ...s, photoUrl: fileUrl("staff", saved.id, "photo") } : s
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
      const { showError: se } = await import("@/lib/swal");
      se("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <PageSkeleton hasButton hasSearch columns={5} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Our Staff</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage staff records across all branches
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/staff" filename="staff.xlsx" />
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Add Staff
          </button>
        </div>
      </div>

      <StaffTable staff={filteredStaff} onView={setViewingStaff} onEdit={handleEdit} onDelete={handleDelete} onResetDevice={handleResetDevice} />

      <StaffFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingStaff}
      />

      {viewingStaff && (() => {
        const m = viewingStaff;
        const fmtD = (v: string) => v ? new Date(v + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-") : "—";
        const fmtDateTime = (v: string) => {
          const d = new Date(v.endsWith("Z") || v.includes("+") ? v : v + "Z");
          return isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).replace(/\//g, "-");
        };
        const Field = ({ label, value }: { label: string; value: string }) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
            <span className="text-sm font-medium text-gray-800">{value || "—"}</span>
          </div>
        );
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setViewingStaff(null); }}>
            <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
                <div>
                  <p className="font-semibold text-gray-900">{m.staffId} — {m.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{m.department} · {m.designation}</p>
                </div>
                <button type="button" onClick={() => setViewingStaff(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-3">General Information</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Field label="Staff ID" value={m.staffId} />
                    <Field label="Name" value={m.name} />
                    <Field label="Department" value={m.department} />
                    <Field label="Designation" value={m.designation} />
                    <Field label="Software Designation" value={m.softwareDesignation} />
                    <Field label="Contact Number" value={m.contactNumber} />
                    <Field label="Email" value={m.email} />
                    <Field label="Date of Birth" value={fmtD(m.dateOfBirth)} />
                    <Field label="Date of Joining" value={fmtD(m.dateOfJoining)} />
                    <Field label="Address" value={m.address} />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-3">Identity Documents</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Field label="Aadhaar Number" value={m.aadharNumber ?? ""} />
                  </div>
                </div>

                {/* Registered Devices — device-lock bindings, with per-device reset */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-3">Registered Devices</p>
                  {(m.devices ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400">No devices bound. The next login will bind a device.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {(m.devices ?? []).map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                              {d.kind === "mobile" ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800">{d.label || "Device"}</p>
                              <p className="text-xs text-gray-400">
                                {d.boundAt ? `Bound ${fmtDateTime(d.boundAt)}` : "Bound earlier"}
                              </p>
                            </div>
                          </div>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleResetOneDevice(m.id, d.id, d.label || "this device")}
                              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                            >
                              <Smartphone className="h-3.5 w-3.5" />
                              Reset
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t px-5 py-3 flex items-center justify-end shrink-0">
                <button
                  type="button"
                  onClick={async () => { await handleDownloadPDF(m); setViewingStaff(null); }}
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
