"use client";

import { RiEyeLine as Eye, RiFileTextLine as FileText, RiLockLine as Lock, RiLockUnlockLine as LockOpen, RiMailLine as Mail, RiPencilLine as Pencil, RiPhoneLine as Phone, RiSmartphoneLine as Smartphone, RiDeleteBinLine as Trash2 } from "@remixicon/react";
import { Avatar } from "@/components/ui/Avatar";
import type { Staff } from "@/types/staff";
import { formatDate } from "@/lib/format-date";
import { useAuth } from "@/context/AuthContext";

import { EmptyState } from "@/components/ui/EmptyState";
type StaffTableProps = {
  staff: Staff[];
  onView: (staff: Staff) => void;
  onEdit: (staff: Staff) => void;
  onDelete: (id: string) => void;
  onResetDevice?: (id: string, name: string) => void;
  /** Freeze / Unfreeze Account (Admin; the owner password is asked in the dialog). */
  onFreeze?: (staff: Staff) => void;
};

export function StaffTable({ staff, onView, onEdit, onDelete, onResetDevice, onFreeze }: StaffTableProps) {
  const { user } = useAuth();
  const isAdmin = user?.softwareDesignation === "Admin";

  if (staff.length === 0) {
    return (
      <EmptyState size="compact" illustration="no-data" title="No staff records yet" description="Click &ldquo;Add Staff&rdquo; to create one" />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {staff.map((member) => (
        <div
          key={member.id}
          onClick={() => onView(member)}
          className="group relative flex cursor-pointer flex-col gap-4 rounded-2xl border border-separator-border bg-background-primary-default p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition duration-300 hover:border-accent-border hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)]"
        >
          {/* Device-bound indicator — pinned to the card's true top-right corner
              regardless of the info/photo columns below it. */}
          {member.deviceBound && (
            <span
              title="Device bound"
              className="absolute right-4 top-4 z-10 flex shrink-0 items-center justify-center rounded-md border border-warning-border bg-warning-surface p-1.5 text-warning-text"
            >
              <Smartphone className="h-3.5 w-3.5" />
            </span>
          )}

          {/* Info column (unchanged) + Identity Image column — the image is a fixed,
              proportionate passport-photo size and vertically centered alongside the
              info column, which is what actually determines the row's height, so the
              card's overall height never changes whether or not a photo is set. */}
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {/* Header — avatar, name / staff ID */}
              <div className="flex items-start gap-3 pr-8">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar photoUrl={member.photoUrl} label={member.name} size={44} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-text-primary">{member.name}</p>
                    <p className="truncate text-xs text-text-secondary">{member.staffId || "—"}</p>
                    {member.frozenAt && (
                      <span
                        title={`Frozen by ${member.frozenByName ?? "—"} on ${formatDate(member.frozenAt.slice(0, 10))}: ${member.frozenReason ?? ""}`}
                        className="mt-1 inline-flex items-center gap-1 rounded-md border border-danger-border bg-danger-surface px-1.5 py-0.5 text-caption-2-semibold text-danger-text"
                      >
                        <Lock className="h-3 w-3" /> Frozen
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Department / Designation */}
              <div className="flex flex-wrap items-center gap-1.5">
                {member.department && (
                  <span className="rounded-md border border-accent-border bg-accent-surface px-2 py-1 text-caption-2-semibold text-accent-text">
                    {member.department}
                  </span>
                )}
                {member.designation && (
                  <span className="rounded-md border border-purple-border bg-purple-surface px-2 py-1 text-caption-2-semibold text-purple-text">
                    {member.designation}
                  </span>
                )}
              </div>

              {/* Contact */}
              <div className="flex flex-col gap-1.5 border-t border-separator-border pt-3 text-xs">
                <div className="flex min-w-0 items-center gap-1.5 text-text-secondary">
                  <Phone className="h-3 w-3 shrink-0 text-text-tertiary" />
                  <span className="truncate">{member.contactNumber || "—"}</span>
                </div>
                <div className="flex min-w-0 items-center gap-1.5 text-text-secondary">
                  <Mail className="h-3 w-3 shrink-0 text-text-tertiary" />
                  <span className="truncate">{member.email || "—"}</span>
                </div>
              </div>

              {/* Date of Joining / Aadhar */}
              <div className="grid grid-cols-2 gap-3 border-t border-separator-border pt-3 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-text-tertiary">Date of Joining</p>
                  <p className="mt-0.5 truncate font-medium text-text-primary">{formatDate(member.dateOfJoining) || "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-text-tertiary">Aadhar Card</p>
                  {member.aadharFileName ? (
                    <p className="mt-0.5 flex items-center gap-1 truncate font-medium text-text-primary">
                      <FileText className="h-3 w-3 shrink-0 text-text-tertiary" />
                      <span className="truncate">{member.aadharFileName}</span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-text-tertiary">—</p>
                  )}
                </div>
              </div>
            </div>

            {member.identityImageUrl && (
              <div className="h-40 w-32 shrink-0 translate-x-[-8px] translate-y-[32px] overflow-hidden rounded-lg border border-separator-border shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={member.identityImageUrl} alt="Identity" className="h-full w-full object-cover" />
              </div>
            )}
          </div>

          {/* Actions */}
          <div
            className="flex items-center justify-end gap-1 border-t border-separator-border pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onView(member)}
              aria-label={`View ${member.staffId}`}
              className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-success-surface-strong hover:text-success-text"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(member)}
              aria-label={`Edit ${member.staffId}`}
              className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-accent-surface-strong hover:text-accent-text"
            >
              <Pencil className="h-4 w-4" />
            </button>
            {isAdmin && member.deviceBound && onResetDevice && (
              <button
                type="button"
                onClick={() => onResetDevice(member.id, member.name)}
                aria-label={`Reset device for ${member.staffId}`}
                title="Reset device binding"
                className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-warning-surface-strong hover:text-warning-text"
              >
                <Smartphone className="h-4 w-4" />
              </button>
            )}
            {isAdmin && onFreeze && (
              <button
                type="button"
                onClick={() => onFreeze(member)}
                aria-label={`${member.frozenAt ? "Unfreeze" : "Freeze"} ${member.staffId}`}
                title={member.frozenAt ? "Unfreeze Account" : "Freeze Account"}
                className={member.frozenAt
                  ? "rounded-md p-1.5 text-danger-text transition duration-300 hover:bg-success-surface-strong hover:text-success-text"
                  : "rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-danger-surface-strong hover:text-danger-text"}
              >
                {member.frozenAt ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(member.id)}
              aria-label={`Delete ${member.staffId}`}
              className="rounded-md p-1.5 text-text-secondary transition duration-300 hover:bg-danger-surface-strong hover:text-danger-text"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
