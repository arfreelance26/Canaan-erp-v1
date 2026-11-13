"""Tyre Records → View: the five tyre pages as designed reports, in the
Resource Hub report shape (registered as kinds in resource_report.py, so the
Excel writer, preview and PDF are shared):

  tyre_inventory   Tyre Inventory — tyre by tyre, a sheet per status (Fitted,
                   In stock, Waiting for retread, Discarded); money spent;
                   by brand / size / type / vendor; proofs missing
  tyre_management  Tyre Management — truck by truck: each fitted tyre, km run
                   against its expected range, empty positions, the history
  tyre_retread     Retread Queue — tyres waiting, and retreads done
  tyre_discarded   Discarded Tyres — why, and the km each gave
  tyre_archive     Tyre Archive — deleted tyres and the tyre change log

Statuses follow the pages (routers/maintenance.py): fitted = a fitment not
removed; in stock = not fitted, not flagged for retread, not discarded.
Km run = each fitment's removed − fitted odometer; a tyre still on a truck
counts up to the truck's odometer now. A fitting saved with odometer 0 has no
known start, so its km isn't counted (km run is then a minimum; "km unknown" when no fitting is known). Expected range = the tyre's own range,
else Tyre Range Configuration's for its type. opts: stage = an inventory
status, rtype = a brand, start / end = the period (each report says on what).
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime

from sqlalchemy.orm import Session

import models
import resource_report as rr
from approvals_report import _ist
from audit_report import _inr
from maintenance_report import _iso, _period_label, _sheet_names
from resource_report import box, clean, table

STATUSES = ["Fitted", "In stock", "Waiting for retread", "Discarded"]
STATUS_TONE = {"Fitted": "good", "In stock": None, "Waiting for retread": "warn", "Discarded": "bad"}


def _day(dt) -> date | None:
    if dt is None:
        return None
    d = _ist(dt)
    return d.date() if isinstance(d, datetime) else d


def _label(start, end) -> str:
    return _period_label(start, end) if start or end else "All time"


def _in(day, start, end) -> bool:
    if not (start or end):
        return True
    return day is not None and (not start or day >= start) and (not end or day <= end)


class _Data:
    """Everything the tyre reports share, read once."""

    def __init__(self, db: Session):
        self.trucks = {t.id: t for t in db.query(models.Truck).options(rr.slim(models.Truck))}
        self.ranges = {r.tyre_type: r.range_km for r in db.query(models.TyreRangeConfig) if r.range_km}
        self.fitments = defaultdict(list)
        for f in db.query(models.TyreFitmentRecord).order_by(models.TyreFitmentRecord.fitted_date, models.TyreFitmentRecord.id):
            self.fitments[f.tyre_id].append(f)
        self.events = defaultdict(list)
        for e in db.query(models.TyreMovementEvent).order_by(models.TyreMovementEvent.created_at, models.TyreMovementEvent.id):
            self.events[e.tyre_id].append(e)

    def expected(self, t: models.TyreInventory) -> int | None:
        return int(t.range_km) if t.range_km else self.ranges.get(t.tyre_type)

    def current(self, t: models.TyreInventory):
        return next((f for f in self.fitments.get(t.id, []) if f.removed_odometer is None), None)

    def km(self, t: models.TyreInventory) -> float:
        return self.km_known(t)[0]

    def km_known(self, t: models.TyreInventory) -> tuple[float, int]:
        """(km run over the fittings whose odometers are known, how many fittings
        aren't). A fitting saved with odometer 0 (imported, or fitted before
        readings were kept) has no known start, so its km can't be counted:
        truck odometer - 0 would be the truck's whole life."""
        total, unknown = 0.0, 0
        for f in self.fitments.get(t.id, []):
            if not f.fitted_odometer or float(f.fitted_odometer) <= 0:
                unknown += 1
                continue
            end = f.removed_odometer
            if end is None:
                truck = self.trucks.get(f.truck_id)
                end = float(truck.odometer or 0) if truck else None
            if end is not None:
                total += max(0.0, float(end) - float(f.fitted_odometer))
        return total, unknown

    def used(self, t: models.TyreInventory):
        """% of its expected range used. Fittings saved with odometer 0 aren't
        counted, so with any of those it's a minimum; "km unknown" when no
        fitting has a known start."""
        km, unknown = self.km_known(t)
        if unknown and not km:
            return {"v": "km unknown", "tone": None}      # no fitting with a known start
        return _used(km, self.expected(t))                 # with some unknown: a minimum

    def status(self, t: models.TyreInventory) -> str:
        if t.discarded_at:
            return "Discarded"
        if t.retread_flagged_at:
            return "Waiting for retread"
        return "Fitted" if self.current(t) else "In stock"

    def reg(self, truck_id: int | None) -> str:
        t = self.trucks.get(truck_id)
        return (clean(t.registration_number) or t.truck_id) if t else ""

    def retread_spend(self, t: models.TyreInventory, start=None, end=None) -> float:
        return sum(float(e.retread_cost or 0) for e in self.events.get(t.id, [])
                   if e.event == "Moved to Inventory" and _in(_day(e.created_at), start, end))


