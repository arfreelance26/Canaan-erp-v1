"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Polyline } from "leaflet";
import {
  RiSearchLine as Search, RiLoader4Line as Loader2, RiErrorWarningLine as Warn,
  RiMapPin2Line as Pin, RiDeleteBinLine as Clear,
} from "@remixicon/react";
import { Dialog } from "@/components/ui/Dialog";
import { customersApi, type MapPin, type PlaceHit, type RouteDistance } from "@/lib/api";
import { cx } from "@/utils/cx";

type End = "origin" | "destination";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Where the pins start: the route's saved pins, else where the addresses were matched. */
  initialOrigin?: MapPin | null;
  initialDestination?: MapPin | null;
  /** The form's addresses: shown as hints and used to narrow the search. */
  originLabel?: string;
  originState?: string;
  destinationLabel?: string;
  destinationState?: string;
  onConfirm: (r: { origin: MapPin; destination: MapPin; distance: RouteDistance }) => void;
};

/** Roughly the middle of Tamil Nadu: where the map opens with no pins yet. */
const START: [number, number] = [10.8, 78.4];
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
// Fixed colours: the pins and route line read the same in both themes (on the light map).
const COLOUR: Record<End, string> = { origin: "#16a34a", destination: "#dc2626" };
const ROUTE = "#2563eb";
const LETTER: Record<End, string> = { origin: "A", destination: "B" };

