"""Road distance between two addresses, for a customer route's "Approx Distance"
(Our Customers → Destinations → Calculate road distance).

Geoapify, called only from here so the key never reaches the browser:
  1. Geocoding — each address (with its state, India only) → a map point
  2. Routing   — the two points → the truck road distance (mode=truck)

Only the addresses are sent, never customer names or money. The key is
GEOAPIFY_API_KEY in backend/.env. Place lookups are cached in memory, so
recalculating the same route doesn't spend credits again.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

GEOCODE_URL = "https://api.geoapify.com/v1/geocode/search"
ROUTING_URL = "https://api.geoapify.com/v1/routing"
TIMEOUT_S = 12
# Below this Geoapify isn't sure it found the right place: the form asks to check it.
LOW_CONFIDENCE = 0.6
# Geoapify's match_type: did it find the place typed, or only part of it (the town,
# a street)? Confidence alone isn't enough — "V.O.C Port, Thoothukudi" came back as
# a pharmacy in Thoothukudi with confidence 1.0 but match_type "inner_part".
EXACT_MATCHES = {"full_match", "match_by_building"}


class GeoError(Exception):
    """A plain-language reason the distance couldn't be worked out (shown in the form)."""


def _key() -> str:
    key = (os.getenv("GEOAPIFY_API_KEY") or "").strip()
    if not key:
        raise GeoError("Road distance isn't set up yet (no Geoapify key on the server). Enter the km by hand for now.")
    return key


