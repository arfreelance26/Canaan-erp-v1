"use client";

import { Dialog } from "@/components/ui/Dialog";
import { initialTrucks } from "@/lib/truck-data";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { TyreInventoryItem } from "@/types/tyre-inventory";

type TyreHistoryDialogProps = {
  open: boolean;
  onClose: () => void;
  tyre: TyreInventoryItem | null;
  records: TyreFitmentRecord[];
};

export function TyreHistoryDialog({ open, onClose, tyre, records }: TyreHistoryDialogProps) {
  if (!tyre) return null;

  const tyreRecords = records
    .filter((record) => record.tyreId === tyre.id)
    .sort((a, b) => b.fittedOdometer - a.fittedOdometer);

  return (
    <Dialog open={open} onClose={onClose} title={`Tyre History — ${tyre.tyreNumber}`} className="max-w-2xl">
      {tyreRecords.length === 0 ? (
        <p className="text-sm text-gray-500">This tyre has not been fitted to any truck yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tyreRecords.map((record) => {
            const truck = initialTrucks.find((t) => t.id === record.truckId);

            return (
              <li key={record.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-900">
                    {truck?.registrationNumber ?? "Unknown Truck"} · {record.position}
                  </span>
                  <span
                    className={
                      record.removedOdometer === null
                        ? "shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                        : "shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
                    }
                  >
                    {record.removedOdometer === null ? "Currently Fitted" : "Removed"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  Fitted at {record.fittedOdometer.toLocaleString()} km on {record.fittedDate}
                </p>
                {record.removedOdometer !== null ? (
                  <p className="mt-1 text-xs text-gray-600">
                    Removed at {record.removedOdometer.toLocaleString()} km on {record.removedDate}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-600">Still in service on this truck</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
