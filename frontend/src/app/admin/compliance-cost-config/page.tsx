"use client";

import { useEffect, useState } from "react";
import { trucksApi, complianceCostApi, type ComplianceCostItem } from "@/lib/api";
import type { Truck } from "@/types/truck";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { ShieldCheck, LayoutGrid, CheckCircle2, IndianRupee } from "lucide-react";

type CostFields = Omit<ComplianceCostItem, "tyre_layout">;

const COST_FIELDS: { key: keyof CostFields; label: string }[] = [
  { key: "rc_cost",              label: "RC"                    },
  { key: "fc_cost",              label: "FC"                    },
  { key: "road_tax_cost",        label: "Road Tax"              },
  { key: "national_permit_cost", label: "National Permit"       },
  { key: "local_permit_cost",    label: "Local Permit"          },
  { key: "pollution_cert_cost",  label: "Pollution Cert."       },
  { key: "insurance_cost",       label: "Insurance"             },
];

function emptyFields(): CostFields {
  return {
    rc_cost: "", fc_cost: "", road_tax_cost: "",
    national_permit_cost: "", local_permit_cost: "",
    pollution_cert_cost: "", insurance_cost: "",
  };
}

function groupLayouts(trucks: Truck[]): string[] {
  const set = new Set<string>();
  for (const t of trucks) set.add(t.tyreLayout || "Unspecified");
  return [...set].sort((a, b) => a.localeCompare(b));
}

function fmtInr(n: number, decimals = 2): string {
  if (n <= 0) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export default function ComplianceCostConfigPage() {
  const [layouts,   setLayouts]   = useState<string[]>([]);
  const [costs,     setCosts]     = useState<Record<string, CostFields>>({});
  const [kmPerDay,  setKmPerDay]  = useState<Record<string, number | null>>({});
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  useEffect(() => {
    Promise.all([
      trucksApi.list(),
      complianceCostApi.list(),
      trucksApi.getRunConfig(),
    ])
      .then(([trucks, rows, runRows]) => {
        const ls = groupLayouts(trucks);

        const fromDb: Record<string, CostFields> = {};
        for (const r of rows) {
          fromDb[r.tyre_layout] = {
            rc_cost:              r.rc_cost              ?? "",
            fc_cost:              r.fc_cost              ?? "",
            road_tax_cost:        r.road_tax_cost        ?? "",
            national_permit_cost: r.national_permit_cost ?? "",
            local_permit_cost:    r.local_permit_cost    ?? "",
            pollution_cert_cost:  r.pollution_cert_cost  ?? "",
            insurance_cost:       r.insurance_cost       ?? "",
          };
        }
        setLayouts(ls);
        setCosts(Object.fromEntries(ls.map((l) => [l, fromDb[l] ?? emptyFields()])));

        // km/day per tyre layout from Truck Run Configuration
        const kpd: Record<string, number | null> = {};
        for (const r of runRows as { tyre_layout: string; km_per_day: string | null }[]) {
          kpd[r.tyre_layout] = r.km_per_day ? parseFloat(r.km_per_day) : null;
        }
        setKmPerDay(kpd);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function updateField(layout: string, field: keyof CostFields, value: string) {
    setCosts((prev) => ({ ...prev, [layout]: { ...prev[layout], [field]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const configs: ComplianceCostItem[] = layouts.map((l) => ({
      tyre_layout: l,
      ...costs[l],
    }));
    try {
      await complianceCostApi.save(configs);
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
          <h1 className="text-2xl font-bold text-gray-900">Compliance Cost Configuration</h1>
          <p className="mt-1 text-sm text-gray-500">
            Set the annual compliance costs per tyre layout for all 7 documents
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="mt-1 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saved ? (
            <><CheckCircle2 className="h-4 w-4" />Saved</>
          ) : saving ? "Saving…" : (
            <><ShieldCheck className="h-4 w-4" />Save Configuration</>
          )}
        </button>
      </div>

      {/* Layout cards */}
      {layouts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
          No tyre layouts found. Add trucks with a tyre layout first.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {layouts.map((layout) => {
            // Derived totals
            const total     = COST_FIELDS.reduce((s, f) => s + (parseFloat(costs[layout]?.[f.key] || "0") || 0), 0);
            const perMonth  = total / 12;
            const perDay    = perMonth / 26;
            const kpd       = kmPerDay[layout] ?? null;
            const perKm     = kpd && kpd > 0 ? perDay / kpd : null;

            return (
              <div
                key={layout}
                className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden"
              >
                {/* Card header */}
                <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-5 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-bold text-gray-800">{layout}</span>
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white">
                    <IndianRupee className="h-3 w-3" />
                    Per Year
                  </span>
                </div>

                {/* 7 cost input boxes */}
                <div className="grid grid-cols-2 gap-px bg-gray-100 sm:grid-cols-4 lg:grid-cols-7">
                  {COST_FIELDS.map((f) => (
                    <div key={f.key} className="flex flex-col gap-2 bg-white px-4 py-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {f.label}
                      </span>
                      <div className="relative mt-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">
                          ₹
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="0"
                          value={costs[layout]?.[f.key] ?? ""}
                          onChange={(e) => updateField(layout, f.key, e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-6 pr-2 text-sm font-semibold text-gray-800 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary strip */}
                <div className="grid grid-cols-2 gap-px bg-blue-100 sm:grid-cols-4 border-t border-blue-100">
                  {[
                    { label: "Total Docs Cost", value: fmtInr(total), sub: "Sum of all 7 docs / year" },
                    { label: "Cost Per Month",  value: fmtInr(perMonth), sub: "Total ÷ 12" },
                    { label: "Cost Per Day",    value: fmtInr(perDay),   sub: "Per Month ÷ 26 working days" },
                    {
                      label: "Cost Per KM",
                      value: perKm != null ? `₹${perKm.toFixed(4)}` : "—",
                      sub: kpd
                        ? `Per Day ÷ ${kpd.toLocaleString("en-IN")} km/day`
                        : "Set km/day in Truck Run Config",
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex flex-col gap-0.5 bg-blue-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500">{item.label}</p>
                      <p className="text-sm font-bold tabular-nums text-blue-900">{item.value}</p>
                      <p className="text-[9px] text-blue-400 leading-tight">{item.sub}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
