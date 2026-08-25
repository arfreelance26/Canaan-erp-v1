"use client";

import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/compensation/StatusBadge";
import type { PersonStatus } from "@/types/compensation";

export type CompensationPerson = {
  id: string;
  driverId?: string;
  photoUrl: string | null;
  name: string;
  status: PersonStatus;
};

type CompensationTableProps = {
  people: CompensationPerson[];
  showAdvance: boolean;
  onPayAdvance: (person: CompensationPerson) => void;
  onPaySalary: (person: CompensationPerson) => void;
  onViewHistory: (person: CompensationPerson) => void;
  photoLabel: string;
  nameLabel: string;
  idLabel?: string;
};

export function CompensationTable({
  people,
  showAdvance,
  onPayAdvance,
  onPaySalary,
  onViewHistory,
  photoLabel,
  nameLabel,
  idLabel,
}: CompensationTableProps) {
  if (people.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No records yet.
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-white/80 bg-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[700px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
              {photoLabel}
            </th>
            {idLabel && (
              <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                {idLabel}
              </th>
            )}
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
              {nameLabel}
            </th>
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {people.map((person) => (
            <tr key={person.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <Avatar photoUrl={person.photoUrl} label={person.name} size={44} />
              </td>
              {idLabel && (
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{person.driverId ?? "—"}</td>
              )}
              <td className="px-4 py-3 font-medium text-gray-900">{person.name}</td>
              <td className="px-4 py-3">
                <StatusBadge status={person.status} />
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  {showAdvance && (
                    <button
                      type="button"
                      onClick={() => onPayAdvance(person)}
                      className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-xs font-semibold text-yellow-700 shadow-sm transition-colors hover:border-yellow-300 hover:bg-yellow-100"
                    >
                      Advance Record
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onPaySalary(person)}
                    className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-xs font-semibold text-green-700 shadow-sm transition-colors hover:border-green-300 hover:bg-green-100"
                  >
                    Salary Record
                  </button>
                  <button
                    type="button"
                    onClick={() => onViewHistory(person)}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
                  >
                    Transaction History
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