def _used(km: float, expected: int | None):
    """% of its expected range used, toned: amber over 80, red past 100."""
    if not expected:
        return None
    pct = round(km / expected * 100, 1)
    return {"v": pct, "tone": "bad" if pct > 100 else "warn" if pct > 80 else None}


def _pct(cell, missing: float = 0.0) -> float:
    """The number in a Used (%) cell (empty or "km unknown" gives `missing`)."""
    v = cell.get("v") if isinstance(cell, dict) else cell
    return float(v) if isinstance(v, (int, float)) else missing


def _unknown(cell) -> bool:
    return isinstance(cell, dict) and cell.get("v") == "km unknown"


def _matches(t: models.TyreInventory, term: str, d: _Data) -> bool:
    if not term:
        return True
    cur = d.current(t)
    return any(term in (v or "").lower() for v in (t.tyre_number, t.brand, t.size, t.tyre_type, t.maintenance_by,
                                                  t.invoice_number, d.reg(cur.truck_id) if cur else ""))


def _tyres(db: Session, deleted: bool = False):
    q = db.query(models.TyreInventory).options(rr.slim(models.TyreInventory))
    q = q.filter(models.TyreInventory.deleted_at.isnot(None) if deleted else models.TyreInventory.deleted_at.is_(None))
    return q.order_by(models.TyreInventory.brand, models.TyreInventory.tyre_number).all()


# ── Tyre Inventory ───────────────────────────────────────────────────────────

def select_inventory(db: Session, *, start=None, end=None, search="", status="", brand=""):
    """(tyres with their status, every tyre in the period and search, data)."""
    d = _Data(db)
    term = (search or "").strip().lower()
    every = []
    for t in _tyres(db):
        bought = t.invoice_date or t.purchase_date
        if not _in(bought, start, end) or not _matches(t, term, d):
            continue
        every.append((t, d.status(t)))
    picked = [x for x in every if (not status or x[1] == status) and (not brand or (x[0].brand or "") == brand)]
    return picked, every, d


def inventory_counts(db: Session, **kw) -> dict:
    """The window's live counts: statuses within the brand, brands within the status."""
    status, brand = kw.pop("status", ""), kw.pop("brand", "")
    _, every, _ = select_inventory(db, **kw)
    in_brand = [x for x in every if not brand or (x[0].brand or "") == brand]
    in_status = [x for x in every if not status or x[1] == status]
    return {"stages": {s: sum(1 for x in in_brand if x[1] == s) for s in STATUSES}, "stage_total": len(in_brand),
            "brands": dict(Counter((x[0].brand or "—") for x in in_status).most_common()), "brand_total": len(in_status)}


