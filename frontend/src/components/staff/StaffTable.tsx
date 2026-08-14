"use client";

import { Eye, FileText, Pencil, Smartphone, Trash2 } from "lucide-react";
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

const columns = [
  "Photo",
  "Staff's Name",
  "Staff ID",
  "Department",
  "Designation",

  "Contact Number",
  "Email",
  "Date of Joining",
  "Aadhar Card",
  "Actions",
];

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
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[960px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((column) => (
              <th
                key={column}
                className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {staff.map((member) => (
            <tr key={member.id} onClick={() => onView(member)} className="hover:bg-gray-50 cursor-pointer">
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <Avatar photoUrl={member.photoUrl} label={member.name} size={44} />
              </td>
              <td className="px-4 py-3 font-medium text-gray-900">{member.name}</td>
              <td className="px-4 py-3 text-gray-600">{member.staffId}</td>
              <td className="px-4 py-3 text-gray-600">{member.department}</td>
              <td className="px-4 py-3 text-gray-600">{member.designation}</td>

              <td className="px-4 py-3 text-gray-600">{member.contactNumber}</td>
              <td className="px-4 py-3 text-gray-600">{member.email}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(member.dateOfJoining)}</td>
              <td className="px-4 py-3 text-gray-600">
                {member.aadharFileName ? (
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-gray-400" />
                    {member.aadharFileName}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onView(member)}
                    aria-label={`View ${member.staffId}`}
                    className="transition-all duration-300 rounded-md p-1.5 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(member)}
                    aria-label={`Edit ${member.staffId}`}
                    className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {isAdmin && member.deviceBound && onResetDevice && (
                    <button
                      type="button"
                      onClick={() => onResetDevice(member.id, member.name)}
                      aria-label={`Reset device for ${member.staffId}`}
                      title="Reset device binding"
                      className="transition-all duration-300 rounded-md p-1.5 text-gray-500 hover:bg-amber-50 hover:text-amber-600"
                    >
                      <Smartphone className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(member.id)}
                    aria-label={`Delete ${member.staffId}`}
                    className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
