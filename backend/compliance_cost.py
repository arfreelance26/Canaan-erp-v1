"""When a compliance document's cost starts and ends — one rule for every
screen that spreads a document's cost over time (P&L, Running Cost, the
Cost Breakdown window).

Each period a document was held is a TruckComplianceRecord row (its first
entry, then one per renewal) with its cost and its expiry ("valid until" —
the Validity Date entered on the form). Its START is:

  1. the "Valid from" date typed in when it was renewed, if there is one;
  2. otherwise the day it was entered in the app (the ComplianceUpdateHistory
     row written when it was added or renewed).

A period with neither is skipped, never guessed — rows created by the
one-off migration have no real start date, and guessing one would invent a
cost. (The P&L used to guess: it read Road Tax / permit / PUC validity dates
as start dates and added a year, charging the cost to the year after the
document had already run out.)
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

import models

# doc key (TruckComplianceRecord.doc_type) → ComplianceUpdateHistory.document_type
HISTORY_LABEL = {
    "rc": "RC",
    "fc": "FC (Fitness Certificate)",
    "road_tax": "Road Tax",
    "insurance": "Insurance",
    "national_permit": "National Permit",
    "local_permit": "Local Permit",
    "pollution_cert": "Pollution Certificate",
}


@dataclass
class Period:
    doc: str                    # doc key, e.g. "road_tax"
    expense: float
    start: date | None
    end: date | None            # the document's expiry
    skipped: str | None = None  # why it can't be costed, else None

    @property
    def days(self) -> int:
        return (self.end - self.start).days if self.start and self.end else 0


def _as_date(value) -> date | None:
    return value.date() if isinstance(value, datetime) else value


def _entered_dates(db: Session, truck_ids: set[int] | None) -> dict[tuple[int, str], list[date]]:
    """(truck id, history label) → the days each version was entered in the app."""
    q = db.query(models.ComplianceUpdateHistory.truck_id, models.ComplianceUpdateHistory.document_type,
                 models.ComplianceUpdateHistory.updated_at).filter(models.ComplianceUpdateHistory.action.is_(None))
    if truck_ids is not None:
        q = q.filter(models.ComplianceUpdateHistory.truck_id.in_(truck_ids))
    out: dict[tuple[int, str], list[date]] = {}
    for tid, label, at in q:
        if at is not None:
            out.setdefault((tid, label), []).append(_as_date(at))
    return out


def document_periods(db: Session, truck_ids: set[int] | None = None) -> dict[int, list[Period]]:
    """Every period every document was held, per truck, oldest first."""
    if truck_ids is not None and not truck_ids:
        return {}
    entered = _entered_dates(db, truck_ids)
    q = db.query(models.TruckComplianceRecord.truck_id, models.TruckComplianceRecord.doc_type,
                 models.TruckComplianceRecord.valid_from, models.TruckComplianceRecord.valid_until,
                 models.TruckComplianceRecord.expense, models.TruckComplianceRecord.created_at)
    if truck_ids is not None:
        q = q.filter(models.TruckComplianceRecord.truck_id.in_(truck_ids))
    out: dict[int, list[Period]] = {}
    for tid, doc, valid_from, valid_until, expense, created_at in q.order_by(models.TruckComplianceRecord.id):
        if doc not in HISTORY_LABEL:
            continue
        p = Period(doc=doc, expense=float(expense or 0), start=None, end=valid_until)
        if valid_from:
            p.start = valid_from
        else:
            # Entered in the app: a history row on (about) the day this version
            # was recorded. ±1 day absorbs the UTC/IST date boundary.
            made = _as_date(created_at)
            days = entered.get((tid, HISTORY_LABEL[doc]), [])
            if made and any(abs((d - made).days) <= 1 for d in days):
                p.start = made
        if p.expense <= 0:
            p.skipped = "no cost entered"
        elif not p.end:
            p.skipped = "no expiry date"
        elif not p.start:
            p.skipped = "no start date (no 'valid from' and not entered in the app)"
        elif p.days <= 0:
            p.skipped = "expiry is not after the start date"
        out.setdefault(tid, []).append(p)
    return out


def share_in_range(p: Period, start: date, end: date) -> float:
    """The part of a period's cost that falls inside [start, end] (both inclusive)."""
    if p.skipped:
        return 0.0
    ov_start = max(start, p.start)
    ov_end = min(end, p.end - timedelta(days=1)) if p.end > p.start else p.start
    if ov_start > ov_end:
        return 0.0
    return round(p.expense * ((ov_end - ov_start).days + 1) / p.days, 2)
