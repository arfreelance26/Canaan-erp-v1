"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { StaffTable } from "@/components/staff/StaffTable";
import { StaffFormDialog } from "@/components/staff/StaffFormDialog";
import { staffApi, uploadFile, fileUrl } from "@/lib/api";
import type { Staff } from "@/types/staff";
import type { StaffFiles } from "@/components/staff/StaffFormDialog";

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  useEffect(() => {
    staffApi.list().then(setStaff).finally(() => setLoading(false));
  }, []);

  function handleAdd() {
    setEditingStaff(null);
    setDialogOpen(true);
  }

  function handleEdit(member: Staff) {
    setEditingStaff(member);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this staff member?")) return;
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Our Staff</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage staff records across all branches
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Staff
        </button>
      </div>

      <StaffTable staff={staff} onEdit={handleEdit} onDelete={handleDelete} />

      <StaffFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingStaff}
      />
    </div>
  );
}
