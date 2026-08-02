"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";

const TYRE_TYPES = ["Radial", "Tubeless", "Nylon", "Retread"] as const;
type TyreType = typeof TYRE_TYPES[number];

type TyreValues = { price: string; expectedRange: string };

export default function OperatingCostCalculatorPage() {
  const [tyreData, setTyreData] = useState<Record<TyreType, TyreValues>>({
    Radial:   { price: "", expectedRange: "" },
    Tubeless: { price: "", expectedRange: "" },
    Nylon:    { price: "", expectedRange: "" },
    Retread:  { price: "", expectedRange: "" },
  });

  function setTyre(type: TyreType, field: keyof TyreValues, value: string) {
    setTyreData((prev) => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left — page header */}
        <div className="flex items-center gap-3 self-start">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-md">
            <Calculator className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Operating Cost Calculator</h1>
            <p className="text-xs text-gray-500">Calculate per-trip and per-KM operating costs</p>
          </div>
        </div>

        {/* Right — Base Calculation Values card */}
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gray-50/60 px-5 py-3.5">
            <h2 className="text-sm font-bold text-gray-800">Set Base Calculation Values</h2>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            {/* Tyre Types section */}
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">Tyre Types</p>
              <div className="flex flex-col gap-3">
                {/* Column headers */}
                <div className="grid grid-cols-[90px_1fr_1fr] items-center gap-2">
                  <span />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center">Price (₹)</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center">Expected Range (km)</span>
                </div>

                {TYRE_TYPES.map((type) => (
                  <div key={type} className="grid grid-cols-[90px_1fr_1fr] items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">{type}</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={tyreData[type].price}
                        onChange={(e) => setTyre(type, "price", e.target.value)}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-6 pr-2 text-xs font-medium text-gray-800 placeholder-gray-300 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={tyreData[type].expectedRange}
                        onChange={(e) => setTyre(type, "expectedRange", e.target.value)}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-3 pr-8 text-xs font-medium text-gray-800 placeholder-gray-300 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-gray-400">km</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