def _tyre_inventory(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    o = opts or {}
    start, end, status, brand = o.get("start"), o.get("end"), o.get("stage") or "", o.get("rtype") or ""
    picked, _, d = select_inventory(db, start=start, end=end, search=search, status=status, brand=brand)

    def row(t, st):
        cur = d.current(t)
        km, exp = d.km(t), d.expected(t)
        return [t.tyre_number, clean(t.brand), clean(t.size), clean(t.tyre_type), clean(t.condition),
                {"v": st, "tone": STATUS_TONE[st]}, d.reg(cur.truck_id) if cur else "", clean(cur.position) if cur else "",
                float(t.cost or 0), d.retread_spend(t), t.retread_count or 0, km, exp, d.used(t),
                clean(t.maintenance_by), clean(t.invoice_number), _iso(t.invoice_date or t.purchase_date),
                "Yes" if t.proof_file_name else {"v": "No", "tone": "warn"}]

    cols = [("Tyre no.", "text"), ("Brand", "text"), ("Size", "text"), ("Type", "text"), ("Condition", "text", False), ("Status", "text"),
            ("Truck", "text"), ("Position", "text", False), ("Cost (₹)", "money"), ("Retreads (₹)", "money", False), ("Retreads", "num", False),
            ("Km run", "km"), ("Expected km", "km", False), ("Used (%)", "num"), ("Bought from", "text", False), ("Invoice", "text", False),
            ("Bought on", "date"), ("Proof", "text", False)]

    def tot(rows_):
        return ["TOTAL", f"{len(rows_)} tyres", "", "", "", "", "", "", sum(r[8] for r in rows_), sum(r[9] for r in rows_),
                sum(r[10] for r in rows_), sum(r[11] for r in rows_), None, None, "", "", None, ""]

    groups = {s: [x for x in picked if x[1] == s] for s in STATUSES}
    groups = {s: g for s, g in groups.items() if g}
    names = _sheet_names(list(groups))
    sheet_of = dict(zip(groups, names))
    items = []
    for s, g in groups.items():
        rows_ = [row(t, st) for t, st in sorted(g, key=lambda x: (x[0].brand or "", x[0].tyre_number))]
        items.append({"sheet": sheet_of[s], "title": s, "subtitle": f"{len(g)} tyres · by brand",
                      "boxes": [box("THESE TYRES", [("Tyres", len(g), "num"), ("Bought for (₹)", sum(r[8] for r in rows_), "money"),
                                                    ("Retreads (₹)", sum(r[9] for r in rows_), "money"),
                                                    ("Km run", sum(r[11] for r in rows_), "km"),
                                                    ("Past their expected range", sum(1 for r in rows_ if _pct(r[13]) > 100), "num",
                                                     "bad" if any(_pct(r[13]) > 100 for r in rows_) else None),
                                                    ("Km unknown", sum(1 for r in rows_ if _unknown(r[13])), "num")])],
                      "tables": [table(s.upper(), cols, rows_, total=tot(rows_))]})

    def by(key):
        g = defaultdict(lambda: [0, 0.0, 0.0])
        for t, _ in picked:
            x = g[key(t) or "—"]
            x[0] += 1
            x[1] += float(t.cost or 0)
            x[2] += d.km(t)
        return [[k, v[0], v[1], v[2]] for k, v in sorted(g.items(), key=lambda kv: -kv[1][0])]

    gcols = lambda first: [(first, "text"), ("Tyres", "num"), ("Bought for (₹)", "money"), ("Km run", "km")]  # noqa: E731
    spent_buy = sum(float(t.cost or 0) for t, _ in picked)
    spent_ret = sum(d.retread_spend(t) for t, _ in picked)
    no_proof = sum(1 for t, _ in picked if not t.proof_file_name)
    counts = Counter(st for _, st in picked)
    filt = [x for x in (status, brand) if x]
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": " · ".join([_label(start, end)] + filt)},
        "kpis": [{"label": "Tyres", "value": str(len(picked)), "note": f"{counts['Fitted']} fitted, {counts['In stock']} in stock"},
                 {"label": "Money spent", "value": _inr(spent_buy + spent_ret), "note": f"{_inr(spent_buy)} buying, {_inr(spent_ret)} retreading"},
                 {"label": "Waiting for retread", "value": str(counts["Waiting for retread"]), "tone": "warn" if counts["Waiting for retread"] else None},
                 {"label": "No proof of payment", "value": str(no_proof), "tone": "warn" if no_proof else None, "note": "tyres bought without one"}],
        "tables": [
            table("BY STATUS — click to open its sheet", [("Status", "link"), ("Tyres", "num"), ("Bought for (₹)", "money")],
                  [[{"v": s, "link": sheet_of[s]}, len(g), sum(float(t.cost or 0) for t, _ in g)] for s, g in groups.items()],
                  total=["TOTAL", len(picked), spent_buy]),
            table("BY BRAND", gcols("Brand"), by(lambda t: clean(t.brand))),
            table("BY SIZE", gcols("Size"), by(lambda t: clean(t.size))),
            table("BY TYPE", gcols("Type"), by(lambda t: clean(t.tyre_type))),
            table("BOUGHT FROM", gcols("Vendor / person"), by(lambda t: clean(t.maintenance_by))[:15]),
        ],
        "notes": [
            "Statuses follow the tyre pages: Fitted = on a truck now; In stock = not fitted, not flagged; Waiting for retread = in the "
            "Retread Queue; Discarded = flagged as discarded. Deleted tyres are in the Tyre Archive report.",
            "Km run adds up every fitting: removed − fitted odometer, or up to the truck's odometer now while still fitted. A fitting saved "
            "with odometer 0 (imported, or fitted before readings were kept) isn't counted, so km run is then a minimum; 'km unknown' = none is known. "
            "Used (%) = km run ÷ expected range (the tyre's own, else Tyre Range Configuration's for its type); over 80% amber, past 100% red.",
            "With a period, tyres are picked by their invoice date (else the purchase date).",
        ],
        "items": items,
    }


