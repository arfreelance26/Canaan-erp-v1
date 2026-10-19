"use client";

import { HandCoins, Trash2, ChevronRight } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import type { Truck } from "@/types/truck";

type Props = {
  truck: Truck | null;
  onClose: () => void;
  /** The truck was sold and is leaving the fleet. */
  onSell: (truck: Truck) => void;
  /** Entered by mistake, a duplicate, or scrapped. */
  onDelete: (truck: Truck) => void;
};

const OPTIONS = [
  {
    key: "sell",
    title: "Sell Truck",
    description: "The truck was sold to a buyer and is leaving the fleet. Its trips, maintenance and other records are kept.",
    Icon: HandCoins,
    tile: "bg-brand-navy/10 text-brand-navy",
    hover: "hover:border-brand-navy/30 hover:bg-brand-navy/[0.03]",
  },
  {
    key: "delete",
    title: "Delete Truck",
    description: "Added by mistake, a duplicate, or scrapped. It moves to the Archive, where an Admin can restore it.",
    Icon: Trash2,
    tile: "bg-rose-50 text-rose-500",
    hover: "hover:border-rose-200 hover:bg-rose-50/40",
  },
] as const;

/** Our Fleet → delete: first asks whether the truck is being sold or deleted. */
export function RemoveTruckDialog({ truck, onClose, onSell, onDelete }: Props) {
  if (!truck) return null;

  return (
    <Dialog open={truck !== null} onClose={onClose} title="Remove Truck from Fleet" className="max-w-lg">
      <p className="mb-4 text-sm text-slate-500">
        <span className="font-semibold text-slate-800">{truck.registrationNumber}</span>
        <span className="text-slate-400"> · {truck.truckId}</span>
        {" "}— what&rsquo;s happening to this truck?
      </p>

      <div className="flex flex-col gap-3">
        {OPTIONS.map(({ key, title, description, Icon, tile, hover }) => (
          <button
            key={key}
            type="button"
            onClick={() => (key === "sell" ? onSell(truck) : onDelete(truck))}
            className={`group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition-colors ${hover}`}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile}`}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
          </button>
        ))}
      </div>
    </Dialog>
  );
}
