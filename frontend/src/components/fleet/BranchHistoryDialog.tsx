"use client";

import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { trucksApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { formatDate } from "@/lib/format-date";

type BranchHistoryEntry = {
  id: number;
  truck_id: number;
  from_branch: string | null;
  to_branch: string;
  note: string;
  changed_by_name: string;
  changed_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  truck: Truck | null;
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function BranchHistoryDialog({ open, onClose, truck }: Props) {
  const [entries, setEntries] = useState<BranchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !truck) return;
    setLoading(true);
    trucksApi
      .getBranchHistory(truck.id)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [open, truck]);

  if (!truck) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Branch History — ${truck.registrationNumber} (${truck.truckId})`}
      className="max-w-lg"
    >
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          No branch changes have been recorded for this truck yet.
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto pr-1">
          <ol className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                    <span className="font-semibold text-gray-500">
                      {entry.from_branch || "Unassigned"}
                    </span>
                    <span className="text-gray-300">→</span>
                    <span className="font-bold text-blue-700">{entry.to_branch}</span>
                  </div>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    {formatTimestamp(entry.changed_at)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-700">{entry.note}</p>
                <p className="mt-1.5 text-[11px] font-medium text-gray-400">
                  by {entry.changed_by_name || "Unknown"}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Dialog>
  );
}