# ── Tyre Management ──────────────────────────────────────────────────────────

def _tyre_management(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    from routers.running_cost import _tyre_count
    o = opts or {}
    start, end = o.get("start"), o.get("end")
    d = _Data(db)
    term = (search or "").strip().lower()
    tyres = {t.id: t for t in _tyres(db)}
    trucks = [t for t in sorted(d.trucks.values(), key=lambda t: t.truck_id) if t.deleted_at is None
              and (not term or term in (t.registration_number or "").lower() or term in (t.truck_id or "").lower())]
    by_truck = defaultdict(list)                  # fitted now
    history = defaultdict(list)
    for tid, fs in d.fitments.items():
        for f in fs:
            if f.removed_odometer is None and tid in tyres:
                by_truck[f.truck_id].append((f, tyres[tid]))
            history[f.truck_id].append(f)
    names = _sheet_names([clean(t.registration_number) or t.truck_id for t in trucks])
    sheet_of = {t.id: n for t, n in zip(trucks, names)}

    items, fleet_rows, worn = [], [], []
    total_fitted = total_empty = 0
    for truck in trucks:
        fitted = sorted(by_truck.get(truck.id, []), key=lambda x: x[0].position or "")
        slots = _tyre_count(truck.tyre_layout or "")
        empty = max(0, slots - len(fitted)) if slots else 0
        total_fitted += len(fitted)
        total_empty += empty
        per_km, rows = 0.0, []
        for f, t in fitted:
            known = bool(f.fitted_odometer) and float(f.fitted_odometer) > 0
            run = max(0.0, float(truck.odometer or 0) - float(f.fitted_odometer)) if known else None
            km_all, exp = d.km(t), d.expected(t)
            used = d.used(t)
            if exp and float(t.cost or 0) > 0:
                per_km += float(t.cost) / exp
            if _pct(used) > 80:
                worn.append([{"v": clean(truck.registration_number) or truck.truck_id, "link": sheet_of[truck.id]}, clean(f.position), t.tyre_number,
                             clean(t.brand), km_all, exp, used])
            rows.append([clean(f.position), t.tyre_number, clean(t.brand), clean(t.tyre_type), _iso(f.fitted_date), f.fitted_odometer,
                         run, km_all, exp, used, float(t.cost or 0)])
        hist = []
        for f in sorted(history.get(truck.id, []), key=lambda f: f.fitted_date or date.min, reverse=True):
            t = tyres.get(f.tyre_id)
            for when, what, odo, by_, remark in ((f.fitted_date, "Fitted", f.fitted_odometer, f.fitted_by_name, f.fitted_remark),
                                                 (f.removed_date, "Removed", f.removed_odometer, f.removed_by_name, f.removal_remark)):
                if when and _in(when, start, end):
                    hist.append([_iso(when), {"v": what, "tone": "warn" if what == "Removed" else None}, clean(f.position),
                                 t.tyre_number if t else f"#{f.tyre_id}", clean(t.brand) if t else "", odo, clean(by_), clean(remark)])
        hist.sort(key=lambda r: r[0] or "", reverse=True)
        fleet_rows.append([{"v": clean(truck.registration_number) or truck.truck_id, "link": sheet_of[truck.id]}, truck.truck_id,
                           clean(truck.tyre_layout), len(fitted), {"v": empty, "tone": "warn"} if empty else 0,
                           sum(1 for r in rows if _pct(r[9]) > 80), round(per_km, 4) if per_km else None,
                           sum(r[10] for r in rows)])
        items.append({
            "sheet": sheet_of[truck.id], "title": clean(truck.registration_number) or truck.truck_id,
            "subtitle": f"{truck.truck_id} · layout {clean(truck.tyre_layout) or '—'} · odometer {float(truck.odometer or 0):,.0f} km",
            "boxes": [box("TYRES ON THIS TRUCK", [("Fitted", len(fitted), "num"), ("Positions on the layout", slots or None, "num"),
                                                   ("Empty positions", empty, "num", "warn" if empty else None),
                                                   ("Near or past their range", sum(1 for r in rows if _pct(r[9]) > 80), "num"),
                                                   ("Km unknown", sum(1 for r in rows if _unknown(r[9])), "num"),
                                                   ("Fitted tyres cost (₹)", sum(r[10] for r in rows), "money"),
                                                   ("Tyre cost per km (₹)", round(per_km, 4) if per_km else None, "num")])],
            "tables": [
                table("FITTED NOW", [("Position", "text"), ("Tyre no.", "text"), ("Brand", "text"), ("Type", "text"), ("Fitted on", "date"),
                                     ("At odometer", "km", False), ("Km on this truck", "km"), ("Km run in all", "km"), ("Expected km", "km", False),
                                     ("Used (%)", "num"), ("Cost (₹)", "money")], rows,
                      total=["TOTAL", f"{len(rows)} tyres", "", "", None, None, sum(r[6] or 0 for r in rows), sum(r[7] for r in rows), None, None,
                             sum(r[10] for r in rows)]),
                table("FITTED AND REMOVED" + (f" — {_label(start, end)}" if start or end else ""),
                      [("Date", "date"), ("Action", "text"), ("Position", "text"), ("Tyre no.", "text"), ("Brand", "text"),
                       ("Odometer", "km"), ("By", "text"), ("Remark", "text", False)], hist),
            ],
        })
    worn.sort(key=lambda r: -_pct(r[6]))
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": f"As of {today.strftime('%d-%m-%Y')}"
                   + (f" · history {_label(start, end)}" if start or end else "")},
        "kpis": [{"label": "Tyres fitted", "value": str(total_fitted), "note": f"on {sum(1 for t in trucks if by_truck.get(t.id))} trucks"},
                 {"label": "Empty positions", "value": str(total_empty), "tone": "warn" if total_empty else None,
                  "note": "the layout has more positions than tyres fitted"},
                 {"label": "Near or past their range", "value": str(len(worn)), "tone": "warn" if worn else None, "note": "over 80% used"},
                 {"label": "Trucks", "value": str(len(trucks))}],
        "tables": [
            table("EVERY TRUCK — click to open its tyres", [("Truck", "link"), ("Truck ID", "text"), ("Layout", "text"), ("Fitted", "num"),
                                                            ("Empty", "num"), ("Near or past range", "num"), ("Tyre cost per km (₹)", "num"),
                                                            ("Fitted tyres cost (₹)", "money")], fleet_rows,
                  total=["TOTAL", "", "", total_fitted, total_empty, len(worn), None, sum(r[7] for r in fleet_rows)]),
            table("NEAR OR PAST THEIR RANGE — most worn first", [("Truck", "link"), ("Position", "text"), ("Tyre no.", "text"), ("Brand", "text"),
                                                                 ("Km run", "km"), ("Expected km", "km"), ("Used (%)", "num")], worn),
        ],
        "notes": [
            "The tyres fitted on each truck now, as on the Tyre Management page. Km on this truck = the truck's odometer now − the "
            "odometer when fitted; km run in all adds the tyre's earlier fittings too.",
            "Used (%) = km run ÷ expected range; over 80% amber, past 100% red. Fittings saved with odometer 0 "
            "(imported, or fitted before readings were kept) aren't counted, so km run is then a minimum; 'km unknown' = none is known. Empty positions compare the tyres fitted with the "
            "number of tyres on the truck's layout.",
            "Tyre cost per km = each fitted tyre's cost ÷ its expected range, added up — the figure View Tyre Data and the "
            "Running Cost Calculator (Advanced) use. With a period, the history lists the fittings and removals in it.",
        ],
        "items": items,
    }


