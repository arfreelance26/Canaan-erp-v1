"use client";

import { FileText, Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Staff } from "@/types/staff";

type StaffTableProps = {
  staff: Staff[];
  onEdit: (staff: Staff) => void;
  onDelete: (id: string) => void;
};

const columns = [
  "Photo",
  "Staff's Name",
  "Staff ID",
  "Department",
  "Designation",
  "Branch",
  "Contact Number",
  "Email",
  "Date of Joining",
  "Aadhar Card",
  "Actions",
];

export function StaffTable({ staff, onEdit, onDelete }: StaffTableProps) {
  if (staff.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No staff records yet. Click &ldquo;Add Staff&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead>
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
            <tr key={member.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <Avatar photoUrl={member.photoUrl} label={member.name} size={44} />
              </td>
              <td className="px-4 py-3 font-medium text-gray-900">{member.name}</td>
              <td className="px-4 py-3 text-gray-600">{member.staffId}</td>
              <td className="px-4 py-3 text-gray-600">{member.department}</td>
              <td className="px-4 py-3 text-gray-600">{member.designation}</td>
              <td className="px-4 py-3 text-gray-600">{member.branch}</td>
              <td className="px-4 py-3 text-gray-600">{member.contactNumber}</td>
              <td className="px-4 py-3 text-gray-600">{member.email}</td>
              <td className="px-4 py-3 text-gray-600">{member.dateOfJoining}</td>
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
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(member)}
                    aria-label={`Edit ${member.staffId}`}
                    className="transition-all duration-300 group rounded-md p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
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
