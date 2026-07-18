"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { Branch } from "@/types/branch";

type BranchTableProps = {
  branches: Branch[];
  onEdit: (branch: Branch) => void;
  onDelete: (id: string) => void;
};

const columns = ["Branch Name", "20FT Halt Day Fee", "40FT Halt Day Fee", "Driver Compensation %", "Actions"];

const fmt = (v: string) =>
  `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export function BranchTable({ branches, onEdit, onDelete }: BranchTableProps) {
  if (branches.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No branches yet. Click &ldquo;Add Branch&rdquo; to create one.
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-200 bg-gray-50">
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {branches.map((branch) => (
            <tr key={branch.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{branch.name}</td>
              <td className="px-4 py-3 text-gray-600">{fmt(branch.haltDayFee20ft)}</td>
              <td className="px-4 py-3 text-gray-600">{fmt(branch.haltDayFee40ft)}</td>
              <td className="px-4 py-3 text-gray-600">{branch.driverHaltDayPercentage}%</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(branch)}
                    className="rounded-md p-1.5 text-gray-500 transition-all hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(branch.id)}
                    className="rounded-md p-1.5 text-gray-500 transition-all hover:bg-red-50 hover:text-red-600"
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
