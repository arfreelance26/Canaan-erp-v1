"use client";

import { Eye, FileText, Mail, Pencil, Phone, Smartphone, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Staff } from "@/types/staff";
import { formatDate } from "@/lib/format-date";
import { useAuth } from "@/context/AuthContext";

type StaffTableProps = {
  staff: Staff[];
  onView: (staff: Staff) => void;
  onEdit: (staff: Staff) => void;
  onDelete: (id: string) => void;
  onResetDevice?: (id: string, name: string) => void;
};

export function StaffTable({ staff, onView, onEdit, onDelete, onResetDevice }: StaffTableProps) {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";

  if (staff.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No staff records yet. Click &ldquo;Add Staff&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {staff.map((member) => (
        <div
          key={member.id}
          onClick={() => onView(member)}
          className="group flex cursor-pointer flex-col gap-4 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)]"
        >
          {/* Header — avatar, name / staff ID, device-bound indicator */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar photoUrl={member.photoUrl} label={member.name} size={44} />
              <div className="min-w-0">
                <p className="truncate font-bold text-gray-900">{member.name}</p>
                <p className="truncate text-xs text-gray-500">{member.staffId || "—"}</p>
              </div>
            </div>
            {member.deviceBound && (
              <span
                title="Device bound"
                className="flex shrink-0 items-center justify-center rounded-md border border-amber-100 bg-amber-50 p-1.5 text-amber-600"
              >
                <Smartphone className="h-3.5 w-3.5" />
              </span>
            )}
          </div>

          {/* Department / Designation */}
          <div className="flex flex-wrap items-center gap-1.5">
            {member.department && (
              <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                {member.department}
              </span>
            )}
            {member.designation && (
              <span className="rounded-md border border-violet-100 bg-violet-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                {member.designation}
              </span>
            )}
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3 text-xs">
            <div className="flex min-w-0 items-center gap-1.5 text-gray-600">
              <Phone className="h-3 w-3 shrink-0 text-gray-400" />
              <span className="truncate">{member.contactNumber || "—"}</span>
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-gray-600">
              <Mail className="h-3 w-3 shrink-0 text-gray-400" />
              <span className="truncate">{member.email || "—"}</span>
            </div>
          </div>

          {/* Date of Joining / Aadhar */}
          <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs">
            <div className="min-w-0">
              <p className="font-semibold uppercase tracking-wide text-gray-400">Date of Joining</p>
              <p className="mt-0.5 truncate font-medium text-gray-700">{formatDate(member.dateOfJoining) || "—"}</p>
            </div>
            <div className="min-w-0">
              <p className="font-semibold uppercase tracking-wide text-gray-400">Aadhar Card</p>
              {member.aadharFileName ? (
                <p className="mt-0.5 flex items-center gap-1 truncate font-medium text-gray-700">
                  <FileText className="h-3 w-3 shrink-0 text-gray-400" />
                  <span className="truncate">{member.aadharFileName}</span>
                </p>
              ) : (
                <p className="mt-0.5 text-gray-300">—</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div
            className="flex items-center justify-end gap-1 border-t border-gray-100 pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onView(member)}
              aria-label={`View ${member.staffId}`}
              className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-emerald-50 hover:text-emerald-600"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(member)}
              aria-label={`Edit ${member.staffId}`}
              className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-blue-50 hover:text-blue-600"
            >
              <Pencil className="h-4 w-4" />
            </button>
            {isAdmin && member.deviceBound && onResetDevice && (
              <button
                type="button"
                onClick={() => onResetDevice(member.id, member.name)}
                aria-label={`Reset device for ${member.staffId}`}
                title="Reset device binding"
                className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-amber-50 hover:text-amber-600"
              >
                <Smartphone className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(member.id)}
              aria-label={`Delete ${member.staffId}`}
              className="rounded-md p-1.5 text-gray-500 transition-all duration-300 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