/** A pasted Google Maps link or "lat, lon" → that point (null if it isn't one). */
export function pointFromText(text: string): MapPin | null {
  const t = text.trim();
  const pats = [
    /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/,               // 8.7642, 78.1956
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,                           // …!3d8.7642!4d78.1956 (the place itself)
    /[?&](?:q|query|ll|destination|origin|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,                               // …/@8.7642,78.1956,15z (the map view)
  ];
  for (const p of pats) {
    const m = t.match(p);
    if (m) {
      const lat = Number(m[1]), lon = Number(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
    }
  }
  return null;
}

/**
 * Pick on map (Our Customers → Destinations): drop or drag pin A (origin) and
 * pin B (destination) onto the exact spots — the port gate, the CFS, the
 * factory — and the truck road distance (one way) is worked out between them,
 * with the route drawn. A place search and "paste a Google Maps link" help find
 * the spot. OpenStreetMap tiles; Leaflet is loaded only when this opens.
 */
export function RouteMapPicker({
  open, onClose, initialOrigin, initialDestination, originLabel, originState, destinationLabel, destinationState, onConfirm,
}: Props) {
  // The map's box. The Dialog draws its contents a moment after opening, so the
  // map starts when this box appears (a callback ref), not when `open` flips.
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef<Partial<Record<End, Marker>>>({});
  const line = useRef<Polyline | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);   // the map has loaded (pins can be drawn)

  const [pins, setPins] = useState<Record<End, MapPin | null>>({ origin: initialOrigin ?? null, destination: initialDestination ?? null });
  const [active, setActive] = useState<End>(initialOrigin && !initialDestination ? "destination" : "origin");
  // The map's click handler is set up once; it reads the active pin from here.
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState("");

  const [route, setRoute] = useState<RouteDistance | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState("");

  // Esc closes this window only, not the route form under it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.body.classList.contains("driver-active")) return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  // Place a pin (the active one unless said otherwise); after A, move on to B.
  function place(end: End, p: MapPin, moveOn = true) {
    setPins((prev) => {
      const next = { ...prev, [end]: p };
      if (moveOn && end === "origin" && !next.destination) setActive("destination");
      return next;
    });
  }

  // The map: created once its box is on screen, with the starting pins.
  useEffect(() => {
    if (!open || !box) return;
    let cancelled = false;
    void import("leaflet").then((mod) => {
      const Lf = (mod as unknown as { default?: typeof import("leaflet") }).default ?? mod;
      if (cancelled || map.current) return;
      L.current = Lf;
      const m = Lf.map(box, { zoomControl: true, attributionControl: true }).setView(START, 7);
      Lf.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m);
      m.on("click", (e) => place(activeRef.current, { lat: +e.latlng.lat.toFixed(6), lon: +e.latlng.lng.toFixed(6) }));
      map.current = m;
      setReady(true);
      // The window animates in: measure again once it has its size.
      window.setTimeout(() => m.invalidateSize(), 250);
      const start = [initialOrigin, initialDestination].filter(Boolean) as MapPin[];
      if (start.length === 2) m.fitBounds(start.map((p) => [p.lat, p.lon] as [number, number]), { padding: [40, 40] });
      else if (start.length === 1) m.setView([start[0].lat, start[0].lon], 13);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
      markers.current = {};
      line.current = null;
    };
    // Built once per box; pins are kept in sync below.
  }, [open, box]);

  // Keep the two markers in step with the pins (draggable, lettered A / B).
  useEffect(() => {
    const m = map.current, Lf = L.current;
    if (!m || !Lf) return;
    (["origin", "destination"] as End[]).forEach((end) => {
      const p = pins[end];
      const existing = markers.current[end];
      if (!p) {
        existing?.remove();
        delete markers.current[end];
        return;
      }
      if (existing) {
        existing.setLatLng([p.lat, p.lon]);
        return;
      }
      const icon = Lf.divIcon({
        className: "",
        html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${COLOUR[end]};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font:700 13px/1 system-ui">${LETTER[end]}</span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });
      const mk = Lf.marker([p.lat, p.lon], { icon, draggable: true, autoPan: true, title: end === "origin" ? "Origin (A)" : "Destination (B)" })
        .addTo(m)
        .on("dragend", () => {
          const ll = mk.getLatLng();
          place(end, { lat: +ll.lat.toFixed(6), lon: +ll.lng.toFixed(6) }, false);
        });
      markers.current[end] = mk;
    });
    // The map may not be ready on the very first pins: this runs again once it is.
  }, [pins, ready]);

  // Both pins down: work out the route (a moment after the last move) and draw it.
  useEffect(() => {
    if (!pins.origin || !pins.destination) {
      setRoute(null);
      line.current?.remove();
      line.current = null;
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setRouting(true);
      setRouteError("");
      customersApi.routeDistance({
        originAddress: originLabel ?? "", originState: originState ?? "",
        destinationAddress: destinationLabel ?? "", destinationState: destinationState ?? "",
        originPin: pins.origin, destinationPin: pins.destination,
      })
        .then((r) => {
          if (cancelled) return;
          setRoute(r);
          const m = map.current, Lf = L.current;
          if (m && Lf && r.line.length > 1) {
            line.current?.remove();
            line.current = Lf.polyline(r.line, { color: ROUTE, weight: 5, opacity: 0.75 }).addTo(m);
            m.fitBounds(line.current.getBounds(), { padding: [40, 40] });
          }
        })
        .catch((e) => { if (!cancelled) { setRoute(null); setRouteError(e instanceof Error ? e.message : "Couldn't work out the route."); } })
        .finally(() => { if (!cancelled) setRouting(false); });
    }, 600);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [pins.origin?.lat, pins.origin?.lon, pins.destination?.lat, pins.destination?.lon]);

  // Search as you type (or a pasted link / coordinates: straight to that spot).
  useEffect(() => {
    setSearchNote("");
    const q = query.trim();
    const point = pointFromText(q);
    if (point) {
      setHits([]);
      return;
    }
    if (q.length < 3) {
      setHits([]);
      return;
    }
    if (/goo\.gl|maps\.app/i.test(q)) {
      setHits([]);
      setSearchNote("Short Google links can't be read. In Google Maps, right-click the spot, click the numbers at the top to copy them, and paste them here.");
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      setSearching(true);
      customersApi.placeSearch(q, (active === "origin" ? originState : destinationState) || undefined)
        .then((r) => { if (!cancelled) { setHits(r); if (!r.length) setSearchNote("Nothing found. Try another name, or move the map and click the spot."); } })
        .catch((e) => { if (!cancelled) setSearchNote(e instanceof Error ? e.message : "Search failed."); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 500);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [query, active]);

  function go(p: MapPin, zoom = 16) {
    place(active, p);
    map.current?.setView([p.lat, p.lon], zoom);
    setQuery("");
    setHits([]);
  }

  const pasted = pointFromText(query);
  const endLabel = (end: End) => (end === "origin" ? originLabel : destinationLabel)?.trim();

  return (
    <Dialog open={open} onClose={onClose} title="Pick the route on the map" className="sm:max-w-4xl">
      <div className="flex flex-col gap-3">
        {/* Which pin a click places */}
        <div className="flex flex-wrap items-center gap-2">
          {(["origin", "destination"] as End[]).map((end) => (
            <button
              key={end}
              type="button"
              onClick={() => setActive(end)}
              aria-pressed={active === end}
              className={cx(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-caption-1-semibold transition-colors",
                active === end ? "border-accent-border-strong bg-accent-surface text-text-primary" : "border-separator-border text-text-secondary hover:bg-fill-2",
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-on-solid" style={{ background: COLOUR[end] }}>{LETTER[end]}</span>
              {end === "origin" ? "Origin" : "Destination"}
              <span className="max-w-[160px] truncate font-normal text-text-tertiary">{endLabel(end) || ""}</span>
              {pins[end] ? <span className="text-success-text">✓</span> : <span className="font-normal text-text-tertiary">· not placed</span>}
            </button>
          ))}
          <span className="text-caption-1-regular text-text-tertiary">
            Click the map to place <b>{LETTER[active]}</b>, or drag a pin to move it.
          </span>
        </div>

        {/* Search, or paste a Google Maps link / coordinates */}
        <div className="relative">
          <div className="flex h-10 items-center gap-2 rounded-full border border-border-button-default bg-background-primary-default px-3.5">
            {searching ? <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" /> : <Search className="h-4 w-4 text-text-tertiary" />}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (pasted) go(pasted); else if (hits[0]) go(hits[0], 15); } }}
              placeholder={`Find a place for ${LETTER[active]}, or paste a Google Maps link / coordinates`}
              className="min-w-0 flex-1 bg-transparent text-body-regular text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </div>
          {(pasted || hits.length > 0 || searchNote) && (
            <div className="mt-1.5 overflow-hidden rounded-xl border border-separator-border bg-background-primary-default shadow-sm">
              {pasted && (
                <button type="button" onClick={() => go(pasted)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-fill-2">
                  <Pin className="h-4 w-4 shrink-0 text-accent-text" />
                  Put {LETTER[active]} at {pasted.lat.toFixed(5)}, {pasted.lon.toFixed(5)}
                </button>
              )}
              {hits.map((h) => (
                <button key={`${h.lat},${h.lon}`} type="button" onClick={() => go(h, 15)} className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-fill-2">
                  <Pin className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                  <span className="text-text-primary">{h.label}</span>
                </button>
              ))}
              {searchNote && <p className="px-3 py-2 text-xs text-text-tertiary">{searchNote}</p>}
            </div>
          )}
        </div>

        {/* The map */}
        <div className="relative overflow-hidden rounded-xl border border-separator-border">
          <div ref={setBox} className="h-[55vh] min-h-[320px] w-full bg-fill-1" />
        </div>

        {/* The route between the pins */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            {routing ? (
              <span className="flex items-center gap-2 text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Working out the route…</span>
            ) : routeError ? (
              <span className="flex items-start gap-1.5 text-danger-text"><Warn className="mt-0.5 h-4 w-4 shrink-0" /> {routeError}</span>
            ) : route ? (
              <span className="text-text-primary">
                <b>{route.km.toLocaleString("en-IN")} km</b>
                <span className="text-text-secondary"> one way, truck road{route.minutes ? ` · about ${Math.floor(route.minutes / 60)} h ${route.minutes % 60} min` : ""}</span>
              </span>
            ) : (
              <span className="text-text-tertiary">Place both pins to see the route and its km.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(pins.origin || pins.destination) && (
              <button
                type="button"
                onClick={() => { setPins({ origin: null, destination: null }); setActive("origin"); }}
                className="flex items-center gap-1.5 rounded-lg border border-separator-border px-3 py-2 text-caption-1-semibold text-text-secondary hover:bg-fill-2"
              >
                <Clear className="h-4 w-4" /> Clear pins
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg border border-separator-border px-4 py-2 text-body-medium text-text-primary hover:bg-fill-2">
              Cancel
            </button>
            <button
              type="button"
              disabled={!route || routing || !pins.origin || !pins.destination}
              onClick={() => route && pins.origin && pins.destination && onConfirm({ origin: pins.origin, destination: pins.destination, distance: route })}
              className="rounded-lg bg-accent-solid px-4 py-2 text-body-medium text-on-solid hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {route ? `Use these pins · ${Math.round(route.km).toLocaleString("en-IN")} km` : "Use these pins"}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
