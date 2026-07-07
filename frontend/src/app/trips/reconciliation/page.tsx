"use client";

import { useEffect, useState } from "react";
import { tripsApi, driversApi, trucksApi, customersApi, editApprovalsApi } from "@/lib/api";
import { useGlobalSearchQuery } from "@/lib/trip-search";
import { TripSheetDialog } from "@/components/trips/TripSheetDialog";
import { BookingSheetDialog } from "@/components/trips/BookingSheetDialog";
import { EditRequestDialog } from "@/components/attendance/EditRequestDialog";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Truck } from "@/types/truck";
import type { Customer } from "@/types/customer";
import type { TripSheetData } from "@/types/trip-sheet";
import type { TripClosureData } from "@/types/trip-closure";
import type { EditApprovalRequest, EditApprovalResourceType } from "@/types/edit-approval";
import { n } from "@/types/trip-sheet";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import { Search, CheckCircle2 } from "lucide-react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { showSuccess, showError } from "@/lib/swal";
import { DownloadExcelButton } from "@/components/ui/DownloadExcelButton";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";

type DialogMode = "add" | "view" | "edit";

export default function TripReconciliationPage() {
  const { user } = useAuth();
  const isStaff = user?.softwareDesignation === "Trip Sheet Register";
  const isAdmin = user?.softwareDesignation === "Admin";
  const { pushSheetAlert } = useNotifications();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Local cache: tripId -> closure data and sheet data
  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());

  // Trip Sheet dialog
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>("add");

  // Booking Sheet dialog
  const [bookingSheetTrip, setBookingSheetTrip] = useState<Trip | null>(null);
  const [bookingSheetReadOnly, setBookingSheetReadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  useGlobalSearchQuery(setSearchQuery);
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  // Edit approval state (Staff only)
  const [activeApprovals, setActiveApprovals] = useState<EditApprovalRequest[]>([]);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [pendingEditAction, setPendingEditAction] = useState<{
    resourceType: EditApprovalResourceType;
    trip: Trip;
  } | null>(null);

  async function loadReconciliationData() {
    const [t, d, tr, c] = await Promise.all([
      tripsApi.list("Completed"),
      driversApi.list(),
      trucksApi.list(),
      customersApi.list(),
    ]);
    setDrivers(d);
    setTrucks(tr);
    setCustomers(c);

    // All delivered trips — closure is guaranteed by the sheet-collection step (hasClosure gate)
    const deliveredTrips = t.filter((trip) => trip.tripSheetCollected === true);
    setTrips(deliveredTrips);

    const closureResults = await Promise.all(
      deliveredTrips.map((trip) =>
        tripsApi.getClosure(trip.id).then((closure) => ({ tripId: trip.id, closure })).catch(() => null)
      )
    );
    const closureMap = new Map<string, TripClosureData>();
    for (const result of closureResults) {
      if (result) closureMap.set(result.tripId, result.closure);
    }
    setClosures(closureMap);

    // Fetch sheets for all delivered trips, not just those with closures
    const sheetResults = await Promise.all(
      deliveredTrips.map((trip) =>
        trip.hasSheet
          ? tripsApi.getSheet(trip.id).then((sheet) => ({ tripId: trip.id, sheet })).catch(() => null)
          : Promise.resolve(null)
      )
    );
    const sheetMap = new Map<string, TripSheetData>();
    for (const result of sheetResults) {
      if (result && result.sheet) sheetMap.set(result.tripId, result.sheet);
    }
    setSheets(sheetMap);
  }

  useEffect(() => {
    loadReconciliationData().finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAutoRefresh(() => {
    loadReconciliationData();
  }, 5000);

  useWebSocketEvent("sheet_collected", loadReconciliationData);
  useWebSocketEvent("sheet_unmarked", loadReconciliationData);
  useWebSocketEvent("sheet_received", loadReconciliationData);
  useWebSocketEvent("trip_updated", loadReconciliationData);

  // Admin alert: someone in reconciliation reported a missing physical sheet
  useWebSocketEvent("sheet_not_received_alert", (payload) => {
    const isAdminOrManager =
      user?.softwareDesignation === "Admin" ||
      user?.softwareDesignation === "Fleet Manager" ||
      user?.softwareDesignation === "Finance Manager";
    if (!isAdminOrManager) return;
    const p = payload as { trip_id_str?: string; booking_reference_no?: string; reported_by?: string };
    showError(
      `⚠️ Trip Sheet Not Received\n\nTrip ${p.trip_id_str ?? ""} (${p.booking_reference_no ?? ""}) was marked as delivered by the Yard Staff but was NOT received in reconciliation.\n\nReported by: ${p.reported_by ?? "Unknown"}`
    );
    loadReconciliationData();
  });

  // Load and refresh active edit approvals for all non-admin users
  useEffect(() => {
    if (isAdmin || !user) return;
    editApprovalsApi.getMyActive().then(setActiveApprovals).catch(() => {});
  }, [isAdmin, user]);
  useWebSocketEvent("edit_approval_updated", () => {
    if (isAdmin || !user) return;
    editApprovalsApi.getMyActive().then(setActiveApprovals).catch(() => {});
  });

  function hasActiveApproval(resourceType: EditApprovalResourceType, tripId: string): boolean {
    return activeApprovals.some((a) =>
      a.resourceType === resourceType &&
      String(a.resourceId) === tripId &&
      a.action === "Edit" &&
      a.expiresAt != null &&
      new Date(a.expiresAt.endsWith("Z") ? a.expiresAt : a.expiresAt + "Z") > new Date()
    );
  }

  const driverById = new Map(drivers.map((d) => [d.driverId, d]));
  const truckById = new Map(trucks.map((t) => [t.truckId, t]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  function openDialog(trip: Trip, mode: DialogMode) {
    if (mode === "edit" && isStaff && !hasActiveApproval("TripSheet", trip.id)) {
      setPendingEditAction({ resourceType: "TripSheet", trip });
      setEditRequestOpen(true);
      return;
    }
    setSelectedTrip(trip);
    setDialogMode(mode);
  }

  function openBookingSheet(trip: Trip, readOnly: boolean) {
    if (!readOnly && isStaff && !hasActiveApproval("BookingSheet", trip.id)) {
      setPendingEditAction({ resourceType: "BookingSheet", trip });
      setEditRequestOpen(true);
      return;
    }
    setBookingSheetTrip(trip);
    setBookingSheetReadOnly(readOnly);
  }

  async function handleEditRequestSubmit(reason: string) {
    if (!pendingEditAction) return;
    const { resourceType, trip } = pendingEditAction;
    const resourceName = trip.bookingReferenceNo || trip.tripId;
    await editApprovalsApi.create({
      resourceType,
      resourceId: parseInt(trip.id),
      resourceName,
      action: "Edit",
      reason,
    });
    showSuccess("Edit request has been sent.");
    setEditRequestOpen(false);
    setPendingEditAction(null);
  }

  async function handleSubmitSheet(data: TripSheetData) {
    if (!selectedTrip) return;
    try {
      const saved = await tripsApi.upsertSheet(selectedTrip.id, data);
      setSheets((prev) => new Map([...prev, [selectedTrip.id, saved]]));
      setSelectedTrip(null);
      showSuccess("Trip sheet saved successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save trip sheet.");
    }
  }

  async function handleBookingSheetSubmit(data: TripClosureData) {
    if (!bookingSheetTrip) return;
    try {
      const updated = await tripsApi.close(bookingSheetTrip.id, data);
      setClosures((prev) => new Map([...prev, [bookingSheetTrip.id, updated]]));
      setBookingSheetTrip(null);
      showSuccess("Booking sheet saved successfully.");
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to save booking sheet.");
    }
  }

  async function handleMarkNotReceived(trip: Trip) {
    if (toggling.has(trip.id)) return;
    setToggling((prev) => new Set([...prev, trip.id]));
    try {
      await tripsApi.unmarkSheet(trip.id);
      setTrips((prev) => prev.filter((t) => t.id !== trip.id));
      showSuccess(`Trip sheet for ${trip.tripId} marked as not received.`);
      pushSheetAlert({
        tripDbId: Number(trip.id),
        tripIdStr: trip.tripId,
        bookingRef: trip.bookingReferenceNo,
        reportedBy: user?.name ?? "Unknown",
      });
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to update trip sheet status.");
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(trip.id);
        return next;
      });
    }
  }

  async function handleMarkReceived(trip: Trip) {
    if (toggling.has(trip.id)) return;
    setToggling((prev) => new Set([...prev, trip.id]));
    try {
      const updated = await tripsApi.receiveSheet(trip.id);
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? updated : t)));
      showSuccess(`Trip sheet for ${trip.tripId} marked as received.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Failed to mark trip sheet as received.");
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(trip.id);
        return next;
      });
    }
  }

  const fmt = (v: number) =>
    `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <PageSkeleton hasButton={false} hasSearch columns={10} />;

  const filteredTrips = trips.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const truck = truckById.get(t.vehicleId);
    return (
      t.tripId?.toLowerCase().includes(q) ||
      t.bookingReferenceNo?.toLowerCase().includes(q) ||
      t.vehicleId?.toLowerCase().includes(q) ||
      (truck?.registrationNumber ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="animate-stagger flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Reconciliation</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage booking sheets and trip sheets for closed trips
          </p>
        </div>
        <div className="flex items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by truck no, trip ID, ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white/50 py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
          />
        </div>
        <DownloadExcelButton path="/exports/trips" filename="trips.xlsx" />
        </div>
      </div>

      {filteredTrips.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          No closed trips yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1400px] text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {["Trip ID", "Booking Ref", "Customer", "Route", "Driver", "Vehicle",
                  "Hire Amount", "Total Expense", "Trip Sheet Status", "Actions"].map((col) => (
                  <th key={col} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTrips.map((trip) => {
                const closure = closures.get(trip.id);
                const sheet = sheets.get(trip.id);
                const driver = driverById.get(trip.driverId);
                const truck = truckById.get(trip.vehicleId);
                const customer = customerById.get(trip.customerId);

                return (
                  <tr key={trip.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{trip.tripId}</td>
                    <td className="px-4 py-3 text-gray-600">{trip.bookingReferenceNo}</td>
                    <td className="px-4 py-3 text-gray-600">{(customer?.name ?? trip.shipperConsignee) || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {trip.origin} <span className="text-gray-400">→</span> {trip.destination}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{driver?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{truck?.registrationNumber ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-blue-700">
                      {sheet ? fmt(n(sheet.hireAmount)) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-emerald-700">
                      {sheet ? fmt(n(sheet.totalExpense)) : <span className="text-gray-400">—</span>}
                    </td>
                    {/* Trip Sheet Status */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 w-fit">
                          <CheckCircle2 className="h-3 w-3" />
                          Delivered
                        </span>
                        {trip.tripSheetCollectedAt && (
                          <p className="text-[11px] text-gray-500 leading-snug max-w-[160px] whitespace-normal">
                            Trip Sheet for this Trip has been handed over on{" "}
                            <span className="font-semibold text-gray-700">
                              {new Date(
                                trip.tripSheetCollectedAt.endsWith("Z") || trip.tripSheetCollectedAt.includes("+")
                                  ? trip.tripSheetCollectedAt
                                  : trip.tripSheetCollectedAt + "Z"
                              ).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                timeZone: "Asia/Kolkata",
                              })}
                            </span>
                          </p>
                        )}
                        {trip.tripSheetReceived ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 w-fit">
                            <CheckCircle2 className="h-3 w-3" />
                            Received
                            {trip.tripSheetReceivedAt && (
                              <span className="font-normal text-blue-500">
                                {new Date(
                                  trip.tripSheetReceivedAt.endsWith("Z") || trip.tripSheetReceivedAt.includes("+")
                                    ? trip.tripSheetReceivedAt
                                    : trip.tripSheetReceivedAt + "Z"
                                ).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })}
                              </span>
                            )}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={toggling.has(trip.id)}
                            onClick={() => handleMarkReceived(trip)}
                            className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 w-fit"
                          >
                            {toggling.has(trip.id) ? "..." : "Mark as Received"}
                          </button>
                        )}
                        {sheet ? (
                          <span
                            title="Trip sheet has already been entered — cannot unmark delivery"
                            className="inline-block rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-400 cursor-not-allowed w-fit"
                          >
                            Locked
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={toggling.has(trip.id)}
                            onClick={() => handleMarkNotReceived(trip)}
                            className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50 w-fit"
                          >
                            {toggling.has(trip.id) ? "..." : "Mark as Not Received"}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        {/* Booking Sheet */}
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Booking Sheet</p>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => openBookingSheet(trip, true)}
                              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => openBookingSheet(trip, false)}
                              className="rounded-lg border border-purple-300 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                            >
                              Edit
                            </button>
                          </div>
                        </div>

                        {/* Trip Sheet */}
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Trip Sheet</p>
                          {sheet ? (
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => openDialog(trip, "view")}
                                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => openDialog(trip, "edit")}
                                className="rounded-lg border border-blue-300 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                              >
                                Edit
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={!trip.tripSheetReceived}
                              title={!trip.tripSheetReceived ? "Mark the trip sheet as received first" : undefined}
                              onClick={() => openDialog(trip, "add")}
                              className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              ADD
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TripSheetDialog
        open={selectedTrip !== null}
        trip={selectedTrip}
        closure={selectedTrip ? closures.get(selectedTrip.id) : undefined}
        existingSheet={selectedTrip ? sheets.get(selectedTrip.id) : undefined}
        readOnly={dialogMode === "view"}
        autoEditable={isAdmin || (selectedTrip ? hasActiveApproval("TripData", selectedTrip.id) : false)}
        onRequestAutoEdit={
          isAdmin || !selectedTrip
            ? undefined
            : () => {
                setPendingEditAction({ resourceType: "TripData", trip: selectedTrip });
                setEditRequestOpen(true);
              }
        }
        drivers={drivers}
        trucks={trucks}
        onClose={() => setSelectedTrip(null)}
        onSubmit={handleSubmitSheet}
      />

      <BookingSheetDialog
        open={bookingSheetTrip !== null}
        trip={bookingSheetTrip}
        closure={bookingSheetTrip ? closures.get(bookingSheetTrip.id) : undefined}
        driver={bookingSheetTrip ? driverById.get(bookingSheetTrip.driverId) : undefined}
        truck={bookingSheetTrip ? truckById.get(bookingSheetTrip.vehicleId) : undefined}
        drivers={drivers}
        trucks={trucks}
        customers={customers}
        readOnly={bookingSheetReadOnly}
        onClose={() => setBookingSheetTrip(null)}
        onSubmit={handleBookingSheetSubmit}
      />

      {/* Edit approval request dialog — shown when Staff clicks Edit without active approval */}
      {pendingEditAction && (
        <EditRequestDialog
          open={editRequestOpen}
          resourceType={pendingEditAction.resourceType}
          resourceName={pendingEditAction.trip.bookingReferenceNo || pendingEditAction.trip.tripId}
          action="Edit"
          onSubmit={handleEditRequestSubmit}
          onClose={() => { setEditRequestOpen(false); setPendingEditAction(null); }}
        />
      )}
    </div>
  );
}
