"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";

type AssignDriverDialogProps = {
  open: boolean;
  onClose: () => void;
  onSave: (vehicleId: string) => void;
  driver: Driver | null;
  trucks: Truck[];
  currentVehicleId: string;
  takenVehicleIds: string[];
};

export function AssignDriverDialog({
  open,
  onClose,
  onSave,
  driver,
  trucks,
  currentVehicleId,
  takenVehicleIds,
}: AssignDriverDialogProps) {
  const [vehicleId, setVehicleId] = useState("");

  useEffect(() => {
    if (open) setVehicleId(currentVehicleId);
  }, [open, currentVehicleId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(vehicleId);
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Assign Vehicle — ${driver?.name ?? ""}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Vehicle">
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className={inputClass}
          >
            <option value="">Unassigned</option>
            {trucks.map((truck) => {
              const taken = takenVehicleIds.includes(truck.truckId) && truck.truckId !== currentVehicleId;
              return (
                <option key={truck.id} value={truck.truckId} disabled={taken}>
                  {truck.truckId} — {truck.registrationNumber}
                  {taken ? " (already assigned)" : ""}
                </option>
              );
            })}
          </select>
        </Field>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-interactive rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Assignment
          </button>
        </div>
      </form>
    </Dialog>
  );
}
