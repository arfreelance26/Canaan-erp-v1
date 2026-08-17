"use client";

import { useEffect, useState } from "react";
import { trucksApi } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { IndianRupee, LayoutGrid, Info, CheckCircle2 } from "lucide-react";

function groupLayouts(trucks: Truck[]): string[] {
  const set = new Set<string>();
  for (const t of trucks) set.add(t.tyreLayout || "Unspecified");
  return [...set].sort((a, b) => a.localeCompare(b));
}

export default function TyreCostConfigPage() {
  const [layouts, setLayouts]   = useState<string[]>([]);
  const [costs, setCosts]       = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    Promise.all([
      trucksApi.list(),
      trucksApi.getBaseTyreCost(),
    ]).then(([trucks, rows]) => {
      const ls = groupLayouts(trucks);
      const fromDb: Record<string, string> = {};
      for (const r of rows) {
        fromDb[r.tyre_layout] = r.cost ? String(parseFloat(r.cost)) : "";
      }
      setLayouts(ls);
      setCosts(Object.fromEntries(ls.map((l) => [l, fromDb[l] ?? ""])));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const payload = layouts.map((l) => ({
      tyre_layout: l,
      cost: costs[l] !== "" ? Number(costs[l]) : null,
    }));
    try {
      await trucksApi.saveBaseTyreCost(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  }

  if (loading) return <PageSkeleton hasButton={false} hasSearch={false} columns={1} />;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tyre Cost Configuration</h1>
          <p className="mt-1 text-sm text-gray-500">
            Set the base tyre cost per kilometre for each tyre layout
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="mt-1 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saved ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </>
          ) : saving ? (
            "Saving…"
          ) : (
            <>
              <IndianRupee className="h-4 w-4" />
              Save Configuration
            </>
          )}
        </button>
      </div>

      {/* Info note */}
      <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <div className="text-xs text-blue-800 space-y-1">
          <p className="font-bold">How this is used</p>
          <p>
            The base tyre cost (₹ per km) is used by the{" "}
            <span className="font-semibold">Running Cost Calculator</span> to compute tyre charges per
            kilometre. Each tyre layout can have a different cost based on tyre type, count, and expected
            range.
          </p>
        </div>
      </div>

      {/* Cost rows */}
      {layouts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
          No tyre layouts found. Add trucks with a tyre layout first.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_260px] items-center gap-6 px-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tyre Layout</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Base Cost (₹ / km)
            </span>
          </div>

          {layouts.map((layout) => (
            <div
              key={layout}
              className="grid grid-cols-[1fr_260px] items-center gap-6 rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <LayoutGrid className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-semibold text-gray-800">{layout}</span>
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={costs[layout] ?? ""}
                  onChange={(e) =>
                    setCosts((prev) => ({ ...prev, [layout]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-7 pr-14 text-sm font-semibold text-gray-800 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">
                  / km
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
