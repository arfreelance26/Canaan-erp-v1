"use client";

import { Dialog } from "@/components/ui/Dialog";
import { formatDate } from "@/lib/format-date";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { TyreInventoryItem } from "@/types/tyre-inventory";
import type { Truck } from "@/types/truck";

type TyreHistoryDialogProps = {
  open: boolean;
  onClose: () => void;
  tyre: TyreInventoryItem | null;
  records: TyreFitmentRecord[];
  trucks: Truck[];
};

export function TyreHistoryDialog({ open, onClose, tyre, records, trucks }: TyreHistoryDialogProps) {
  if (!tyre) return null;

  const tyreRecords = records
    .filter((record) => record.tyreId === tyre.id)
    .sort((a, b) => b.fittedOdometer - a.fittedOdometer);

  return (
    <Dialog open={open} onClose={onClose} title={`Tyre History — ${tyre.tyreNumber}`} className="max-w-3xl">
      {tyreRecords.length === 0 ? (
        <p className="text-sm text-text-secondary">This tyre has not been fitted to any truck yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tyreRecords.map((record) => {
            const truck = trucks.find((t) => t.id === record.truckId);

            return (
              <li key={record.id} className="rounded-lg border border-separator-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-text-primary">
                    {truck?.registrationNumber ?? "Unknown Truck"} · {record.position}
                  </span>
                  <span
                    className={
                      record.removedOdometer === null
                        ? "shrink-0 rounded-full bg-success-surface px-2.5 py-1 text-caption-1-medium text-success-text"
                        : "shrink-0 rounded-full bg-fill-2 px-2.5 py-1 text-caption-1-medium text-text-secondary"
                    }
                  >
                    {record.removedOdometer === null ? "Currently Fitted" : "Removed"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  Fitted at {record.fittedOdometer.toLocaleString()} km on {formatDate(record.fittedDate)}
                </p>
                {record.removedOdometer !== null ? (
                  <>
                    <p className="mt-1 text-xs text-text-secondary">
                      Removed at {record.removedOdometer.toLocaleString()} km on {formatDate(record.removedDate)}
                    </p>
                    <p className="mt-1 text-caption-1-medium text-text-primary">
                      Total Distance Covered: {(record.removedOdometer - record.fittedOdometer).toLocaleString()} km
                    </p>
                    {record.removalRemark && (
                      <p className="mt-1 text-xs text-text-secondary">Remark: {record.removalRemark}</p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-xs text-text-secondary">Still in service on this truck</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
