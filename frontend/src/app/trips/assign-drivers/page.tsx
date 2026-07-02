"use client";

import { useEffect, useState } from "react";
import { AssignDriverTable } from "@/components/trips/AssignDriverTable";
import { AssignDriverDialog } from "@/components/trips/AssignDriverDialog";
import { driversApi, trucksApi, assignmentsApi } from "@/lib/api";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { DriverAssignment } from "@/types/driver-assignment";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Search } from "lucide-react";

export default function AssignDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [assignments, setAssignments] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
        Promise.all([driversApi.list(), trucksApi.list(), assignmentsApi.list()])
          .then(([d, t, a]) => {
            setDrivers(d);
            setTrucks(t);
            setAssignments(a);
          })
          .finally(() => setLoading(false));
      }, []);
      useAutoRefresh(() => {
    Promise.all([driversApi.list(), trucksApi.list(), assignmentsApi.list()])
    .then(([d, t, a]) => {
    setDrivers(d);
    setTrucks(t);
    setAssignments(a);
    })
    .finally(() => setLoading(false));
      }, 5000);


  const vehicleByDriverId = Object.fromEntries(
    assignments.map((assignment) => [assignment.driverId, assignment.vehicleId])
  );

  function handleAssign(driver: Driver) {
    setSelectedDriver(driver);
    setDialogOpen(true);
  }

  async function handleSave(vehicleId: string) {
    if (!selectedDriver) return;
    if (!vehicleId) {
      await assignmentsApi.remove(selectedDriver.driverId);
      setAssignments((prev) => prev.filter((a) => a.driverId !== selectedDriver.driverId));
    } else {
      await assignmentsApi.upsert(selectedDriver.driverId, vehicleId);
      setAssignments((prev) => {
        const withoutDriver = prev.filter((a) => a.driverId !== selectedDriver.driverId);
        return [
          ...withoutDriver,
          { id: crypto.randomUUID(), driverId: selectedDriver.driverId, vehicleId },
        ];
      });
    }
    setDialogOpen(false);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  const filteredDrivers = drivers.filter((d) => !searchQuery || d.name?.toLowerCase().includes(searchQuery.toLowerCase()) || d.driverId?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assign Drivers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Assign a vehicle to each driver so they can be selected when creating trips
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search drivers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
          />
        </div>
      </div>

      <AssignDriverTable
        drivers={filteredDrivers}
        trucks={trucks}
        vehicleByDriverId={vehicleByDriverId}
        onAssign={handleAssign}
      />

      <AssignDriverDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        driver={selectedDriver}
        trucks={trucks}
        currentVehicleId={selectedDriver ? vehicleByDriverId[selectedDriver.driverId] ?? "" : ""}
        takenVehicleIds={Object.values(vehicleByDriverId)}
      />
    </div>
  );
}
