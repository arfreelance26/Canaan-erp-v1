"use client";

import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { initialTrucks } from "@/lib/truck-data";
import {
  getNumberOfRetreads,
  getTotalInvestment,
  getTyreAgeInDays,
} from "@/lib/tyre-report";
import type { TyreFitmentRecord } from "@/types/tyre-fitment";
import type { TyreInventoryItem } from "@/types/tyre-inventory";

type TyreReportDialogProps = {
  open: boolean;
  onClose: () => void;
  tyre: TyreInventoryItem | null;
  records: TyreFitmentRecord[];
};



export function TyreReportDialog({ open, onClose, tyre, records }: TyreReportDialogProps) {
  if (!tyre) return null;

  const totalInvestment = getTotalInvestment(tyre);
  const numberOfRetreads = getNumberOfRetreads(tyre);
  const ageInDays = getTyreAgeInDays(tyre);

  return (
    <Dialog open={open} onClose={onClose} title={`Tyre Report — ${tyre.tyreNumber}`} className="max-w-2xl">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">


        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">Remaining Tread %</p>
          <p className="mt-1 text-lg font-semibold text-gray-400">Pending Tyre Manager Data</p>
          <p className="mt-1 text-xs text-gray-500">
            Calculated from the latest tread depth inspection once the Tyre Manager app is live
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">Estimated Remaining Life</p>
          <p className="mt-1 text-lg font-semibold text-gray-400">Pending Tyre Manager Data</p>
          <p className="mt-1 text-xs text-gray-500">
            Predicted from tread wear rate vs. kilometers travelled once tread inspections are recorded
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">Number of Retreads</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{numberOfRetreads}</p>
          <p className="mt-1 text-xs text-gray-500">Total retread cycles recorded for this tyre</p>
        </div>


      </div>
    </Dialog>
  );
}
