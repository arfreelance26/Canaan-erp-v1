"use client";

import { useEffect, useState } from "react";
import { AssignDriverTable } from "@/components/trips/AssignDriverTable";
import { AssignDriverDialog } from "@/components/trips/AssignDriverDialog";
import { driversApi, trucksApi, assignmentsApi } from "@/lib/api";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { DriverAssignment } from "@/types/driver-assignment";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Search, Download } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";

export default function AssignDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [assignments, setAssignments] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
        Promise.all([driversApi.list(), trucksApi.list(), assignmentsApi.list()])
          .then(([d, t, a]) => {
            setDrivers(d);
            setTrucks(t);
            setAssignments(a);
          })
          .finally(() => setLoading(false));
      }, [refreshKey]);
      useAutoRefresh(() => {
    Promise.all([driversApi.list(), trucksApi.list(), assignmentsApi.list()])
    .then(([d, t, a]) => {
    setDrivers(d);
    setTrucks(t);
    setAssignments(a);
    })
    .finally(() => setLoading(false));
      }, 5000);

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

  async function handleDownloadPDF() {
    if (downloading || drivers.length === 0) return;
    setDownloading(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginX = 14;
      const marginY = 14;
      const rowH = 8;
      const headerH = 9;

      const cols: [string, number][] = [
        ["Driver ID",       35],
        ["Driver Name",     60],
        ["Vehicle Reg No",  55],
        ["Truck ID",        32],
      ];

      const truckById = new Map(trucks.map((t) => [t.truckId, t]));

      function drawPageHeader(pageNum: number, totalPages: number) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(27, 43, 94);
        pdf.text("Driver-Vehicle Assignments", marginX, marginY);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text(
          `Generated on ${today}  ·  ${drivers.length} driver${drivers.length !== 1 ? "s" : ""}`,
          marginX, marginY + 5,
        );
        pdf.text(`Page ${pageNum} of ${totalPages}`, pageW - marginX, marginY + 5, { align: "right" });

        const tableTop = marginY + 10;
        pdf.setFillColor(27, 43, 94);
        pdf.rect(marginX, tableTop, pageW - marginX * 2, headerH, "F");

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(255, 255, 255);
        let x = marginX;
        for (const [label, w] of cols) {
          pdf.text(label.toUpperCase(), x + 2, tableTop + 6);
          x += w;
        }
        return tableTop + headerH;
      }

      const rowData = drivers.map((driver) => {
        const vehicleId = vehicleByDriverId[driver.driverId];
        const truck = vehicleId ? truckById.get(vehicleId) : undefined;
        return [
          driver.driverId,
          driver.name ?? "—",
          truck?.registrationNumber ?? "—",
          vehicleId ?? "—",
        ];
      });

      const usableH = pageH - marginY - 20;
      const rowsPerPage = Math.floor((usableH - headerH) / rowH);
      const totalPages = Math.ceil(rowData.length / rowsPerPage);

      let rowIndex = 0;
      for (let page = 1; page <= totalPages; page++) {
        if (page > 1) pdf.addPage();
        const y = drawPageHeader(page, totalPages);

        const pageRows = rowData.slice(rowIndex, rowIndex + rowsPerPage);
        rowIndex += rowsPerPage;

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);

        for (let r = 0; r < pageRows.length; r++) {
          const rowY = y + r * rowH;
          if (r % 2 === 1) {
            pdf.setFillColor(249, 250, 251);
            pdf.rect(marginX, rowY, pageW - marginX * 2, rowH, "F");
          }
          pdf.setDrawColor(229, 231, 235);
          pdf.line(marginX, rowY + rowH, pageW - marginX, rowY + rowH);

          pdf.setTextColor(30, 30, 30);
          let x = marginX;
          for (let c = 0; c < cols.length; c++) {
            const [, w] = cols[c];
            const clipped = pdf.splitTextToSize(String(pageRows[r][c] ?? "—"), w - 4)[0] ?? "";
            pdf.text(clipped, x + 2, rowY + 5.5);
            x += w;
          }
        }

        pdf.setDrawColor(209, 213, 219);
        pdf.rect(marginX, y, pageW - marginX * 2, pageRows.length * rowH, "S");
      }

      pdf.save(`driver-assignments-${today.replace(/ /g, "-")}.pdf`);
    } catch {
      showError("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={4} />;

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
        <div className="flex items-center gap-3">
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
        <DownloadExcelButton path="/exports/driver-assignments" filename="driver_assignments.xlsx" />
        <button
          type="button"
          onClick={handleDownloadPDF}
          disabled={downloading || drivers.length === 0}
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Generating..." : "Download PDF"}
        </button>
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