# ── Retread Queue ────────────────────────────────────────────────────────────

def _tyre_retread(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    o = opts or {}
    start, end = o.get("start"), o.get("end")
    d = _Data(db)
    term = (search or "").strip().lower()
    tyres = {t.id: t for t in _tyres(db)}
    waiting = []
    for t in sorted((t for t in tyres.values() if t.retread_flagged_at and not t.discarded_at), key=lambda t: t.retread_flagged_at):
        if not _matches(t, term, d):
            continue
        since = _day(t.retread_flagged_at)
        days = (today - since).days if since else None
        waiting.append([t.tyre_number, clean(t.brand), clean(t.size), clean(t.tyre_type), t.retread_count or 0, d.km(t), _iso(since),
                        clean(t.retread_flagged_by), {"v": days, "tone": "bad" if days and days > 30 else "warn" if days and days > 7 else None}])
    done, vendors = [], defaultdict(lambda: [0, 0.0])
    for tid, evs in d.events.items():
        t = tyres.get(tid)
        if t is None or not _matches(t, term, d):
            continue
        for e in evs:
            day = _day(e.created_at)
            if e.event != "Moved to Inventory" or not _in(day, start, end):
                continue
            cost = float(e.retread_cost or 0)
            who = clean(e.retread_done_by) or "—"
            vendors[who][0] += 1
            vendors[who][1] += cost
            done.append([_iso(day), t.tyre_number, clean(t.brand), e.retread_count, who, clean(e.invoice_number), cost, e.expected_range,
                         "Yes" if e.proof_file_name else {"v": "No", "tone": "warn"}, clean(e.actor_name)])
    done.sort(key=lambda r: r[0] or "", reverse=True)
    spent = sum(r[6] for r in done)
    names = _sheet_names(["Waiting", "Retreads done"])
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": f"Retreads done: {_label(start, end)}"},
        "kpis": [{"label": "Waiting", "value": str(len(waiting)), "tone": "warn" if waiting else None, "note": "tyres in the Retread Queue"},
                 {"label": "Waiting over 30 days", "value": str(sum(1 for r in waiting if (r[8]["v"] or 0) > 30)),
                  "tone": "bad" if any((r[8]["v"] or 0) > 30 for r in waiting) else None},
                 {"label": "Retreads done", "value": str(len(done)), "note": _inr(spent)},
                 {"label": "Average per retread", "value": _inr(spent / len(done)) if done else "—"}],
        "tables": [table("BY WHO RETREADED", [("Vendor / person", "text"), ("Retreads", "num"), ("Spent (₹)", "money"), ("Average (₹)", "money")],
                         [[k, v[0], v[1], v[1] / v[0] if v[0] else 0] for k, v in sorted(vendors.items(), key=lambda kv: -kv[1][1])],
                         total=["TOTAL", len(done), spent, None])],
        "notes": ["Waiting = tyres flagged for retreading and not back yet, oldest first; over 7 days amber, over 30 red.",
                  "Retreads done = tyres moved back to the inventory after retreading, dated by that move. With a period, only those in it."],
        "items": [
            {"sheet": names[0], "title": "Waiting", "subtitle": f"{len(waiting)} tyres · oldest flag first", "boxes": [],
             "tables": [table("WAITING FOR RETREAD", [("Tyre no.", "text"), ("Brand", "text"), ("Size", "text"), ("Type", "text"),
                                                      ("Retreads so far", "num"), ("Km run", "km"), ("Flagged on", "date"), ("Flagged by", "text"),
                                                      ("Days waiting", "num")], waiting)]},
            {"sheet": names[1], "title": "Retreads done", "subtitle": f"{len(done)} retreads · newest first", "boxes": [],
             "tables": [table("RETREADS DONE", [("Back on", "date"), ("Tyre no.", "text"), ("Brand", "text"), ("Retread #", "num"),
                                                ("Done by", "text"), ("Invoice", "text"), ("Cost (₹)", "money"), ("New expected km", "km"),
                                                ("Proof", "text", False), ("Saved by", "text", False)], done,
                              total=["TOTAL", f"{len(done)} retreads", "", None, "", "", spent, None, "", ""])]},
        ],
    }


