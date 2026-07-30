"use client";

import { useEffect, useState, useMemo } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { tripsApi } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { Truck } from "@/types/truck";
import type { CompensationPerson } from "./CompensationTable";

type Props = {
  open: boolean;
  onClose: () => void;
  driver: CompensationPerson | null;
  trips: Trip[];
  trucks: Truck[];
  onRecordPayment: (total: number) => Promise<void>;
};

type FilterMode = "all" | "thisMonth" | "custom";

const fmtCur = (v: number) =>
  `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, "0")}` };
}

type Row = {
  tripId: string;
  driverName: string;
  truckReg: string;
  truckBranch: string;
  containerSpec: string;
  containerNo: string;
  bookingDate: string;
  tripCategory: string;
  cargoClassification: string;
  origin: string;
  destination: string;
  driverAdvance: number;
  additionalDriverAdvance: number;
  totalAdvance: number;
  completedDate: string;
  hasClosure: boolean;
};

export function AdvanceRecordDialog({ open, onClose, driver, trips, trucks, onRecordPayment }: Props) {
  const [closures, setClosures] = useState<Map<string, TripClosureData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const driverTrips = useMemo(
    () =>
      trips.filter(
        (t) => driver && t.driverId === (driver.driverId ?? driver.id) && (t as any).hasSheet
      ),
    [trips, driver]
  );

  useEffect(() => {
    if (!open || !driver || driverTrips.length === 0) return;
    setLoading(true);
    setClosures(new Map());
    Promise.all(
      driverTrips.map((t) =>
        tripsApi
          .getClosure(t.id)
          .then((closure) => (closure ? { id: t.id, closure } : null))
          .catch(() => null)
      )
    )
      .then((results) => {
        const map = new Map<string, TripClosureData>();
        for (const r of results) if (r) map.set(r.id, r.closure);
        setClosures(map);
      })
      .finally(() => setLoading(false));
  }, [open, driver?.id]);

  useEffect(() => {
    if (open) {
      setFilterMode("all");
      setCustomFrom("");
      setCustomTo("");
    }
  }, [open]);

  const allRows = useMemo<Row[]>(
    () =>
      driverTrips.map((t) => {
        const c = closures.get(t.id);
        const truck = trucks.find((tr) => tr.truckId === t.vehicleId);

        const driverAdv = parseFloat(c?.driverAdvance ?? "0") || 0;
        const addlAdv = parseFloat(c?.additionalDriverAdvance ?? "0") || 0;

        const containerNo =
          t.containerSpecification === "2 X 20 FEET CONTAINERS"
            ? [t.containerNumber1, t.containerNumber2].filter(Boolean).join(" / ")
            : t.containerNumber;

        return {
          tripId: t.tripId,
          driverName: driver?.name ?? "—",
          truckReg: t.truckRegistration ?? "—",
          truckBranch: truck?.branchRegisteredTo || "—",
          containerSpec: t.containerSpecification || "—",
          containerNo: containerNo || "—",
          bookingDate: t.bookingCreatedDate ?? "",
          tripCategory: t.tripCategory || "—",
          cargoClassification: t.cargoClassification || "—",
          origin: t.origin || "—",
          destination: t.destination || "—",
          driverAdvance: driverAdv,
          additionalDriverAdvance: addlAdv,
          totalAdvance: driverAdv + addlAdv,
          completedDate: c?.tripCompletedDate ?? "",
          hasClosure: !!c,
        };
      }),
    [driverTrips, closures, trucks, driver]
  );

  const rows = useMemo<Row[]>(() => {
    if (filterMode === "all") return allRows;

    const { from, to } =
      filterMode === "thisMonth" ? thisMonthRange() : { from: customFrom, to: customTo };

    if (!from && !to) return allRows;

    return allRows.filter((r) => {
      if (!r.completedDate) return false;
      if (from && r.completedDate < from) return false;
      if (to && r.completedDate > to) return false;
      return true;
    });
  }, [allRows, filterMode, customFrom, customTo]);

  const grandTotal = rows.reduce((sum, r) => sum + r.totalAdvance, 0);

  const filterBubble = (label: string, mode: FilterMode) => (
    <button
      type="button"
      onClick={() => setFilterMode(mode)}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        filterMode === mode
          ? "bg-indigo-600 text-white shadow-sm"
          : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );

  const thClass = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 whitespace-nowrap text-left";
  const thRClass = `${thClass} text-right`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Advance Record — ${driver?.name ?? ""}`}
      className="max-w-[95vw]"
    >
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          {filterBubble("All", "all")}
          {filterBubble("This Month", "thisMonth")}
          {filterBubble("Custom Range", "custom")}
        </div>

        {filterMode === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <DatePickerInput
              value={customFrom}
              onChange={(v) => setCustomFrom(v)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none"
            />
            <span className="text-gray-400">→</span>
            <DatePickerInput
              value={customTo}
              onChange={(v) => setCustomTo(v)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500">Loading advance data…</div>
      ) : allRows.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          No completed trips found for this driver.
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          No trips match the selected date filter.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-auto max-h-[60vh] rounded-lg border border-gray-200">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={thClass}>Trip ID</th>
                  <th className={thClass}>Driver</th>
                  <th className={thClass}>Truck Reg</th>
                  <th className={thClass}>Branch</th>
                  <th className={thClass}>Container Spec</th>
                  <th className={thClass}>Container No</th>
                  <th className={thClass}>Booking Date</th>
                  <th className={thClass}>Trip Category</th>
                  <th className={thClass}>Cargo Type</th>
                  <th className={thClass}>Origin</th>
                  <th className={thClass}>Destination</th>
                  <th className={thRClass}>Driver Advance</th>
                  <th className={thRClass}>Additional Advance</th>
                  <th className={thRClass}>Total Advance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => (
                  <tr key={`${row.tripId}-${i}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-indigo-700">{row.tripId}</td>
                    <td className="px-3 py-2.5 text-gray-700">{row.driverName}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-700">{row.truckReg}</td>
                    <td className="px-3 py-2.5 text-gray-600">{row.truckBranch}</td>
                    <td className="px-3 py-2.5 text-gray-600 max-w-[140px] truncate">{row.containerSpec}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-700">{row.containerNo}</td>
                    <td className="px-3 py-2.5 text-gray-600">{fmtDate(row.bookingDate)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{row.tripCategory}</td>
                    <td className="px-3 py-2.5 text-gray-600">{row.cargoClassification}</td>
                    <td className="px-3 py-2.5 text-gray-700 max-w-[130px] truncate">{row.origin}</td>
                    <td className="px-3 py-2.5 text-gray-700 max-w-[130px] truncate">{row.destination}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {row.hasClosure ? fmtCur(row.driverAdvance) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700">
                      {row.hasClosure ? fmtCur(row.additionalDriverAdvance) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-orange-700">
                      {row.hasClosure ? fmtCur(row.totalAdvance) : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
            <span className="text-sm font-semibold text-gray-700">
              Total Advance Paid
              {filterMode !== "all" && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  ({rows.length} trip{rows.length !== 1 ? "s" : ""})
                </span>
              )}
            </span>
            <span className="text-lg font-bold text-orange-700">{fmtCur(grandTotal)}</span>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
            <button
              type="button"
              disabled={saving || grandTotal === 0}
              onClick={async () => {
                setSaving(true);
                await onRecordPayment(grandTotal);
                setSaving(false);
              }}
              className="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Record Advance Payment"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
