"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Field } from "@/components/ui/Field";
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
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setVehicleId(currentVehicleId);
      setSearch("");
    }
  }, [open, currentVehicleId]);

  const filteredTrucks = trucks.filter((truck) => {
    const q = search.toLowerCase();
    return (
      truck.truckId.toLowerCase().includes(q) ||
      truck.registrationNumber.toLowerCase().includes(q)
    );
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(vehicleId);
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Assign Vehicle — ${driver?.name ?? ""}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Vehicle</span>
            <div className="relative">
              <Search className={`absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 pointer-events-none transition-colors duration-200 ${search ? "text-blue-500" : "text-gray-400"}`} />
              <input
                type="text"
                placeholder="Search trucks…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-44 rounded-full border border-gray-200 bg-white/70 py-1.5 pl-7 pr-3 text-xs text-gray-700 placeholder-gray-400 shadow-sm backdrop-blur-sm transition-all duration-200 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
          <GlassSelect
            value={vehicleId}
            onChange={(val) => setVehicleId(val)}
            options={[
              { value: "", label: "Unassigned" },
              ...filteredTrucks.map((truck) => {
                const taken = takenVehicleIds.includes(truck.truckId) && truck.truckId !== currentVehicleId;
                return {
                  value: taken ? "" : truck.truckId,
                  label: `${truck.truckId} — ${truck.registrationNumber}${taken ? " (already assigned)" : ""}`,
                };
              }),
            ]}
          />
        </div>

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
