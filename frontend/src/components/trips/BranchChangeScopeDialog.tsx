"use client";

import { X, GitBranch, CalendarClock, Infinity as InfinityIcon } from "lucide-react";

type Props = {
  open: boolean;
  truckLabel: string;
  fromBranch: string;
  toBranch: string;
  onChoose: (scope: "trip_only" | "permanent") => void;
  onClose: () => void;
};

export function BranchChangeScopeDialog({ open, truckLabel, fromBranch, toBranch, onChoose, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/60 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
              <GitBranch className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900">Change Branch</h2>
              <p className="text-[11px] text-gray-500">{truckLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
            <span className="font-semibold text-gray-500">{fromBranch || "Unassigned"}</span>
            <span className="text-gray-300">→</span>
            <span className="font-semibold text-blue-700">{toBranch}</span>
          </div>

          <p className="text-sm text-gray-600">How should this branch change apply to the vehicle?</p>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => onChoose("trip_only")}
              className="flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <CalendarClock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">This Trip Only</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  The truck reverts to {fromBranch || "its original branch"} automatically once this trip is invoiced or waived.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onChoose("permanent")}
              className="flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
                <InfinityIcon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Permanently</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  The truck stays assigned to {toBranch} until someone changes it again.
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
