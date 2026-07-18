"use client";

import { useEffect, useState, useMemo } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { tripsApi } from "@/lib/api";
import type { Trip } from "@/types/trip";
import type { TripSheetData } from "@/types/trip-sheet";
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

export function SalaryRecordDialog({ open, onClose, driver, trips, onRecordPayment }: Props) {
  const [sheets, setSheets] = useState<Map<string, TripSheetData>>(new Map());
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
    setSheets(new Map());
    Promise.all(
      driverTrips.map((t) =>
        tripsApi
          .getSheet(t.id)
          .then((sheet) => (sheet ? { id: t.id, sheet } : null))
          .catch(() => null)
      )
    )
      .then((results) => {
        const map = new Map<string, TripSheetData>();
        for (const r of results) if (r) map.set(r.id, r.sheet);
        setSheets(map);
      })
      .finally(() => setLoading(false));
  }, [open, driver?.id]);

  // Reset filters when dialog opens
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
        const sheet = sheets.get(t.id);
        return {
          tripNo: t.tripId,
          origin: t.origin,
          destination: t.destination,
          completedDate: sheet?.tripCompletedDate ?? "",
          batta: parseFloat(sheet?.driverPay ?? "0") || 0,
          hasSheet: !!sheet,
        };
      }),
    [driverTrips, sheets]
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

  const total = rows.reduce((sum, r) => sum + r.batta, 0);

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
      title={`Salary Record — ${driver?.name ?? ""}`}
      className="max-w-3xl"
    >
      {/* Filter row */}
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
        <div className="py-10 text-center text-sm text-gray-500">Loading trip data…</div>
      ) : allRows.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          No completed trips with sheets found for this driver.
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          No trips match the selected date filter.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-auto max-h-72 rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {[
                    { label: "Trip No", right: false },
                    { label: "Completed Date", right: false },
                    { label: "Origin", right: false },
                    { label: "Destination", right: false },
                    { label: "Batta Amount", right: true },
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
                    <td className="px-4 py-3 text-gray-600">{row.origin}</td>
                    <td className="px-4 py-3 text-gray-600">{row.destination}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                      {row.hasSheet ? fmt(row.batta) : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="text-sm font-semibold text-gray-700">
              Total Driver Batta
              {filterMode !== "all" && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  ({rows.length} trip{rows.length !== 1 ? "s" : ""})
                </span>
              )}
            </span>
            <span className="text-lg font-bold text-emerald-700">{fmt(total)}</span>
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
              disabled={saving || total === 0}
              onClick={async () => {
                setSaving(true);
                await onRecordPayment(total);
                setSaving(false);
              }}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Record Salary Payment"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
