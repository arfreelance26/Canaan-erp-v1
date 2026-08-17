"use client";

import { useEffect, useState } from "react";
import { customersApi } from "@/lib/api";
import type { Customer } from "@/types/customer";
import type { CustomerOrigin } from "@/types/customer-origin";
import type { CustomerDestination } from "@/types/customer-destination";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Building2, MoveRight, Search } from "lucide-react";

const PALETTES = [
  { bar: "bg-indigo-500",  hdr: "bg-indigo-50",   icon: "bg-indigo-600",  badge: "bg-indigo-100 text-indigo-700",  divider: "border-indigo-100"  },
  { bar: "bg-emerald-500", hdr: "bg-emerald-50",  icon: "bg-emerald-600", badge: "bg-emerald-100 text-emerald-700", divider: "border-emerald-100" },
  { bar: "bg-rose-500",    hdr: "bg-rose-50",     icon: "bg-rose-600",    badge: "bg-rose-100 text-rose-700",       divider: "border-rose-100"    },
  { bar: "bg-amber-500",   hdr: "bg-amber-50",    icon: "bg-amber-600",   badge: "bg-amber-100 text-amber-700",     divider: "border-amber-100"   },
  { bar: "bg-violet-500",  hdr: "bg-violet-50",   icon: "bg-violet-600",  badge: "bg-violet-100 text-violet-700",   divider: "border-violet-100"  },
  { bar: "bg-cyan-500",    hdr: "bg-cyan-50",     icon: "bg-cyan-600",    badge: "bg-cyan-100 text-cyan-700",       divider: "border-cyan-100"    },
  { bar: "bg-orange-500",  hdr: "bg-orange-50",   icon: "bg-orange-600",  badge: "bg-orange-100 text-orange-700",   divider: "border-orange-100"  },
  { bar: "bg-teal-500",    hdr: "bg-teal-50",     icon: "bg-teal-600",    badge: "bg-teal-100 text-teal-700",       divider: "border-teal-100"    },
  { bar: "bg-pink-500",    hdr: "bg-pink-50",     icon: "bg-pink-600",    badge: "bg-pink-100 text-pink-700",       divider: "border-pink-100"    },
  { bar: "bg-sky-500",     hdr: "bg-sky-50",      icon: "bg-sky-600",     badge: "bg-sky-100 text-sky-700",         divider: "border-sky-100"     },
  { bar: "bg-lime-600",    hdr: "bg-lime-50",     icon: "bg-lime-600",    badge: "bg-lime-100 text-lime-700",       divider: "border-lime-100"    },
  { bar: "bg-fuchsia-500", hdr: "bg-fuchsia-50",  icon: "bg-fuchsia-600", badge: "bg-fuchsia-100 text-fuchsia-700", divider: "border-fuchsia-100" },
  { bar: "bg-red-500",     hdr: "bg-red-50",      icon: "bg-red-600",     badge: "bg-red-100 text-red-700",         divider: "border-red-100"     },
  { bar: "bg-blue-500",    hdr: "bg-blue-50",     icon: "bg-blue-600",    badge: "bg-blue-100 text-blue-700",       divider: "border-blue-100"    },
  { bar: "bg-green-500",   hdr: "bg-green-50",    icon: "bg-green-600",   badge: "bg-green-100 text-green-700",     divider: "border-green-100"   },
  { bar: "bg-yellow-500",  hdr: "bg-yellow-50",   icon: "bg-yellow-600",  badge: "bg-yellow-100 text-yellow-700",   divider: "border-yellow-100"  },
  { bar: "bg-purple-500",  hdr: "bg-purple-50",   icon: "bg-purple-600",  badge: "bg-purple-100 text-purple-700",   divider: "border-purple-100"  },
  { bar: "bg-slate-500",   hdr: "bg-slate-50",    icon: "bg-slate-600",   badge: "bg-slate-100 text-slate-700",     divider: "border-slate-100"   },
  { bar: "bg-stone-500",   hdr: "bg-stone-50",    icon: "bg-stone-600",   badge: "bg-stone-100 text-stone-700",     divider: "border-stone-100"   },
  { bar: "bg-zinc-500",    hdr: "bg-zinc-50",     icon: "bg-zinc-600",    badge: "bg-zinc-100 text-zinc-700",       divider: "border-zinc-100"    },
] as const;

type Palette = typeof PALETTES[number];

type RouteCard = { originText: string; destinationText: string };

type CustomerGroup = {
  customer: Customer;
  palette: Palette;
  cards: RouteCard[];
};

