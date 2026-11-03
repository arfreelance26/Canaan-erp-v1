"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { RiSearchLine as Search, RiTruckLine as TruckIcon, RiCheckboxCircleLine as CheckCircle2, RiForbidLine as Ban } from "@remixicon/react";
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
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by registration number or truck ID…"
            className="w-full rounded-lg border border-separator-border bg-background-primary-default py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder-text-placeholder shadow-sm transition focus:border-accent-border-strong focus:outline-none focus:ring-2 focus:ring-accent-solid/20"
          />
        </div>

        {/* Truck list */}
        <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-xl border border-separator-border bg-fill-1 p-2 custom-scrollbar">
          {/* Unassigned option */}
          <button
            type="button"
            onClick={() => setVehicleId("")}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition duration-150 ${
              vehicleId === ""
                ? "border-accent-border-strong bg-accent-surface text-accent-text-strong shadow-sm"
                : "border-transparent bg-background-primary-default text-text-secondary hover:border-separator-border hover:bg-fill-2 hover:text-text-primary"
            }`}
          >
            <Ban className="h-4 w-4 shrink-0 text-text-tertiary" />
            <span className="font-medium">Unassigned</span>
            {vehicleId === "" && (
              <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-accent-text" />
            )}
          </button>

          {filtered.length === 0 && (
            <p className="py-4 text-center text-sm text-text-tertiary">No trucks match your search</p>
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
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition duration-150 ${
                  taken
                    ? "cursor-not-allowed border-transparent bg-fill-2 text-text-tertiary"
                    : isSelected
                    ? "border-accent-border-strong bg-accent-surface text-accent-text-strong shadow-sm"
                    : "border-transparent bg-background-primary-default text-text-primary hover:border-separator-border hover:bg-fill-2 hover:text-text-primary"
                }`}
              >
                <TruckIcon className={`h-4 w-4 shrink-0 ${taken ? "text-text-tertiary" : isSelected ? "text-accent-text" : "text-text-tertiary"}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{truck.registrationNumber}</p>
                  <p className="text-xs text-text-tertiary truncate">{truck.truckId}</p>
                </div>
                {taken ? (
                  <span className="ml-auto shrink-0 rounded-full bg-warning-surface-strong px-2 py-0.5 text-caption-1-semibold text-warning-text">
                    Assigned
                  </span>
                ) : isSelected ? (
                  <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-accent-text" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Selection summary */}
        <p className="text-xs text-text-secondary">
          {selectedTruck
            ? <>Selected: <span className="font-semibold text-text-primary">{selectedTruck.registrationNumber}</span> ({selectedTruck.truckId})</>
            : "No vehicle selected — driver will be unassigned"}
        </p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-interactive rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-primary transition duration-200 hover:bg-fill-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-interactive rounded-lg bg-accent-solid px-4 py-2 text-body-medium text-on-solid transition duration-200 hover:bg-accent-solid-hover"
          >
            Save Assignment
          </button>
        </div>
      </form>
    </Dialog>
  );
}
