"use client";

import { useMemo, useState } from "react";
import { Route } from "lucide-react";
import type { Trip } from "@/types/trip";
import { MAP_H, MAP_REGIONS, MAP_W, project } from "@/lib/south-india-map";
import { resolvePlace, type ResolvedPlace } from "@/lib/lane-places";
import { fmtInrCompact } from "@/lib/format-inr";
import { Segmented } from "@/components/ui/Segmented";

type Window = "30" | "90" | "all";
type Metric = "trips" | "revenue";

type Lane = {
  id: string;
  from: ResolvedPlace;
  to: ResolvedPlace;
  trips: number;
  revenue: number;
};

const PAD = 14; // keep off-map arrows inside the frame

function tripDate(t: Trip): string {
  return (t.bookingCreatedDate || t.assignedDate || t.scheduledDate || "").slice(0, 10);
}

/** Pull `to` back along the ray from `from` until it sits inside the padded map box. */
function clipToBox(from: [number, number], to: [number, number]): { pt: [number, number]; off: boolean } {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const inside = x1 >= PAD && x1 <= MAP_W - PAD && y1 >= PAD && y1 <= MAP_H - PAD;
  if (inside) return { pt: to, off: false };
  let t = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx > 0) t = Math.min(t, (MAP_W - PAD - x0) / dx);
  if (dx < 0) t = Math.min(t, (PAD - x0) / dx);
  if (dy > 0) t = Math.min(t, (MAP_H - PAD - y0) / dy);
  if (dy < 0) t = Math.min(t, (PAD - y0) / dy);
  t = Math.max(0, t);
  return { pt: [x0 + dx * t, y0 + dy * t], off: true };
}

