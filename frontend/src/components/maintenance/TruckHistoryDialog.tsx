"use client";

import { useMemo, useState } from "react";
import { History, RefreshCw, Wrench, PlusCircle, User } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useTyreInventory } from "@/context/TyreInventoryContext";
import { formatDate } from "@/lib/format-date";
import type { Truck } from "@/types/truck";

type TruckHistoryDialogProps = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
};

// Same quick-remark set ManageTyresDialog offers for the rotation confirm
// step — a removal carrying one of these is a rotation, not a plain removal.
const ROTATION_REMARKS = new Set([
  "Tyre Rotation",
  "LHS to RHS to LHS",
  "Tyre Side Change",
  "Wear Balancing",
  "Preventive Rotation",
]);

type EventType = "Attachment" | "Removal" | "Rotation";

type HistoryEvent = {
  key: string;
  type: EventType;
  date: string;
  odometer: number;
  tyreNumber: string;
  description: string;
  userName: string | null;
};

const TYPE_STYLES: Record<EventType, string> = {
  Attachment: "bg-blue-50 text-blue-700",
  Removal: "bg-red-50 text-red-700",
  Rotation: "bg-purple-50 text-purple-700",
};

const TYPE_ICONS: Record<EventType, typeof PlusCircle> = {
  Attachment: PlusCircle,
  Removal: Wrench,
  Rotation: RefreshCw,
};

const TYPE_FILTERS: EventType[] = ["Rotation", "Attachment", "Removal"];

export function TruckHistoryDialog({ open, onClose, truck }: TruckHistoryDialogProps) {
  const { tyres, fitmentRecords } = useTyreInventory();
  const [typeFilter, setTypeFilter] = useState<EventType | null>(null);

  const events = useMemo(() => {
    if (!truck) return [];
    const truckRecords = fitmentRecords.filter((f) => f.truckId === truck.id);
    const rows: HistoryEvent[] = [];

    for (const record of truckRecords) {
      const tyreNumber = tyres.find((t) => t.id === record.tyreId)?.tyreNumber ?? "—";

      // A rotation swap opens a new fitment at the target position with the
      // same remark as the position it closed (e.g. "Tyre Rotation") — so an
      // "attachment" carrying one of these remarks is really the other half
      // of a rotation, not an unrelated fresh fitment.
      const fitIsRotation = !!record.fittedRemark && ROTATION_REMARKS.has(record.fittedRemark);
      rows.push({
        key: `${record.id}-fit`,
        type: fitIsRotation ? "Rotation" : "Attachment",
        date: record.fittedDate,
        odometer: record.fittedOdometer,
        tyreNumber,
        // The exact remark typed in the Manage Tyres dialog — nothing else.
        description: record.fittedRemark ?? "",
        userName: record.fittedByName,
      });

      if (record.removedOdometer != null && record.removedDate) {
        const isRotation = !!record.removalRemark && ROTATION_REMARKS.has(record.removalRemark);
        rows.push({
          key: `${record.id}-remove`,
          type: isRotation ? "Rotation" : "Removal",
          date: record.removedDate,
          odometer: record.removedOdometer,
          tyreNumber,
          // The exact remark typed in the Manage Tyres dialog — nothing else.
          description: record.removalRemark ?? "",
          userName: record.removedByName,
        });
      }
    }

    return rows.sort((a, b) => {
      const dateDiff = (b.date || "").localeCompare(a.date || "");
      if (dateDiff !== 0) return dateDiff;
      return b.odometer - a.odometer;
    });
  }, [truck, tyres, fitmentRecords]);

  const counts = useMemo(() => {
    const acc: Record<EventType, number> = { Rotation: 0, Attachment: 0, Removal: 0 };
    for (const e of events) acc[e.type]++;
    return acc;
  }, [events]);

  const filteredEvents = typeFilter ? events.filter((e) => e.type === typeFilter) : events;

  if (!truck) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Truck History — ${truck.registrationNumber}`}
      className="sm:max-w-2xl md:max-w-3xl"
    >
      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <History className="h-7 w-7 text-gray-200" />
          <p className="text-sm font-medium text-gray-500">No tyre changes logged for this truck yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTypeFilter(null)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                typeFilter === null ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              All ({events.length})
            </button>
            {TYPE_FILTERS.map((t) => {
              const Icon = TYPE_ICONS[t];
              const active = typeFilter === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter((prev) => (prev === t ? null : t))}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active ? `${TYPE_STYLES[t]} ring-2 ring-offset-1 ring-current` : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {t} ({counts[t]})
                </button>
              );
            })}
          </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Type</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Odometer</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Tyre Number</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Description</th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                    No {typeFilter} events for this truck.
                  </td>
                </tr>
              ) : filteredEvents.map((event) => {
                const Icon = TYPE_ICONS[event.type];
                return (
                  <tr key={event.key} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_STYLES[event.type]}`}>
                        <Icon className="h-3 w-3" />
                        {event.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{formatDate(event.date)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{event.odometer.toLocaleString("en-IN")} km</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{event.tyreNumber}</td>
                    <td className="max-w-[260px] truncate px-4 py-2.5 text-gray-700" title={event.description || undefined}>
                      {event.description || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-gray-400" />
                        {event.userName || "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </Dialog>
  );
}
