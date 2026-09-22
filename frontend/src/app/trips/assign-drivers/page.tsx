"use client";

import { useEffect, useState } from "react";
import { AssignDriverTable } from "@/components/trips/AssignDriverTable";
import { AssignDriverDialog } from "@/components/trips/AssignDriverDialog";
import { driversApi, trucksApi, assignmentsApi } from "@/lib/api";
import { IdCard } from "lucide-react";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { DriverAssignment } from "@/types/driver-assignment";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

import { PillSearch } from "@/components/ui/PillSearch";
export default function AssignDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [assignments, setAssignments] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
        Promise.all([driversApi.list(), trucksApi.list(), assignmentsApi.list()])
          .then(([d, t, a]) => {
            setDrivers(d);
            setTrucks(t);
            setAssignments(a);
          })
          .catch(() => {}).finally(() => setLoading(false));
      }, [refreshKey]);
  useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("trip_updated", () => setRefreshKey(k => k + 1));
  useWebSocketEvent("driver_updated", () => setRefreshKey(k => k + 1));

  const vehicleByDriverId = Object.fromEntries(
    assignments.map((assignment) => [assignment.driverId, assignment.vehicleId])
  );

  function handleAssign(driver: Driver) {
    setSelectedDriver(driver);
    setDialogOpen(true);
  }

  async function handleSave(vehicleId: string) {
    if (!selectedDriver) return;
    try {
      if (!vehicleId) {
        await assignmentsApi.remove(selectedDriver.driverId);
        setAssignments((prev) => prev.filter((a) => a.driverId !== selectedDriver.driverId));
        showSuccess("Vehicle unassigned successfully.");
      } else {
        await assignmentsApi.upsert(selectedDriver.driverId, vehicleId);
        setAssignments((prev) => {
          const withoutDriver = prev.filter((a) => a.driverId !== selectedDriver.driverId);
          return [
            ...withoutDriver,
            { id: crypto.randomUUID(), driverId: selectedDriver.driverId, vehicleId },
          ];
        });
        showSuccess("Vehicle assigned successfully.");
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to assign vehicle.");
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={4} />;

  const filteredDrivers = drivers.filter((d) => !searchQuery || d.name?.toLowerCase().includes(searchQuery.toLowerCase()) || d.driverId?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center gap-3.5">
        <span className="dk-inset flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white text-blue-600 shadow-sm">
          <IdCard className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Assign Drivers</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Assign a vehicle to each driver so they can be selected when creating trips
          </p>
        </div>
      </div>

      {/* Toolbar: search on the left, View on the right (same place as on the other pages) */}
      <div className="flex flex-wrap items-center gap-3">
        <PillSearch placeholder="Search drivers..." value={searchQuery} onChange={setSearchQuery} />
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DownloadExcelButton path="/exports/driver-assignments" filename="driver_assignments.xlsx" />
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
