"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { TruckTable } from "@/components/fleet/TruckTable";
import { TruckFormDialog } from "@/components/fleet/TruckFormDialog";
import { trucksApi, uploadFile, fileUrl } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { generateTruckId } from "@/lib/truck-data";
import type { Truck } from "@/types/truck";
import type { TruckFiles } from "@/components/fleet/TruckFormDialog";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

export default function FleetPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const filteredTrucks = trucks.filter(t =>
    !searchQuery ||
    t.registrationNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.truckId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.branchRegisteredTo?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
        trucksApi.list().then(setTrucks).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => {
    trucksApi.list().then(setTrucks).finally(() => setLoading(false));
      }, 5000);

  useWebSocketEvent("truck_updated", () => setRefreshKey(k => k + 1));

  function handleAdd() {
    setEditingTruck(null);
    setDialogOpen(true);
  }

  function handleEdit(truck: Truck) {
    setEditingTruck(truck);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    const result = await confirmDelete("truck");
    if (!result.isConfirmed) return;
    try {
      await trucksApi.delete(id);
      setTrucks((prev) => prev.filter((t) => t.id !== id));
      showSuccess("Truck deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete truck.");
    }
  }

  async function handleSave(truck: Truck, files: TruckFiles) {
    try {
      let saved: Truck;
      if (editingTruck) {
        saved = await trucksApi.update(truck.id, truck);
        setTrucks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        const truckWithId = { ...truck, truckId: truck.truckId || generateTruckId(trucks) };
        saved = await trucksApi.create(truckWithId);
        setTrucks((prev) => [...prev, saved]);
      }
      const uploadMap: [File | null | undefined, string][] = [
        [files.photo,           "photo"],
        [files.rc,              "rc"],
        [files.fc,              "fc"],
        [files.road_tax,        "road_tax"],
        [files.insurance_proof, "insurance"],
        [files.national_permit, "national_permit"],
        [files.local_permit,    "local_permit"],
        [files.pollution_cert,  "pollution_cert"],
      ];
      await Promise.all(
        uploadMap
          .filter(([f]) => !!f)
          .map(([f, field]) => uploadFile("trucks", saved.id, field, f!))
      );
      setDialogOpen(false);
      showSuccess(editingTruck ? "Truck updated successfully." : "Truck added successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save truck.");
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading fleet...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Our Fleet</h1>
          <p className="mt-1 text-sm text-gray-500">Manage trucks across all branches</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search fleet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <DownloadExcelButton path="/exports/trucks" filename="fleet.xlsx" />
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Add Truck
          </button>
        </div>
      </div>

      <div>
        <TruckTable trucks={filteredTrucks} onEdit={handleEdit} onDelete={handleDelete} />
      </div>

      <TruckFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingTruck}
        existingTrucks={trucks}
      />
    </div>
  );
}