/** A curve that bows towards the north so lanes fan out like flight paths. */
function arcPath(a: [number, number], b: [number, number]) {
  const [x0, y0] = a;
  const [x1, y1] = b;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  let nx = dy / len;
  let ny = -dx / len;
  if (ny > 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const bow = len * 0.22;
  const cx = (x0 + x1) / 2 + nx * bow;
  const cy = (y0 + y1) / 2 + ny * bow;
  return { d: `M${x0.toFixed(1)},${y0.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`, len };
}

export function LaneMapCard({ trips }: { trips: Trip[] }) {
  const [win, setWin] = useState<Window>("90");
  const [metric, setMetric] = useState<Metric>("trips");
  const [hovered, setHovered] = useState<string | null>(null);

  const { lanes, shuttles, unmapped, total } = useMemo(() => {
    let cutoff = "";
    if (win !== "all") {
      const d = new Date();
      d.setDate(d.getDate() - Number(win));
      cutoff = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
    }
    const byLane = new Map<string, Lane>();
    let shuttleCount = 0;
    let unmappedCount = 0;
    let totalCount = 0;
    for (const t of trips) {
      if (t.status === "Cancelled") continue;
      if (cutoff && tripDate(t) < cutoff) continue;
      totalCount++;
      const from = resolvePlace(t.origin);
      const to = resolvePlace(t.destination);
      if (!from || !to) {
        unmappedCount++;
        continue;
      }
      if (from.key === to.key) {
        shuttleCount++;
        continue;
      }
      const id = `${from.key}>${to.key}`;
      const lane = byLane.get(id) ?? { id, from, to, trips: 0, revenue: 0 };
      lane.trips += 1;
      lane.revenue += Number(t.transportHireAmount) || 0;
      byLane.set(id, lane);
    }
    return { lanes: [...byLane.values()], shuttles: shuttleCount, unmapped: unmappedCount, total: totalCount };
  }, [trips, win]);

  const laneRevenue = useMemo(() => lanes.reduce((a, l) => a + l.revenue, 0), [lanes]);
  const ranked = useMemo(() => [...lanes].sort((a, b) => b[metric] - a[metric] || b.trips - a.trips), [lanes, metric]);
  const maxValue = ranked[0]?.[metric] || 1;
  const hub = project(8.7642, 78.1348);

  // Geometry for every lane (positions never change with hover, only styling does).
  const drawn = useMemo(() => {
    return ranked.map((lane, i) => {
      const p0 = project(lane.from.lat, lane.from.lon);
      const raw = project(lane.to.lat, lane.to.lon);
      const { pt: p1, off } = clipToBox(p0, raw);
      const { d, len } = arcPath(p0, p1);
      const weight = Math.sqrt(lane[metric] / maxValue);
      return { lane, rank: i, p0, p1, off, d, len, weight };
    });
  }, [ranked, metric, maxValue]);

  const hoveredLane = hovered ? ranked.find((l) => l.id === hovered) ?? null : null;
  const routeLabel = (l: Lane) => `${l.from.label} → ${l.to.label}`;

  return (
    <div className="dk-inset lane-map flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-blue-50/70 via-white to-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Route className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Lane Map</h2>
            <p className="text-xs text-gray-500">Where your trucks actually run</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Size lanes by"
            value={metric}
            onChange={setMetric}
            options={[{ value: "trips", label: "Trips" }, { value: "revenue", label: "Revenue" }]}
          />
          <Segmented
            label="Time window"
            value={win}
            onChange={setWin}
            options={[{ value: "30", label: "30d" }, { value: "90", label: "90d" }, { value: "all", label: "All" }]}
          />
        </div>
      </div>

      {lanes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-10 text-sm text-gray-400">No trips in this window.</div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          {/* Map */}
          <div className="relative">
            <div className="relative">
            <svg
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              className="h-auto w-full"
              role="img"
              aria-label={`Route map of ${ranked.length} lanes out of Tuticorin and Chennai`}
              onMouseLeave={() => setHovered(null)}
            >
              <defs>
                <filter id="lane-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="3" />
                </filter>
              </defs>

              {/* graticule */}
              <g className="lane-grid">
                {Array.from({ length: 7 }, (_, i) => 8 + i).map((lat) => {
                  const y = project(lat, 76)[1];
                  return <line key={`lat${lat}`} x1={0} x2={MAP_W} y1={y} y2={y} />;
                })}
                {[76, 77, 78, 79, 80].map((lon) => {
                  const x = project(10, lon)[0];
                  return <line key={`lon${lon}`} x1={x} x2={x} y1={0} y2={MAP_H} />;
                })}
              </g>

              {/* land */}
              {MAP_REGIONS.map((r) => (
                <path key={r.id} d={r.d} className={r.id === "TN" ? "lane-land lane-land-home" : "lane-land"} />
              ))}

              {/* lanes: glow underlay for the busiest, then crisp arcs */}
              {drawn.slice(0, 6).map(({ lane, d, weight }) => (
                <path
                  key={`g-${lane.id}`}
                  d={d}
                  className="lane-glow"
                  strokeWidth={2 + weight * 6}
                  style={{ opacity: hovered && hovered !== lane.id ? 0 : 1 }}
                  filter="url(#lane-glow)"
                  fill="none"
                />
              ))}
              {[...drawn].reverse().map(({ lane, d, weight }) => {
                const dim = hovered !== null && hovered !== lane.id;
                const on = hovered === lane.id;
                return (
                  <path
                    key={lane.id}
                    d={d}
                    fill="none"
                    className="lane-arc"
                    strokeWidth={(0.9 + weight * 3.6) * (on ? 1.5 : 1)}
                    style={{ opacity: dim ? 0.12 : on ? 1 : 0.35 + weight * 0.55 }}
                  />
                );
              })}

              {/* pulses showing flow direction on the busiest lanes */}
              {drawn.slice(0, 12).map(({ lane, d, len, rank }) => {
                if (hovered !== null && hovered !== lane.id) return null;
                const dur = 2.2 + len / 90;
                return (
                  <circle key={`p-${lane.id}`} r={2.4} className="lane-dot">
                    <animateMotion dur={`${dur.toFixed(1)}s`} begin={`${(rank * 0.45).toFixed(2)}s`} repeatCount="indefinite" path={d} />
                  </circle>
                );
              })}

              {/* hit areas (wide, invisible) so thin arcs are easy to hover */}
              {drawn.map(({ lane, d }) => (
                <path
                  key={`h-${lane.id}`}
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(lane.id)}
                />
              ))}

              {/* destinations */}
              {drawn.map(({ lane, p1, off, rank, weight }) => {
                const showLabel = rank < 9 || hovered === lane.id;
                const nearRight = p1[0] > MAP_W - 90;
                const dim = hovered !== null && hovered !== lane.id;
                return (
                  <g key={`d-${lane.id}`} style={{ opacity: dim ? 0.25 : 1 }} className="pointer-events-none">
                    {off ? (
                      <path d="M-4,3 L0,-5 L4,3 Z" className="lane-city-off" transform={`translate(${p1[0].toFixed(1)},${p1[1].toFixed(1)})`} />
                    ) : (
                      <circle cx={p1[0]} cy={p1[1]} r={2 + weight * 2.6} className="lane-city" />
                    )}
                    {showLabel && (
                      <text
                        x={p1[0] + (nearRight ? -7 : 7)}
                        y={p1[1] + (off ? (p1[1] < MAP_H / 2 ? 12 : -6) : 3)}
                        textAnchor={nearRight ? "end" : "start"}
                        className="lane-label"
                      >
                        {lane.to.label}
                        {off ? " ↗" : ""}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* hubs (origins) */}
              {[...new Map(ranked.map((l) => [l.from.key, l.from])).values()].map((o) => {
                const [x, y] = project(o.lat, o.lon);
                const isMain = o.key === "TUTICORIN";
                return (
                  <g key={`o-${o.key}`} className="pointer-events-none">
                    {isMain && (
                      <circle cx={x} cy={y} r={6} className="lane-pulse">
                        <animate attributeName="r" values="6;22" dur="2.6s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.55;0" dur="2.6s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle cx={x} cy={y} r={isMain ? 5.5 : 4.5} className="lane-hub" />
                    <text
                      x={x > MAP_W - 90 ? x - 10 : x + 10}
                      y={y + (isMain ? 18 : 5)}
                      textAnchor={x > MAP_W - 90 ? "end" : "start"}
                      className="lane-label lane-label-hub"
                    >
                      {o.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            {/* floating readout */}
            <div className="pointer-events-none absolute bottom-2 left-2 max-w-[70%] rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2 text-xs shadow-sm backdrop-blur">
              {hoveredLane ? (
                <>
                  <p className="font-semibold text-gray-900">{routeLabel(hoveredLane)}</p>
                  <p className="mt-0.5 text-gray-500">
                    <span className="font-semibold tabular-nums text-gray-800">{hoveredLane.trips}</span> {hoveredLane.trips === 1 ? "trip" : "trips"} ·{" "}
                    <span className="font-semibold tabular-nums text-gray-800">{fmtInrCompact(hoveredLane.revenue)}</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-gray-900">{ranked.length} lanes</p>
                  <p className="mt-0.5 text-gray-500">
                    <span className="font-semibold tabular-nums text-gray-800">{total}</span> trips · hover a route
                  </p>
                </>
              )}
            </div>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
              Line thickness = {metric === "trips" ? "number of trips" : "revenue"} · moving dots show direction · ▲ destination beyond the map
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: "Lanes", value: String(ranked.length) },
                { label: "Trips", value: String(total) },
                { label: "Lane revenue", value: fmtInrCompact(laneRevenue) },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{s.label}</p>
                  <p className="text-base font-bold tabular-nums text-gray-900">{s.value}</p>
                </div>
              ))}
            </div>

          </div>

          {/* Ranking */}
          <div className="relative min-h-[360px] min-w-0">
           <div className="absolute inset-0 flex flex-col">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Top lanes</p>
            <ul className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1" onMouseLeave={() => setHovered(null)}>
              {ranked.slice(0, 30).map((lane, i) => {
                const pct = Math.max(4, (lane[metric] / maxValue) * 100);
                const active = hovered === lane.id;
                return (
                  <li
                    key={lane.id}
                    onMouseEnter={() => setHovered(lane.id)}
                    className={`rounded-xl border px-3 py-2 text-xs transition-colors ${
                      active ? "border-blue-300 bg-blue-50" : "border-gray-100 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-4 shrink-0 text-[10px] font-bold tabular-nums text-gray-400">{i + 1}</span>
                        <span className="truncate font-semibold text-gray-800">{routeLabel(lane)}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-gray-500">
                        <span className={metric === "trips" ? "font-bold text-gray-900" : ""}>{lane.trips} {lane.trips === 1 ? "trip" : "trips"}</span>
                        <span className="mx-1 text-gray-300">·</span>
                        <span className={metric === "revenue" ? "font-bold text-gray-900" : ""}>{fmtInrCompact(lane.revenue)}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-100">
                      <div className="lane-bar h-full rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            {(shuttles > 0 || unmapped > 0) && (
              <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                {shuttles > 0 && (
                  <>
                    <span className="font-semibold tabular-nums text-gray-700">{shuttles}</span> port shuttles inside Tuticorin
                  </>
                )}
                {shuttles > 0 && unmapped > 0 && " · "}
                {unmapped > 0 && (
                  <>
                    <span className="font-semibold tabular-nums text-gray-700">{unmapped}</span> to places not on the map
                  </>
                )}
              </p>
            )}
           </div>
          </div>
        </div>
      )}
    </div>
  );
}