def _get_json(url: str, params: dict) -> dict:
    """GET → JSON. Kept tiny so tests can replace it."""
    full = f"{url}?{urllib.parse.urlencode(params, safe=',|:')}"
    req = urllib.request.Request(full, headers={"Accept": "application/json", "User-Agent": "canaan-erp"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise GeoError("The Geoapify key was refused. Check GEOAPIFY_API_KEY on the server.") from e
        if e.code == 429:
            raise GeoError("Today's free Geoapify limit is used up. Try again tomorrow, or enter the km by hand.") from e
        raise GeoError(f"The distance service answered with an error ({e.code}). Try again in a moment.") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise GeoError("Couldn't reach the distance service. Check the internet connection and try again.") from e


_KIND = {GEOCODE_URL: "geocode", ROUTING_URL: "route"}


def _call(url: str, params: dict) -> dict:
    """Every Geoapify request goes through here (geo_usage.py): the lasting cache
    first (free), then today's budget and the person's hourly limit, then the
    request — recorded with its credit."""
    import geo_usage
    kind = _KIND.get(url) or ("reverse" if url == REVERSE_URL else "other")
    key = geo_usage.cache_key(url, params)
    hit = geo_usage.cached(key)
    if hit is not None:
        return hit
    try:
        geo_usage.check(1)
    except geo_usage.LimitReached as e:
        raise GeoError(str(e)) from e
    data = _get_json(url, params)      # the real request (tests replace _get_json)
    geo_usage.record(kind, 1)
    geo_usage.remember(key, kind, data)
    return data


def _clean(s: str | None) -> str:
    return " ".join((s or "").replace("\n", " ").split())


@lru_cache(maxsize=512)
def _geocode_cached(text: str) -> tuple:
    data = _call(GEOCODE_URL, {"text": text, "filter": "countrycode:in", "format": "json", "limit": 1, "apiKey": _key()})
    results = data.get("results") or []
    if not results:
        return ()
    r = results[0]
    rank = r.get("rank") or {}
    return (float(r["lat"]), float(r["lon"]), r.get("formatted") or text, r.get("state") or "",
            float(rank.get("confidence") if rank.get("confidence") is not None else 1.0), r.get("result_type") or "",
            rank.get("match_type") or "")


def geocode(address: str, state: str | None) -> dict:
    """One address (+ its state) → where Geoapify puts it."""
    address, state = _clean(address), _clean(state)
    if not address:
        raise GeoError("Enter both the origin and destination address first.")
    text = ", ".join(x for x in (address, state, "India") if x)
    hit = _geocode_cached(text.lower())
    if not hit:
        raise GeoError(f"Couldn't find \"{address}\" on the map. Try a clearer place name or a nearby landmark.")
    lat, lon, formatted, found_state, confidence, kind, match_type = hit
    return {"query": text, "address": address, "matched": formatted, "lat": lat, "lon": lon, "state": found_state,
            "confidence": round(confidence, 2), "kind": kind, "match_type": match_type,
            # Found the place itself (not just its town or street) and sure of it.
            "exact": match_type in EXACT_MATCHES and confidence >= LOW_CONFIDENCE}


def pinned(lat: float, lon: float, address: str | None = None) -> dict:
    """An end placed exactly on the map (Pick on map): no lookup, nothing to doubt."""
    lat, lon = float(lat), float(lon)
    if not (5.0 <= lat <= 38.0 and 67.0 <= lon <= 98.5):   # roughly India
        raise GeoError("A pin is outside India. Move it onto the right place and try again.")
    return {"query": "", "address": _clean(address), "matched": f"Pinned on map ({lat:.5f}, {lon:.5f})",
            "lat": lat, "lon": lon, "state": "", "confidence": 1.0, "kind": "pin", "match_type": "pin", "exact": True}


def _route_line(feature: dict, max_points: int = 400) -> list[list[float]]:
    """The route's path as [[lat, lon], …], thinned to at most max_points, for drawing on the map."""
    geom = feature.get("geometry") or {}
    coords = geom.get("coordinates") or []
    if geom.get("type") == "MultiLineString":
        coords = [pt for line in coords for pt in line]
    pts = [[round(float(c[1]), 5), round(float(c[0]), 5)] for c in coords if len(c) >= 2]
    if len(pts) > max_points:
        step = len(pts) / (max_points - 1)
        pts = [pts[int(i * step)] for i in range(max_points - 1)] + [pts[-1]]
    return pts


def road_distance(origin_address: str | None, origin_state: str | None,
                  destination_address: str | None, destination_state: str | None,
                  origin_pin: tuple[float, float] | None = None,
                  destination_pin: tuple[float, float] | None = None) -> dict:
    """The truck road distance (one way) between the route's two ends — each a
    pin on the map if given (exact), else its address looked up — with what was
    matched, anything worth double-checking, and the path for the map."""
    origin = pinned(*origin_pin, origin_address) if origin_pin else geocode(origin_address or "", origin_state)
    dest = pinned(*destination_pin, destination_address) if destination_pin else geocode(destination_address or "", destination_state)
    data = _call(ROUTING_URL, {
        "waypoints": f"{origin['lat']},{origin['lon']}|{dest['lat']},{dest['lon']}",
        "mode": "truck",
        "apiKey": _key(),
    })
    features = data.get("features") or []
    props = (features[0].get("properties") or {}) if features else {}
    if props.get("distance") is None:
        raise GeoError("No road route was found between these two places. Check the addresses or the pins.")
    km = round(float(props["distance"]) / 1000, 1)

    warnings = []
    for label, p, wanted in (("Origin", origin, origin_state), ("Destination", dest, destination_state)):
        if not p["exact"]:
            warnings.append(f"{label}: \"{p['address']}\" wasn't found exactly; it matched \"{p['matched']}\". "
                            "The km may be off. Pick it on the map, try a clearer address, or check on Google Maps.")
        if wanted and p["state"] and _clean(wanted).lower() not in p["state"].lower() and p["state"].lower() not in _clean(wanted).lower():
            warnings.append(f"{label} was matched in {p['state']}, not {_clean(wanted).title()}. Check the address.")
    if km < 1:
        warnings.append("Both ends are almost the same spot. Check the addresses or the pins.")

    return {
        "km": km,
        "minutes": round(float(props.get("time") or 0) / 60) or None,
        "mode": "truck",
        "origin": origin,
        "destination": dest,
        "warnings": warnings,
        # Both ends found exactly (or pinned): safe to fill the km in. Otherwise the form asks first.
        "sure": origin["exact"] and dest["exact"] and km >= 1,
        # Pinned at both ends: the most accurate the route can be.
        "pinned": origin["kind"] == "pin" and dest["kind"] == "pin",
        "line": _route_line(features[0]),
    }


@lru_cache(maxsize=256)
def _search_cached(text: str) -> tuple:
    data = _call(GEOCODE_URL, {"text": text, "filter": "countrycode:in", "format": "json", "limit": 5, "apiKey": _key()})
    return tuple((float(r["lat"]), float(r["lon"]), r.get("formatted") or "", r.get("result_type") or "")
                 for r in (data.get("results") or []) if r.get("lat") is not None)


def search_places(text: str, state: str | None = None) -> list[dict]:
    """The map's search box: up to five places for what was typed (India,
    with the state if given), to jump to and drop a pin near."""
    text, state = _clean(text), _clean(state)
    if len(text) < 3:
        return []
    q = ", ".join(x for x in (text, state, "India") if x)
    return [{"lat": a, "lon": b, "label": c, "kind": d} for a, b, c, d in _search_cached(q.lower())]


# ── Pin check (Pick on map → Use these pins) ─────────────────────────────────

REVERSE_URL = "https://api.geoapify.com/v1/geocode/reverse"
# A pin this far from where its typed address is: "is the pin or the name wrong?"
FAR_KM = 25.0
# The nearest named place is offered as the address only this close to the pin (metres).
NAME_WITHIN_M = 50


def _km_apart(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    """Straight-line km between two points (haversine)."""
    from math import asin, cos, radians, sin, sqrt
    dlat, dlon = radians(b_lat - a_lat), radians(b_lon - a_lon)
    h = sin(dlat / 2) ** 2 + cos(radians(a_lat)) * cos(radians(b_lat)) * sin(dlon / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(h))


@lru_cache(maxsize=256)
def _reverse_cached(lat: float, lon: float) -> tuple:
    data = _call(REVERSE_URL, {"lat": lat, "lon": lon, "format": "json", "apiKey": _key()})
    r = (data.get("results") or [{}])[0]
    # The nearest named place only when the pin is really on it (within NAME_WITHIN_M);
    # then the area and the town. No postcodes.
    near = r.get("name") if float(r.get("distance") or 1e9) <= NAME_WITHIN_M else None
    area = r.get("suburb") or r.get("district") or r.get("street")
    town = r.get("city") or r.get("town") or r.get("village") or r.get("county")
    parts = [_clean(x) for x in (near, area, town) if x]
    short = ", ".join(dict.fromkeys(parts))
    return (short or _clean(r.get("formatted")), _clean(r.get("state")))


def place_name(lat: float, lon: float) -> dict:
    """What the map calls a pinned spot — offered for an empty address box."""
    name, state = _reverse_cached(round(float(lat), 5), round(float(lon), 5))
    return {"name": name, "state": state.upper() if state else ""}


def check_pin(address: str | None, state: str | None, lat: float, lon: float) -> dict:
    """One end of a pinned route against its typed address:
      far        the address is found exactly, and more than FAR_KM from the pin
      ok         found exactly, and close to the pin
      unchecked  the address can't be found exactly on the map (a CFS name, a
                 customer's own name for a place) — the pin is trusted
      empty      no address typed — `suggestion` is the map's name for the spot
    """
    address = _clean(address)
    if not address:
        return {"status": "empty", "suggestion": place_name(lat, lon)}
    try:
        found = geocode(address, state)
    except GeoError:
        return {"status": "unchecked"}
    if not found["exact"]:
        return {"status": "unchecked"}
    apart = round(_km_apart(lat, lon, found["lat"], found["lon"]), 1)
    return {"status": "far" if apart > FAR_KM else "ok", "km_apart": apart, "matched": found["matched"]}
