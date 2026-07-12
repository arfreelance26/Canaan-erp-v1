"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { DriverTable } from "@/components/drivers/DriverTable";
import { DriverFormDialog, DRAFT_KEY as DRIVER_DRAFT_KEY } from "@/components/drivers/DriverFormDialog";
import { clearFormDraft } from "@/hooks/useFormDraft";
import { driversApi, uploadFile, fileUrl } from "@/lib/api";
import { confirmDelete, showSuccess, showError } from "@/lib/swal";
import { generateDriverId } from "@/lib/driver-data";
import type { Driver } from "@/types/driver";
import type { DriverFiles } from "@/components/drivers/DriverFormDialog";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const filteredDrivers = drivers.filter(d => 
    !searchQuery ||
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.driverId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
        driversApi.list().then(setDrivers).finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => setRefreshKey(k => k + 1), 5000);

  useWebSocketEvent("driver_updated", () => setRefreshKey(k => k + 1));

  function handleAdd() {
    setEditingDriver(null);
    setDialogOpen(true);
  }

  function handleEdit(driver: Driver) {
    setEditingDriver(driver);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    const result = await confirmDelete("driver");
    if (!result.isConfirmed) return;
    try {
      await driversApi.delete(id);
      setDrivers((prev) => prev.filter((d) => d.id !== id));
      showSuccess("Driver deleted successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to delete driver.");
    }
  }

  async function handleSave(driver: Driver, files: DriverFiles) {
    try {
      let saved: Driver;
      if (editingDriver) {
        saved = await driversApi.update(driver.id, driver, driver.password || undefined);
        setDrivers((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
      } else {
        const driverWithId = { ...driver, driverId: driver.driverId || generateDriverId(drivers) };
        saved = await driversApi.create(driverWithId, driver.password);
        setDrivers((prev) => [...prev, saved]);
        clearFormDraft(DRIVER_DRAFT_KEY);
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
      showSuccess(editingDriver ? "Driver updated successfully." : "Driver added successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save driver.");
    }
  }

  if (loading) return <PageSkeleton hasButton hasSearch columns={11} rows={8} />;

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Our Drivers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage driver records across all branches
          </p>
        </div>
        <div className="flex items-center gap-4">
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
          <DownloadExcelButton path="/exports/drivers" filename="drivers.xlsx" />
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Add Driver
          </button>
        </div>
      </div>

      <div>
        <DriverTable drivers={filteredDrivers} onEdit={handleEdit} onDelete={handleDelete} />
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
