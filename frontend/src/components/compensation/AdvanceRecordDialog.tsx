"use client";

import { useEffect, useState, useMemo } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { tripsApi } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { TripClosureData } from "@/types/trip-closure";
import type { CompensationPerson } from "./CompensationTable";

type Props = {
  open: boolean;
  onClose: () => void;
  driver: CompensationPerson | null;
  trips: Trip[];
  onRecordPayment: (total: number) => Promise<void>;
};

type FilterMode = "all" | "thisMonth" | "custom";

const fmt = (v: number) =>
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

export function AdvanceRecordDialog({ open, onClose, driver, trips, onRecordPayment }: Props) {
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

  const allRows = useMemo(
    () =>
      driverTrips.map((t) => {
        const c = closures.get(t.id);
        const driverAdv = parseFloat(c?.driverAdvance ?? "0") || 0;
        const addlAdv = parseFloat(c?.additionalDriverAdvance ?? "0") || 0;
        return {
          tripNo: t.tripId,
          completedDate: c?.tripCompletedDate ?? "",
          driverAdvance: driverAdv,
          additionalDriverAdvance: addlAdv,
          totalAdvance: driverAdv + addlAdv,
          hasClosure: !!c,
        };
      }),
    [driverTrips, closures]
  );

  const rows = useMemo(() => {
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Advance Record — ${driver?.name ?? ""}`}
      className="max-w-4xl"
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
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {[
                    { label: "Trip No", right: false },
                    { label: "Completed Date", right: false },
                    { label: "Driver's Advance", right: true },
                    { label: "Additional Advance", right: true },
                    { label: "Total Advance", right: true },
                  ].map(({ label, right }) => (
                    <th
                      key={label}
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500${right ? " text-right" : ""}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.tripNo} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.tripNo}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(row.completedDate)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {row.hasClosure ? fmt(row.driverAdvance) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {row.hasClosure ? fmt(row.additionalDriverAdvance) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-orange-700">
                      {row.hasClosure ? fmt(row.totalAdvance) : <span className="text-gray-400">—</span>}
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
            <span className="text-lg font-bold text-orange-700">{fmt(grandTotal)}</span>
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
