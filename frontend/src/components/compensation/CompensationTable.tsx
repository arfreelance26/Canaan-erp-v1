"use client";

import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";

import { EmptyState } from "@/components/ui/EmptyState";
import { PagedTbody } from "@/components/ui/PagedTbody";
export type CompensationPerson = {
  id: string;
  driverId?: string;
  photoUrl: string | null;
  name: string;
};

type CompensationTableProps = {
  people: CompensationPerson[];
  showAdvance: boolean;
  onPayAdvance: (person: CompensationPerson) => void;
  onPaySalary: (person: CompensationPerson) => void;
  /** Driver Compensation only: opens the driver's Salary Record (final pay); onPaySalary is then the Trip Salary Record. */
  onSalaryStatement?: (person: CompensationPerson) => void;
  /** Opens the person's Transaction History (Staff Compensation only). */
  onViewHistory?: (person: CompensationPerson) => void;
  /** Driver Compensation only: opens the driver's Halt Pay Record. */
  onHaltPay?: (person: CompensationPerson) => void;
  /** Driver Compensation only: opens the driver's Cleaner Batta Record. */
  onCleanerBatta?: (person: CompensationPerson) => void;
  /** Driver Compensation only: opens the driver's Workshop Batta Record. */
  onWorkshopBatta?: (person: CompensationPerson) => void;
  /** Driver Compensation only: opens the driver's Workshop Advance Record. */
  onWorkshopAdvance?: (person: CompensationPerson) => void;
  photoLabel: string;
  nameLabel: string;
  idLabel?: string;
};

export function CompensationTable({
  people,
  showAdvance,
  onPayAdvance,
  onPaySalary,
  onSalaryStatement,
  onViewHistory,
  onHaltPay,
  onCleanerBatta,
  onWorkshopBatta,
  onWorkshopAdvance,
  photoLabel,
  nameLabel,
  idLabel,
}: CompensationTableProps) {
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.softwareDesignation === "Admin";
  if (people.length === 0) {
    return (
      <EmptyState size="compact" illustration="no-data" title="No records yet" />
    );
  }

  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-separator-border bg-background-primary-default shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
      <table className="w-full min-w-[700px] text-left text-sm whitespace-nowrap">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-separator-border bg-fill-1">
            <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">
              {photoLabel}
            </th>
            {idLabel && (
              <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">
                {idLabel}
              </th>
            )}
            <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">
              {nameLabel}
            </th>
            <th className="px-4 py-3 text-caption-1-semibold text-text-secondary">
              Actions
            </th>
          </tr>
        </thead>
        <PagedTbody className="divide-y divide-separator-border" items={people}>
          {(person) => (
            <tr key={person.id} className="hover:bg-fill-2">
              <td className="px-4 py-3">
                <Avatar photoUrl={person.photoUrl} label={person.name} size={44} />
              </td>
              {idLabel && (
                <td className="px-4 py-3 font-mono text-xs text-text-secondary">{person.driverId ?? "—"}</td>
              )}
              <td className="px-4 py-3 font-medium text-text-primary">{person.name}</td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  {onSalaryStatement && (
                    <button
                      type="button"
                      onClick={() => onSalaryStatement(person)}
                      className="rounded-lg border border-success-solid bg-success-solid px-4 py-2 text-caption-1-semibold text-on-solid shadow-sm transition-colors hover:bg-success-solid-hover"
                    >
                      Salary Record
                    </button>
                  )}
                  {showAdvance && (
                    <button
                      type="button"
                      onClick={() => onPayAdvance(person)}
                      className="rounded-lg border border-warning-border bg-warning-surface px-4 py-2 text-caption-1-semibold text-warning-text shadow-sm transition-colors hover:border-warning-border-strong hover:bg-warning-surface-strong"
                    >
                      Advance Record
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onPaySalary(person)}
                    className="rounded-lg border border-success-border bg-success-surface px-4 py-2 text-caption-1-semibold text-success-text shadow-sm transition-colors hover:border-success-border-strong hover:bg-success-surface-strong"
                  >
                    {onSalaryStatement ? "Trip Salary Record" : "Salary Record"}
                  </button>
                  {onHaltPay && (
                    <button
                      type="button"
                      onClick={() => onHaltPay(person)}
                      className="rounded-lg border border-separator-border bg-fill-1 px-4 py-2 text-caption-1-semibold text-text-primary shadow-sm transition-colors hover:border-border-button-default hover:bg-fill-3"
                    >
                      Halt Pay Record
                    </button>
                  )}
                  {onCleanerBatta && (
                    <button
                      type="button"
                      onClick={() => onCleanerBatta(person)}
                      className="rounded-lg border border-separator-border bg-fill-1 px-4 py-2 text-caption-1-semibold text-text-primary shadow-sm transition-colors hover:border-border-button-default hover:bg-fill-3"
                    >
                      Cleaner Batta Record
                    </button>
                  )}
                  {onWorkshopBatta && (
                    <button
                      type="button"
                      onClick={() => onWorkshopBatta(person)}
                      className="rounded-lg border border-separator-border bg-fill-1 px-4 py-2 text-caption-1-semibold text-text-primary shadow-sm transition-colors hover:border-border-button-default hover:bg-fill-3"
                    >
                      Workshop Batta Record
                    </button>
                  )}
                  {onWorkshopAdvance && (
                    <button
                      type="button"
                      onClick={() => onWorkshopAdvance(person)}
                      className="rounded-lg border border-separator-border bg-fill-1 px-4 py-2 text-caption-1-semibold text-text-primary shadow-sm transition-colors hover:border-border-button-default hover:bg-fill-3"
                    >
                      Workshop Advance Record
                    </button>
                  )}
                  {isAdmin && onViewHistory && (
<button
                    type="button"
                    onClick={() => onViewHistory(person)}
                    className="rounded-lg border border-separator-border bg-background-primary-default px-4 py-2 text-caption-1-semibold text-text-primary shadow-sm transition-colors hover:border-border-button-default hover:bg-fill-2"
                  >
                    Transaction History
                  </button>
)}
                </div>
              </td>
            </tr>
          )}
        </PagedTbody>
      </table>
    </div>
  );
}