# ── Discarded Tyres ──────────────────────────────────────────────────────────

def _tyre_discarded(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    o = opts or {}
    start, end = o.get("start"), o.get("end")
    d = _Data(db)
    term = (search or "").strip().lower()
    rows, reasons, brands = [], Counter(), defaultdict(lambda: [0, 0.0, 0.0])
    for t in sorted((t for t in _tyres(db) if t.discarded_at), key=lambda t: t.discarded_at, reverse=True):
        day = _day(t.discarded_at)
        if not _in(day, start, end) or not _matches(t, term, d):
            continue
        km, exp = d.km(t), d.expected(t)
        cost = float(t.cost or 0) + d.retread_spend(t)
        use = d.used(t)
        reasons[clean(t.discard_reason) or "—"] += 1
        b = brands[clean(t.brand) or "—"]
        b[0] += 1
        b[1] += km
        b[2] += exp or 0
        rows.append([t.tyre_number, clean(t.brand), clean(t.size), clean(t.tyre_type), t.retread_count or 0, _iso(day), clean(t.discarded_by),
                     clean(t.discard_reason), km, exp, use, cost])
    sheet = _sheet_names(["Discarded"])[0]
    gave = sum(r[8] for r in rows)
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": _label(start, end)},
        "kpis": [{"label": "Discarded", "value": str(len(rows)), "note": "tyres"},
                 {"label": "Km they gave", "value": f"{gave:,.0f} km", "note": f"{gave / len(rows):,.0f} km each on average" if rows else ""},
                 {"label": "Worn out early", "value": str(sum(1 for r in rows if 0 <= _pct(r[10], -1) < 80)),
                  "tone": "warn" if any(0 <= _pct(r[10], -1) < 80 for r in rows) else None, "note": "under 80% of their expected range"},
                 {"label": "Spent on them", "value": _inr(sum(r[11] for r in rows)), "note": "buying and retreading"}],
        "tables": [
            table("BY REASON", [("Reason", "text"), ("Tyres", "num")], [[k, v] for k, v in reasons.most_common()]),
            table("BY BRAND — km given against what they were bought for", [("Brand", "text"), ("Tyres", "num"), ("Km given", "km"),
                                                                             ("Expected km", "km"), ("Used (%)", "num")],
                  [[k, v[0], v[1], v[2], round(v[1] / v[2] * 100, 1) if v[2] else None] for k, v in sorted(brands.items(), key=lambda kv: -kv[1][0])]),
        ],
        "notes": ["Every tyre flagged as discarded, newest first, with the km it gave over all its fittings against its expected range "
                  "— under 80% means it wore out early.", "Spent = what it cost plus its retreads. With a period, by the day it was discarded."],
        "items": [{"sheet": sheet, "title": "Discarded tyres", "subtitle": f"{len(rows)} tyres · newest first", "boxes": [],
                   "tables": [table("DISCARDED TYRES", [("Tyre no.", "text"), ("Brand", "text"), ("Size", "text"), ("Type", "text"),
                                                         ("Retreads", "num"), ("Discarded on", "date"), ("By", "text"), ("Reason", "text"),
                                                         ("Km given", "km"), ("Expected km", "km", False), ("Used (%)", "num"), ("Spent (₹)", "money")],
                                    rows, total=["TOTAL", f"{len(rows)} tyres", "", "", None, None, "", "", gave, None, None,
                                                 sum(r[11] for r in rows)])]}],
    }


