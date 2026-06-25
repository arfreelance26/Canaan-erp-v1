"use client";

import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import type { MaintenanceStatusItem } from "@/types/truck-maintenance";
import type { Truck } from "@/types/truck";

type MaintenanceStatusDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  truck: Truck | null;
  items: MaintenanceStatusItem[];
  emptyMessage: string;
};

export function MaintenanceStatusDialog({ open, onClose, title, truck, items, emptyMessage }: MaintenanceStatusDialogProps) {
  if (!truck) return null;

  return (
    <Dialog open={open} onClose={onClose} title={`${title} — ${truck.registrationNumber}`} className="max-w-2xl">
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={`${item.category}-${item.item}`} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-gray-900">{item.item}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                    item.status === "attention" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"
                  )}
                >
                  {item.status === "attention" ? "Overdue" : "Upcoming"}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {item.category} · every {item.intervalKm.toLocaleString()} km
              </p>
              <p className="mt-1 text-xs text-gray-600">
                {item.lastDoneOdometer !== null
                  ? `Last done at ${item.lastDoneOdometer.toLocaleString()} km${item.lastDoneDate ? ` on ${item.lastDoneDate}` : ""}`
                  : "No record found — never performed"}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Due at {item.dueAtOdometer.toLocaleString()} km
                {item.remainingKm > 0
                  ? ` (in ${item.remainingKm.toLocaleString()} km)`
                  : ` (overdue by ${Math.abs(item.remainingKm).toLocaleString()} km)`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
