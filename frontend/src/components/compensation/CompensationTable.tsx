"use client";

import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge } from "@/components/compensation/StatusBadge";
import type { PersonStatus } from "@/types/compensation";

export type CompensationPerson = {
  id: string;
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
};

export function CompensationTable({
  people,
  showAdvance,
  onPayAdvance,
  onPaySalary,
  onViewHistory,
  photoLabel,
  nameLabel,
}: CompensationTableProps) {
  if (people.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No records yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
              {photoLabel}
            </th>
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
                      Pay Advance
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onPaySalary(person)}
                    className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-xs font-semibold text-green-700 shadow-sm transition-colors hover:border-green-300 hover:bg-green-100"
                  >
                    Pay Salary
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
