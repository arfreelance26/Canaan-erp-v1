"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { TruckTable } from "@/components/fleet/TruckTable";
import { TruckFormDialog } from "@/components/fleet/TruckFormDialog";
import { trucksApi, uploadFile } from "@/lib/api";
import { generateTruckId } from "@/lib/truck-data";
import type { Truck } from "@/types/truck";
import type { TruckFiles } from "@/components/fleet/TruckFormDialog";

export default function FleetPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    trucksApi.list().then(setTrucks).finally(() => setLoading(false));
  }, []);

  function handleAdd() {
    setEditingTruck(null);
    setDialogOpen(true);
  }

  function handleEdit(truck: Truck) {
    setEditingTruck(truck);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this truck?")) return;
    await trucksApi.delete(id);
    setTrucks((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleSave(truck: Truck, files: TruckFiles) {
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
      [files.photo,          "photo"],
      [files.rc,             "rc"],
      [files.fc,             "fc"],
      [files.road_tax,       "road_tax"],
      [files.national_permit,"national_permit"],
      [files.local_permit,   "local_permit"],
      [files.pollution_cert, "pollution_cert"],
    ];
    await Promise.all(
      uploadMap
        .filter(([f]) => !!f)
        .map(([f, field]) => uploadFile("trucks", saved.id, field, f!))
    );
    setDialogOpen(false);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading fleet...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Our Fleet</h1>
          <p className="mt-1 text-sm text-gray-500">Manage trucks across all branches</p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
         
         
        >
          <Plus className="h-4 w-4" />
          Add Truck
        </button>
      </div>

      <div>
        <TruckTable trucks={trucks} onEdit={handleEdit} onDelete={handleDelete} />
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
