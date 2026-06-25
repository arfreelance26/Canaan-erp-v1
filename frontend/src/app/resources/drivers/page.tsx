"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { DriverTable } from "@/components/drivers/DriverTable";
import { DriverFormDialog } from "@/components/drivers/DriverFormDialog";
import { driversApi, uploadFile, fileUrl } from "@/lib/api";
import { generateDriverId } from "@/lib/driver-data";
import type { Driver } from "@/types/driver";
import type { DriverFiles } from "@/components/drivers/DriverFormDialog";

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    driversApi.list().then(setDrivers).finally(() => setLoading(false));
  }, []);

  function handleAdd() {
    setEditingDriver(null);
    setDialogOpen(true);
  }

  function handleEdit(driver: Driver) {
    setEditingDriver(driver);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this driver?")) return;
    await driversApi.delete(id);
    setDrivers((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleSave(driver: Driver, files: DriverFiles) {
    let saved: Driver;
    if (editingDriver) {
      saved = await driversApi.update(driver.id, driver, driver.password || undefined);
      setDrivers((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
    } else {
      const driverWithId = { ...driver, driverId: driver.driverId || generateDriverId(drivers) };
      saved = await driversApi.create(driverWithId, driver.password);
      setDrivers((prev) => [...prev, saved]);
    }
    // Upload files to BLOB storage
    await Promise.all([
      files.photo   && uploadFile("drivers", saved.id, "photo",   files.photo),
      files.aadhaar && uploadFile("drivers", saved.id, "aadhaar", files.aadhaar),
      files.license && uploadFile("drivers", saved.id, "license", files.license),
    ].filter(Boolean));
    // Set photo URL to the backend file endpoint so the avatar renders from DB
    if (files.photo) {
      setDrivers((prev) => prev.map((d) =>
        d.id === saved.id ? { ...d, photoUrl: fileUrl("drivers", saved.id, "photo") } : d
      ));
    }
    setDialogOpen(false);
  }

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading drivers...</div>;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Our Drivers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage driver records across all branches
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
         
         
        >
          <Plus className="h-4 w-4" />
          Add Driver
        </button>
      </div>

      <div>
        <DriverTable drivers={drivers} onEdit={handleEdit} onDelete={handleDelete} />
      </div>

      <DriverFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialData={editingDriver}
        existingDrivers={drivers}
      />
    </div>
  );
}