function buildGroups(
  rows: { customer: Customer; origins: CustomerOrigin[]; destinations: CustomerDestination[] }[]
): CustomerGroup[] {
  const sorted = [...rows].sort((a, b) => parseInt(a.customer.id) - parseInt(b.customer.id));
  return sorted.map(({ customer, origins, destinations }, idx) => {
    const palette = PALETTES[idx % PALETTES.length];
    const fallbackOrigin = origins.map((o) => o.originName).join(", ");
    const cards: RouteCard[] =
      destinations.length === 0
        ? [{ originText: fallbackOrigin, destinationText: "" }]
        : destinations.map((dest) => ({
            originText: dest.originAddress || dest.originState || fallbackOrigin || "",
            destinationText: dest.destinationName || dest.destinationAddress || dest.destinationState || "",
          }));
    return { customer, palette, cards };
  });
}

function CustomerGroupCard({ group }: { group: CustomerGroup }) {
  const { customer, palette, cards } = group;
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">

      {/* ── Header ── */}
      <div className={`flex items-center gap-0 ${palette.hdr}`}>
        {/* Colored left bar */}
        <div className={`w-1.5 self-stretch shrink-0 ${palette.bar}`} />

        {/* Icon */}
        <div className="flex shrink-0 items-center justify-center px-5 py-4">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm ${palette.icon}`}>
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        {/* Company name + GSTIN */}
        <div className="flex flex-1 flex-wrap items-center justify-between gap-3 py-4 pr-6">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Customer</p>
            <p className="mt-0.5 text-base font-bold text-gray-900">{customer.name}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {customer.gstin && (
              <div className="flex flex-col gap-0.5 rounded-lg bg-white/70 px-3 py-1.5 shadow-sm ring-1 ring-black/5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">GSTIN</span>
                <span className="text-xs font-semibold text-gray-800">{customer.gstin}</span>
              </div>
            )}
            {customer.phone && (
              <div className="flex flex-col gap-0.5 rounded-lg bg-white/70 px-3 py-1.5 shadow-sm ring-1 ring-black/5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Phone</span>
                <span className="text-xs font-semibold text-gray-800">{customer.phone}</span>
              </div>
            )}
            {customer.contactPersonnelName && (
              <div className="flex flex-col gap-0.5 rounded-lg bg-white/70 px-3 py-1.5 shadow-sm ring-1 ring-black/5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Contact Person</span>
                <span className="text-xs font-semibold text-gray-800">{customer.contactPersonnelName}</span>
              </div>
            )}
            <div className="flex flex-col gap-0.5 rounded-lg bg-white/70 px-3 py-1.5 shadow-sm ring-1 ring-black/5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Routes</span>
              <span className="text-xs font-semibold text-gray-800">{cards.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Route rows ── */}
      {cards.length > 0 && (
        <div className={`divide-y ${palette.divider} border-t ${palette.divider}`}>
          {cards.map((card, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
              {/* Route number badge */}
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${palette.badge}`}>
                {i + 1}
              </span>

              {/* Origin */}
              <div className="flex w-72 shrink-0 flex-col">
                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Origin Location</span>
                <span className="mt-0.5 text-sm font-medium text-gray-700">
                  {card.originText || <span className="text-gray-300">—</span>}
                </span>
              </div>

              <MoveRight className="h-4 w-4 shrink-0 text-gray-300" />

              {/* Destination */}
              <div className="flex w-72 shrink-0 flex-col">
                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Destination Location</span>
                <span className="mt-0.5 text-sm font-medium text-gray-700">
                  {card.destinationText || <span className="text-gray-300">—</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomerProfitabilityAnalyticsPage() {
  const [groups, setGroups]   = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

  useEffect(() => {
    async function load() {
      const customers = await customersApi.list();
      const rows = await Promise.all(
        customers.map(async (c) => {
          const [origins, destinations] = await Promise.all([
            customersApi.listOrigins(c.id).catch(() => [] as CustomerOrigin[]),
            customersApi.listDestinations(c.id).catch(() => [] as CustomerDestination[]),
          ]);
          return { customer: c, origins, destinations };
        })
      );
      setGroups(buildGroups(rows));
    }
    load().catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton hasButton={false} hasSearch={false} columns={1} />;

  const filtered = search.trim()
    ? groups.filter((g) => g.customer.name.toLowerCase().includes(search.trim().toLowerCase()))
    : groups;

  const totalRoutes = filtered.reduce((s, g) => s + g.cards.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Profitability Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtered.length} customer{filtered.length !== 1 ? "s" : ""} · {totalRoutes} route{totalRoutes !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Search bar */}
        <div className="relative mt-1 w-72 shrink-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by customer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm text-gray-800 placeholder-gray-400 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
          />
        </div>
      </div>

      {filtered.length === 0 && !loading && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
          {search.trim() ? `No customers match "${search}"` : "No customers found."}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {filtered.map((group) => (
          <CustomerGroupCard key={group.customer.id} group={group} />
        ))}
      </div>
    </div>
  );
}
