"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Truck as TruckIcon, Eye, FileX2, IdCard, ClipboardCheck, Receipt, Globe, MapPin, Wind, ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { fileUrl } from "@/lib/api";
import { COMPLIANCE_DOCS, formatRupees, type ComplianceDocMeta } from "@/lib/compliance-docs";
import { getComplianceStatus } from "@/lib/compliance";
import { getTyreLayout } from "@/lib/tyre-layouts";
import { formatDate } from "@/lib/format-date";
import { FileViewer } from "@/components/ui/FileViewer";
import { truckImageUrl } from "@/components/fleet/VehicleImages";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";

type State = "Expired" | "Expiring Soon" | "Valid" | "Missing";

const ICONS: Record<ComplianceDocMeta["key"], LucideIcon> = {
  rc: IdCard,
  fc: ClipboardCheck,
  road_tax: Receipt,
  insurance: ShieldCheck,
  national_permit: Globe,
  local_permit: MapPin,
  pollution_cert: Wind,
};

const LOOK: Record<State, { pill: string; bar: string; dot: string; days: string; label: string }> = {
  Expired:         { pill: "bg-red-50 text-red-600 ring-red-200",           bar: "bg-red-500",     dot: "bg-red-400",     days: "text-red-600",     label: "Expired" },
  "Expiring Soon": { pill: "bg-amber-50 text-amber-700 ring-amber-200",     bar: "bg-amber-400",   dot: "bg-amber-300",   days: "text-amber-600",   label: "Expiring" },
  Valid:           { pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-500", dot: "bg-emerald-400", days: "text-emerald-600", label: "Valid" },
  Missing:         { pill: "bg-slate-100 text-slate-500 ring-slate-200",    bar: "bg-white/25",    dot: "bg-white/40",    days: "text-slate-400",   label: "Not on record" },
};
const ORDER: State[] = ["Expired", "Expiring Soon", "Valid", "Missing"];

function daysFromToday(date: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function daysText(days: number): string {
  if (days === 0) return "Expires today";
  const n = Math.abs(days);
  return days > 0 ? `${n} day${n === 1 ? "" : "s"} left` : `${n} day${n === 1 ? "" : "s"} overdue`;
}

/** Compliance & Renewals → "View Truck Data": a truck's 7 documents at a
 *  glance — most urgent first — with each one's file in the in-app viewer. */
export function TruckComplianceView({ truck, onClose }: { truck: Truck; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [viewing, setViewing] = useState<{ url: string; title: string } | null>(null);
  const [photoBroken, setPhotoBroken] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const docs = COMPLIANCE_DOCS.map((d) => {
    const date = truck[d.dateKey] as string;
    const state: State = date ? getComplianceStatus(date, d.statusField) : "Missing";
    const cost = parseFloat(truck[d.expensesKey] as string);
    return {
      meta: d,
      date,
      state,
      days: date ? daysFromToday(date) : null,
      cost: Number.isNaN(cost) || cost <= 0 ? null : cost,
      number: d.numberKey ? (truck[d.numberKey] as string) : "",
      hasFile: !!truck[d.fileNameKey],
    };
  }).sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || (a.days ?? 0) - (b.days ?? 0));

  const counts = Object.fromEntries(ORDER.map((s) => [s, docs.filter((d) => d.state === s).length])) as Record<State, number>;
  const totalCost = docs.reduce((s, d) => s + (d.cost ?? 0), 0);
  const model = [truck.manufacturer, truck.modelName].filter((v) => v && v.toLowerCase() !== "nan").join(" ");
  const layout = getTyreLayout(truck.tyreLayout)?.label ?? truck.tyreLayout;
  const photo = truck.truckPhotosFileName && !photoBroken ? truckImageUrl(truck, "photo") : null;

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="relative shrink-0 bg-gradient-to-br from-[#1b2b5e] via-[#22356f] to-[#2d4590] px-6 pb-5 pt-6 text-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full p-1.5 text-white/70 transition hover:bg-white/15 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-4 pr-8">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-white/80 bg-white/10 shadow-lg">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" onError={() => setPhotoBroken(true)} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-white/70">
                  <TruckIcon className="h-7 w-7" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">Compliance Overview</p>
              <h2 className="truncate text-xl font-bold leading-tight">{truck.registrationNumber || truck.truckId}</h2>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-medium">
                <span className="rounded-full bg-white/15 px-2 py-0.5">{truck.truckId}</span>
                {model && <span className="rounded-full bg-white/15 px-2 py-0.5">{model}</span>}
                {layout && <span className="rounded-full bg-white/15 px-2 py-0.5">{layout}</span>}
                {truck.truckType && <span className="rounded-full bg-white/15 px-2 py-0.5">{truck.truckType}</span>}
              </div>
            </div>
          </div>

          {/* Health bar */}
          <div className="mt-5">
            <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
              {ORDER.map((s) => counts[s] > 0 && (
                <div key={s} className={LOOK[s].bar} style={{ width: `${(counts[s] / docs.length) * 100}%` }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/80">
              {ORDER.map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", LOOK[s].dot)} />
                  <b className="text-white">{counts[s]}</b> {LOOK[s].label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
            {docs.map(({ meta, date, state, days, cost, number, hasFile }) => {
              const Icon = ICONS[meta.key];
              const look = LOOK[state];
              return (
                <li key={meta.key} className="flex items-center gap-3 bg-white px-3.5 py-3 transition-colors hover:bg-slate-50/70">
                  <span className={cn("h-9 w-1 shrink-0 rounded-full", state === "Missing" ? "bg-slate-200" : look.bar)} aria-hidden />
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1b2b5e]/[0.07] text-[#1b2b5e]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{meta.label}</p>
                    <p className="truncate text-[11px] text-slate-400">
                      {cost != null ? formatRupees(cost) : "No cost"}
                      {number && <> · No. {number}</>}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-semibold tabular-nums text-slate-800">{date ? formatDate(date) : "—"}</p>
                    <p className={cn("text-[11px] font-medium", look.days)}>{days == null ? "No date" : daysText(days)}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1", look.pill)}>
                    {look.label}
                  </span>
                  {hasFile ? (
                    <button
                      type="button"
                      onClick={() => setViewing({ url: fileUrl("trucks", truck.id, meta.key), title: `${truck.registrationNumber} — ${meta.label}` })}
                      aria-label={`View ${meta.label} document`}
                      title="View document"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700 transition hover:bg-blue-100"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  ) : (
                    <span
                      title="No document uploaded"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-300"
                    >
                      <FileX2 className="h-4 w-4" />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
          <p className="text-xs text-slate-500">
            Current documents cost <span className="font-semibold text-slate-800">{formatRupees(totalCost)}</span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
      <FileViewer open={!!viewing} onClose={() => setViewing(null)} url={viewing?.url ?? ""} title={viewing?.title ?? ""} />
    </div>,
    document.body,
  );
}
