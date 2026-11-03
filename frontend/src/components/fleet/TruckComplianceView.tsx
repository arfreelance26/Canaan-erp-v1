"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RiCloseLine as X, RiTruckLine as TruckIcon, RiEyeLine as Eye, RiFileCloseLine as FileX2, RiProfileLine as IdCard, RiClipboardLine as ClipboardCheck, RiReceiptLine as Receipt, RiGlobalLine as Globe, RiMapPin2Line as MapPin, RiWindyLine as Wind, RiShieldCheckLine as ShieldCheck, type RemixiconComponentType as LucideIcon } from "@remixicon/react";
import { fileUrl } from "@/lib/api";
import { COMPLIANCE_DOCS, formatRupees, type ComplianceDocMeta } from "@/lib/compliance-docs";
import { getComplianceStatus } from "@/lib/compliance";
import { getTyreLayout } from "@/lib/tyre-layouts";
import { formatDate } from "@/lib/format-date";
import { truckImageUrl } from "@/components/fleet/VehicleImages";
import { cn } from "@/lib/utils";
import type { Truck } from "@/types/truck";
import dynamic from "next/dynamic";

// Dialogs load on demand, after the page has drawn (next/dynamic).
const FileViewer = dynamic(() => import("@/components/ui/FileViewer").then((m) => m.FileViewer));

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
  Expired:         { pill: "bg-danger-surface text-danger-text ring-danger-border",           bar: "bg-danger-solid",     dot: "bg-danger-solid",     days: "text-danger-text",     label: "Expired" },
  "Expiring Soon": { pill: "bg-warning-surface text-warning-text ring-warning-border",     bar: "bg-warning-solid",   dot: "bg-warning-border",   days: "text-warning-text",   label: "Expiring" },
  Valid:           { pill: "bg-success-surface text-success-text ring-success-border", bar: "bg-success-solid", dot: "bg-success-solid", days: "text-success-text", label: "Valid" },
  Missing:         { pill: "bg-fill-2 text-text-secondary ring-separator-border",    bar: "bg-on-solid/25",    dot: "bg-background-primary-default",    days: "text-text-tertiary",   label: "Not on record" },
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/45 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-background-primary-default shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="relative shrink-0 bg-accent-solid px-6 pb-5 pt-6 text-on-solid">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full p-1.5 text-on-solid/70 transition hover:bg-on-solid/15 hover:text-on-solid"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-4 pr-8">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-separator-border bg-on-solid/10 shadow-lg">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" onError={() => setPhotoBroken(true)} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-on-solid/70">
                  <TruckIcon className="h-7 w-7" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-caption-2-semibold text-on-solid/80">Compliance Overview</p>
              <h2 className="truncate text-title-2-semibold leading-tight">{truck.registrationNumber || truck.truckId}</h2>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-caption-2-medium">
                <span className="rounded-full bg-on-solid/15 px-2 py-0.5">{truck.truckId}</span>
                {model && <span className="rounded-full bg-on-solid/15 px-2 py-0.5">{model}</span>}
                {layout && <span className="rounded-full bg-on-solid/15 px-2 py-0.5">{layout}</span>}
                {truck.truckType && <span className="rounded-full bg-on-solid/15 px-2 py-0.5">{truck.truckType}</span>}
              </div>
            </div>
          </div>

          {/* Health bar */}
          <div className="mt-5">
            <div className="flex h-2 overflow-hidden rounded-full bg-on-solid/10">
              {ORDER.map((s) => counts[s] > 0 && (
                <div key={s} className={LOOK[s].bar} style={{ width: `${(counts[s] / docs.length) * 100}%` }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-on-solid/80">
              {ORDER.map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", LOOK[s].dot)} />
                  <b className="text-on-solid">{counts[s]}</b> {LOOK[s].label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <ul className="divide-y divide-separator-border overflow-hidden rounded-xl border border-separator-border">
            {docs.map(({ meta, date, state, days, cost, number, hasFile }) => {
              const Icon = ICONS[meta.key];
              const look = LOOK[state];
              return (
                <li key={meta.key} className="flex items-center gap-3 bg-background-primary-default px-3.5 py-3 transition-colors hover:bg-fill-2">
                  <span className={cn("h-9 w-1 shrink-0 rounded-full", state === "Missing" ? "bg-fill-3" : look.bar)} aria-hidden />
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-solid/[0.07] text-accent-text-strong">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-semibold text-text-primary">{meta.label}</p>
                    <p className="truncate text-[11px] text-text-tertiary">
                      {cost != null ? formatRupees(cost) : "No cost"}
                      {number && <> · No. {number}</>}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-body-semibold tabular-nums text-text-primary">{date ? formatDate(date) : "—"}</p>
                    <p className={cn("text-caption-2-medium", look.days)}>{days == null ? "No date" : daysText(days)}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-caption-2-semibold ring-1", look.pill)}>
                    {look.label}
                  </span>
                  {hasFile ? (
                    <button
                      type="button"
                      onClick={() => setViewing({ url: fileUrl("trucks", truck.id, meta.key), title: `${truck.registrationNumber} — ${meta.label}` })}
                      aria-label={`View ${meta.label} document`}
                      title="View document"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent-border bg-accent-surface text-accent-text transition hover:bg-accent-surface-strong"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  ) : (
                    <span
                      title="No document uploaded"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-separator-border text-text-tertiary"
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
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-separator-border bg-fill-1 px-5 py-3">
          <p className="text-xs text-text-secondary">
            Current documents cost <span className="font-semibold text-text-primary">{formatRupees(totalCost)}</span>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-separator-border bg-background-primary-default px-4 py-1.5 text-body-medium text-text-primary transition hover:bg-fill-2"
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
