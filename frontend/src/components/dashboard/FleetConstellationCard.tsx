"use client";

import { useMemo, useState } from "react";
import { Truck as TruckIcon } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { Trip } from "@/types/trip";
import type { TruckMaintenanceStatus } from "@/types/maintenance-status";
import { getComplianceStatus } from "@/lib/compliance";
import { COMPLIANCE_CHECKS } from "@/hooks/useComplianceAlerts";
import { Segmented } from "@/components/ui/Segmented";

type Filter = "all" | "road" | "attention";
type Health = "ok" | "soon" | "expired";

// Same definition the rest of the dashboard uses for "on the road".
const ON_ROAD = new Set(["Started", "Loaded", "On-Transit", "Reached", "Unloaded"]);

type Node = {
  truck: Truck;
  short: string;
  health: Health;
  expired: string[];
  soon: string[];
  maintOverdue: number;
  maintNames: string[];
  onRoad: Trip | null;
  assigned: Trip | null;
  idleDays: number | null;
  lastTrip: string | null;
  cx: number;
  cy: number;
};

const R = 30;                       // hex radius (SVG units)
const HEX_W = Math.sqrt(3) * R;
const ROW_H = 1.5 * R;
const PAD = 22;

function hexPoints(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

const HEALTH_CLASS: Record<Health, string> = { ok: "fc-ok", soon: "fc-soon", expired: "fc-bad" };
const short = (t: Truck) => (t.registrationNumber || t.truckId || "").replace(/\s/g, "").slice(-4);

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

export function FleetConstellationCard({
  trucks,
  trips,
  maintenanceStatus,
}: {
  trucks: Truck[];
  trips: Trip[];
  maintenanceStatus: TruckMaintenanceStatus[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [hovered, setHovered] = useState<string | null>(null);

  const { nodes, width, height } = useMemo(() => {
    const maintByTruck = new Map(maintenanceStatus.map((m) => [String(m.truckDbId), m]));
    const tripsByVehicle = new Map<string, Trip[]>();
    for (const t of trips) {
      if (!t.vehicleId || t.status === "Cancelled") continue;
      const list = tripsByVehicle.get(t.vehicleId) ?? [];
      list.push(t);
      tripsByVehicle.set(t.vehicleId, list);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sorted = [...trucks].sort((a, b) =>
      (a.truckId || "").localeCompare(b.truckId || "", undefined, { numeric: true })
    );
    const n = sorted.length;
    const c = Math.max(4, Math.min(10, Math.ceil(Math.sqrt(n * 1.6))));
    const rows = Math.max(1, Math.ceil(n / c));
    const w = c * HEX_W + HEX_W / 2 + PAD * 2;
    const h = (rows - 1) * ROW_H + 2 * R + PAD * 2;

    const list: Node[] = sorted.map((truck, i) => {
      const row = Math.floor(i / c);
      const col = i % c;
      const cx = PAD + HEX_W / 2 + col * HEX_W + (row % 2 ? HEX_W / 2 : 0);
      const cy = PAD + R + row * ROW_H;

      const expired: string[] = [];
      const soon: string[] = [];
      for (const { field, label, dateKey } of COMPLIANCE_CHECKS) {
        const date = truck[dateKey] as string | undefined;
        if (!date) continue;
        const s = getComplianceStatus(date, field);
        if (s === "Expired") expired.push(label);
        else if (s === "Expiring Soon") soon.push(label);
      }
      const maint = maintByTruck.get(String(truck.id));
      const maintNames = maint ? maint.items.filter((x) => x.status === "Overdue").map((x) => x.typeName) : [];

      const mine = tripsByVehicle.get(truck.truckId) ?? [];
      const onRoad = mine.find((t) => ON_ROAD.has(t.status) && !t.hasClosure && !t.isInvoiced) ?? null;
      const assigned = onRoad ? null : mine.find((t) => t.status === "Assigned" && !t.hasClosure && !t.isInvoiced) ?? null;
      let lastTrip: string | null = null;
      for (const t of mine) {
        const d = (t.scheduledDate || t.assignedDate || "").slice(0, 10);
        if (d && (!lastTrip || d > lastTrip)) lastTrip = d;
      }
      const idleDays =
        lastTrip && !onRoad
          ? Math.max(0, Math.floor((today.getTime() - new Date(lastTrip + "T00:00:00").getTime()) / 86400000))
          : null;

      return {
        truck,
        short: short(truck),
        health: expired.length ? "expired" : soon.length ? "soon" : "ok",
        expired,
        soon,
        maintOverdue: maint?.overdueCount ?? 0,
        maintNames,
        onRoad,
        assigned,
        idleDays,
        lastTrip,
        cx,
        cy,
      };
    });
    return { nodes: list, width: w, height: h };
  }, [trucks, trips, maintenanceStatus]);

  const attention = (n: Node) => n.health !== "ok";
  const matches = (n: Node) => filter === "all" || (filter === "road" ? !!n.onRoad : attention(n));

  const onRoadCount = nodes.filter((n) => n.onRoad).length;
  const expiredTrucks = nodes.filter((n) => n.health === "expired").length;
  const soonTrucks = nodes.filter((n) => n.health === "soon").length;
  const maintTrucks = nodes.filter((n) => n.maintOverdue > 0).length;

  const queue = useMemo(
    () =>
      nodes
        .filter(attention)
        .sort(
          (a, b) =>
            b.expired.length - a.expired.length ||
            b.soon.length - a.soon.length
        ),
    [nodes]
  );

  const active = hovered ? nodes.find((n) => n.truck.id === hovered) ?? null : null;

  const reasons = (n: Node) => {
    const out: string[] = [];
    if (n.expired.length) out.push(`${n.expired[0]}${n.expired.length > 1 ? ` +${n.expired.length - 1}` : ""} expired`);
    if (n.soon.length) out.push(`${n.soon.length} expiring soon`);
    return out.join(" · ");
  };

  return (
    <div className="dk-inset fleet-const flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50/70 via-white to-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <TruckIcon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Fleet Constellation</h2>
            <p className="text-xs text-gray-500">Every truck at a glance — hover for details</p>
          </div>
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "road", label: "On the road" },
            { value: "attention", label: "Needs attention" },
          ]}
        />
      </div>

      {nodes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-10 text-sm text-gray-400">No trucks in the fleet yet.</div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 p-4">
          {/* Headline numbers */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-sky-200/70 bg-sky-50/70 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">On the road</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">
                {onRoadCount}
                <span className="text-base font-semibold text-gray-400"> / {nodes.length}</span>
              </p>
              <p className="text-xs text-gray-500">{nodes.length - onRoadCount} not moving</p>
            </div>
            <div className="rounded-xl border border-red-200/70 bg-red-50/70 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-700">Documents</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">{expiredTrucks}</p>
              <p className="text-xs text-gray-500">
                {expiredTrucks === 1 ? "truck" : "trucks"} expired · {soonTrucks} expiring soon
              </p>
            </div>
            <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Service</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">{maintTrucks}</p>
              <p className="text-xs text-gray-500">{maintTrucks === 1 ? "truck" : "trucks"} with overdue service</p>
            </div>
          </div>

          {/* Honeycomb */}
          <div className="relative">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="h-auto w-full"
              role="img"
              aria-label={`${nodes.length} trucks: ${onRoadCount} on the road, ${expiredTrucks} with expired documents`}
              onMouseLeave={() => setHovered(null)}
            >
              {nodes.map((n, i) => {
                const dim = !matches(n);
                const on = hovered === n.truck.id;
                return (
                  <g
                    key={n.truck.id}
                    className="fc-node cursor-pointer"
                    style={{ opacity: dim ? 0.16 : 1 }}
                    onMouseEnter={() => setHovered(n.truck.id)}
                  >
                    {n.onRoad && (
                      <polygon
                        points={hexPoints(n.cx, n.cy, R * 0.9)}
                        className="fc-ring"
                        style={{ animationDelay: `${(i % 7) * 0.28}s` }}
                      />
                    )}
                    <polygon
                      points={hexPoints(n.cx, n.cy, R * 0.9)}
                      className={`fc-hex ${HEALTH_CLASS[n.health]} ${on ? "fc-on" : ""}`}
                    />
                    {n.assigned && !n.onRoad && (
                      <polygon points={hexPoints(n.cx, n.cy, R * 0.9 + 3)} className="fc-assigned" />
                    )}
                    <text x={n.cx} y={n.cy + 4.5} textAnchor="middle" className={`fc-text ${HEALTH_CLASS[n.health]}-t`}>
                      {n.short}
                    </text>
                    {n.onRoad && <circle cx={n.cx - R * 0.55} cy={n.cy - R * 0.62} r={3.4} className="fc-road-dot" />}
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {active && (
              <div
                className="pointer-events-none absolute z-10 w-60 rounded-xl border border-gray-200 bg-white/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur"
                style={{
                  left: `${Math.min(80, Math.max(20, (active.cx / width) * 100))}%`,
                  top: `${(active.cy / height) * 100}%`,
                  transform: active.cy / height < 0.4 ? "translate(-50%, 26px)" : "translate(-50%, calc(-100% - 26px))",
                }}
              >
                <p className="font-bold text-gray-900">{active.truck.registrationNumber || active.truck.truckId}</p>
                <p className="text-[11px] text-gray-500">
                  {[active.truck.manufacturer, active.truck.modelName].filter((v) => v && v.toLowerCase() !== "nan").join(" ")} · {active.truck.truckId}
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {active.onRoad ? (
                    <p className="text-sky-700">
                      ● On the road · {active.onRoad.tripId} · {active.onRoad.origin} → {active.onRoad.destination}
                      {active.onRoad.driverName ? ` · ${active.onRoad.driverName}` : ""}
                    </p>
                  ) : active.assigned ? (
                    <p className="text-sky-700">◌ Assigned · {active.assigned.tripId} · {active.assigned.origin} → {active.assigned.destination}</p>
                  ) : active.lastTrip ? (
                    <p className="text-gray-600">
                      Idle {active.idleDays} {active.idleDays === 1 ? "day" : "days"} · last trip {fmtDate(active.lastTrip)}
                    </p>
                  ) : (
                    <p className="text-gray-600">No trips yet</p>
                  )}
                  {active.expired.slice(0, 4).map((l) => (
                    <p key={l} className="text-red-600">● {l} expired</p>
                  ))}
                  {active.expired.length > 4 && <p className="text-red-600">+{active.expired.length - 4} more expired</p>}
                  {active.soon.slice(0, 3).map((l) => (
                    <p key={l} className="text-amber-600">● {l} expiring soon</p>
                  ))}
                  {active.maintOverdue > 0 && (
                    <p className="text-amber-700">
                      ● {active.maintOverdue} service overdue
                      {active.maintNames.length ? `: ${active.maintNames.slice(0, 2).join(", ")}${active.maintNames.length > 2 ? "…" : ""}` : ""}
                    </p>
                  )}
                  {!attention(active) && <p className="text-emerald-600">✓ All documents valid</p>}
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><i className="fc-key fc-ok" /> Healthy</span>
            <span className="flex items-center gap-1.5"><i className="fc-key fc-soon" /> Expiring soon</span>
            <span className="flex items-center gap-1.5"><i className="fc-key fc-bad" /> Expired</span>
            <span className="flex items-center gap-1.5"><i className="fc-key-dot fc-road-dot" /> On the road</span>
            <span className="flex items-center gap-1.5"><i className="fc-key-dash" /> Trip assigned</span>
          </div>

          {/* Attention queue */}
          <div className="flex min-h-[170px] flex-1 flex-col">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Needs attention <span className="tabular-nums">({queue.length})</span>
            </p>
            {queue.length === 0 ? (
              <p className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-4 text-center text-xs text-gray-500">
                Every truck has valid documents.
              </p>
            ) : (
              <div className="relative min-h-0 flex-1">
                <ul className="custom-scrollbar absolute inset-0 flex flex-col gap-1 overflow-y-auto pr-1" onMouseLeave={() => setHovered(null)}>
                  {queue.map((n) => (
                    <li
                      key={n.truck.id}
                      onMouseEnter={() => setHovered(n.truck.id)}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs transition-colors ${
                        hovered === n.truck.id ? "border-indigo-300 bg-indigo-50" : "border-gray-100 bg-white"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <i className={`fc-key shrink-0 ${HEALTH_CLASS[n.health]}`} />
                        <span className="shrink-0 font-semibold text-gray-900">{n.truck.registrationNumber || n.truck.truckId}</span>
                        <span className="truncate text-gray-500">{reasons(n)}</span>
                      </span>
                      {n.onRoad && (
                        <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">On road</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