# ── Tyre Archive ─────────────────────────────────────────────────────────────

def _tyre_archive(db: Session, search: str, today: date, role: str = "", opts: dict | None = None) -> dict:
    o = opts or {}
    start, end = o.get("start"), o.get("end")
    term = (search or "").strip().lower()
    deleted = {t.id: t for t in _tyres(db, deleted=True)}
    latest = {}
    for r in db.query(models.DeletionApprovalRequest).filter(models.DeletionApprovalRequest.resource_type == "TyreInventory",
                                                               models.DeletionApprovalRequest.status == "Approved"):
        if r.resource_id in deleted and (r.resource_id not in latest or (r.approved_at or datetime.min) > (latest[r.resource_id].approved_at or datetime.min)):
            latest[r.resource_id] = r
    rows = []
    for tid, t in sorted(deleted.items(), key=lambda kv: kv[1].deleted_at or datetime.min, reverse=True):
        r = latest.get(tid)
        day = _day(t.deleted_at)
        if not _in(day, start, end):
            continue
        if term and not any(term in (v or "").lower() for v in (t.tyre_number, t.brand, r.requested_by_name if r else "", r.reason if r else "")):
            continue
        rows.append([t.tyre_number, clean(t.brand), clean(t.size), float(t.cost or 0), clean(r.requested_by_name) if r else "",
                     clean(r.reason) if r else "", clean(r.approved_by_name) if r else "", _iso(day)])
    numbers = dict(db.query(models.TyreInventory.id, models.TyreInventory.tyre_number).all())
    log = []
    for e in db.query(models.TyreInventoryEditEvent).order_by(models.TyreInventoryEditEvent.created_at.desc()):
        day = _day(e.created_at)
        no = numbers.get(e.tyre_id, f"#{e.tyre_id}")
        if not _in(day, start, end) or (term and term not in (no or "").lower() and term not in (e.actor_name or "").lower()):
            continue
        log.append([_iso(day), no, {"v": e.event.replace("Tyre ", ""), "tone": "bad" if e.event == "Tyre Deleted" else None},
                    clean(e.actor_name), clean(e.actor_role)])
    names = _sheet_names(["Deleted tyres", "Change log"])
    acts = Counter(r[2]["v"] for r in log)
    return {
        "period": {"start": _iso(start), "end": _iso(end), "label": _label(start, end)},
        "kpis": [{"label": "Deleted tyres", "value": str(len(rows)), "note": "still deleted"},
                 {"label": "Their cost", "value": _inr(sum(r[3] for r in rows))},
                 {"label": "Changes", "value": str(len(log)), "note": ", ".join(f"{v} {k.lower()}" for k, v in acts.most_common())}],
        "tables": [table("CHANGES BY WHO", [("By", "text"), ("Changes", "num")], [[k, v] for k, v in Counter(r[3] for r in log).most_common()])],
        "notes": ["Deleted tyres = tyres still deleted, with their latest approved deletion request (restored ones aren't listed).",
                  "The change log lists every tyre created, edited, deleted or restored. With a period, only those in it."],
        "items": [
            {"sheet": names[0], "title": "Deleted tyres", "subtitle": f"{len(rows)} tyres · newest first", "boxes": [],
             "tables": [table("DELETED TYRES", [("Tyre no.", "text"), ("Brand", "text"), ("Size", "text"), ("Cost (₹)", "money"),
                                                ("Asked by", "text"), ("Reason", "text"), ("Approved by", "text"), ("Deleted on", "date")], rows,
                              total=["TOTAL", f"{len(rows)} tyres", "", sum(r[3] for r in rows), "", "", "", None])]},
            {"sheet": names[1], "title": "Change log", "subtitle": f"{len(log)} changes · newest first", "boxes": [],
             "tables": [table("TYRE CHANGES", [("Date", "date"), ("Tyre no.", "text"), ("Change", "text"), ("By", "text"), ("Role", "text")], log)]},
        ],
    }


KINDS = {"tyre_inventory": (_tyre_inventory, "Tyre Inventory"), "tyre_management": (_tyre_management, "Tyre Management"),
         "tyre_retread": (_tyre_retread, "Retread Queue"), "tyre_discarded": (_tyre_discarded, "Discarded Tyres"),
         "tyre_archive": (_tyre_archive, "Tyre Archive")}
rr.KINDS.update({k: (fn, title, title) for k, (fn, title) in KINDS.items()})
rr.KIND_ROLES.update({k: ("Admin", "Maintenance") for k in KINDS})
rr.WITH_OPTS = tuple(dict.fromkeys(rr.WITH_OPTS + tuple(KINDS)))
