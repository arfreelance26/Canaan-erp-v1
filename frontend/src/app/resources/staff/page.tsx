"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { StaffTable } from "@/components/staff/StaffTable";
import { StaffFormDialog } from "@/components/staff/StaffFormDialog";
import { staffApi, uploadFile, fileUrl } from "@/lib/api";
import { confirmDelete } from "@/lib/swal";
import type { Staff } from "@/types/staff";
import type { StaffFiles } from "@/components/staff/StaffFormDialog";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredStaff = staff.filter(s =>
    !searchQuery ||
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.employeeId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.role?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.branch?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
        staffApi.list().then(setStaff).finally(() => setLoading(false));
      }, []);
      useAutoRefresh(() => {
    staffApi.list().then(setStaff).finally(() => setLoading(false));
      }, 5000);


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
    await staffApi.delete(id);
    setStaff((prev) => prev.filter((member) => member.id !== id));
  }

  async function handleSave(member: Staff, files: StaffFiles) {
    let saved: Staff;
    const exists = staff.some((existing) => existing.id === member.id);
    if (exists) {
      saved = await staffApi.update(member.id, member);
      setStaff((prev) => prev.map((existing) => (existing.id === saved.id ? saved : existing)));
    } else {
      saved = await staffApi.create(member, member.password ?? "");
      setStaff((prev) => [...prev, saved]);
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
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

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

      <StaffTable staff={filteredStaff} onEdit={handleEdit} onDelete={handleDelete} />

      <StaffFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingStaff}
      />
    </div>
  );
}
