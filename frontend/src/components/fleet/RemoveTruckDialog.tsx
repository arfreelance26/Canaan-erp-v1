"use client";

import { RiHandCoinLine as HandCoins, RiDeleteBinLine as Trash2, RiArrowRightSLine as ChevronRight } from "@remixicon/react";
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
    tile: "bg-accent-solid/10 text-accent-text-strong",
    hover: "hover:border-accent-solid/30 hover:bg-accent-solid-hover/[0.03]",
  },
  {
    key: "delete",
    title: "Delete Truck",
    description: "Added by mistake, a duplicate, or scrapped. It moves to the Archive, where an Admin can restore it.",
    Icon: Trash2,
    tile: "bg-danger-surface text-danger-text",
    hover: "hover:border-danger-border hover:bg-danger-surface-strong/40",
  },
] as const;

/** Our Fleet → delete: first asks whether the truck is being sold or deleted. */
export function RemoveTruckDialog({ truck, onClose, onSell, onDelete }: Props) {
  if (!truck) return null;

  return (
    <Dialog open={truck !== null} onClose={onClose} title="Remove Truck from Fleet" className="max-w-lg">
      <p className="mb-4 text-sm text-text-secondary">
        <span className="font-semibold text-text-primary">{truck.registrationNumber}</span>
        <span className="text-text-tertiary"> · {truck.truckId}</span>
        {" "}— what&rsquo;s happening to this truck?
      </p>

      <div className="flex flex-col gap-3">
        {OPTIONS.map(({ key, title, description, Icon, tile, hover }) => (
          <button
            key={key}
            type="button"
            onClick={() => (key === "sell" ? onSell(truck) : onDelete(truck))}
            className={`group flex items-center gap-4 rounded-2xl border border-separator-border bg-background-primary-default px-4 py-4 text-left transition-colors ${hover}`}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile}`}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body-semibold text-text-primary">{title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">{description}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:text-text-secondary" />
          </button>
        ))}
      </div>
    </Dialog>
  );
}
