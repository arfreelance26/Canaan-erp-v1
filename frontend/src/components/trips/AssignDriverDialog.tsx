"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search, Truck as TruckIcon, CheckCircle2, Ban } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
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
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setVehicleId(currentVehicleId);
      setSearch("");
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [open, currentVehicleId]);

  const filtered = trucks.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.registrationNumber.toLowerCase().includes(q) ||
      t.truckId.toLowerCase().includes(q)
    );
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(vehicleId);
  }

  const selectedTruck = trucks.find((t) => t.truckId === vehicleId);

  return (
    <Dialog open={open} onClose={onClose} title={`Assign Vehicle — ${driver?.name ?? ""}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by registration number or truck ID…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-800 placeholder-gray-400 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Truck list */}
        <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/60 p-2 custom-scrollbar">
          {/* Unassigned option */}
          <button
            type="button"
            onClick={() => setVehicleId("")}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-150 ${
              vehicleId === ""
                ? "border-blue-300 bg-blue-50 text-blue-800 shadow-sm"
                : "border-transparent bg-white text-gray-500 hover:border-gray-200 hover:bg-white hover:text-gray-700"
            }`}
          >
            <Ban className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="font-medium">Unassigned</span>
            {vehicleId === "" && (
              <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-blue-500" />
            )}
          </button>

          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-400">No trucks match your search</p>
          )}

          {filtered.map((truck) => {
            const taken = takenVehicleIds.includes(truck.truckId) && truck.truckId !== currentVehicleId;
            const isSelected = vehicleId === truck.truckId;

            return (
              <button
                key={truck.truckId}
                type="button"
                disabled={taken}
                onClick={() => !taken && setVehicleId(truck.truckId)}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-150 ${
                  taken
                    ? "cursor-not-allowed border-transparent bg-gray-100/80 text-gray-400"
                    : isSelected
                    ? "border-blue-300 bg-blue-50 text-blue-800 shadow-sm"
                    : "border-transparent bg-white text-gray-700 hover:border-gray-200 hover:bg-white hover:text-gray-900"
                }`}
              >
                <TruckIcon className={`h-4 w-4 shrink-0 ${taken ? "text-gray-300" : isSelected ? "text-blue-500" : "text-gray-400"}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{truck.registrationNumber}</p>
                  <p className="text-xs text-gray-400 truncate">{truck.truckId}</p>
                </div>
                {taken ? (
                  <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    Assigned
                  </span>
                ) : isSelected ? (
                  <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-blue-500" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Selection summary */}
        <p className="text-xs text-gray-500">
          {selectedTruck
            ? <>Selected: <span className="font-semibold text-gray-700">{selectedTruck.registrationNumber}</span> ({selectedTruck.truckId})</>
            : "No vehicle selected — driver will be unassigned"}
        </p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-interactive rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-interactive rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-blue-700 active:scale-95"
          >
            Save Assignment
          </button>
        </div>
      </form>
    </Dialog>
  );
}
