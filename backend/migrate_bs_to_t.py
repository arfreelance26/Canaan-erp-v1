"""
One-off migration: renumber existing "Bill of Supply" invoices from the BS####
series into the unified T#### series.

Rule (per financial year):
  - Keep the same numeric suffix if that CGI{fy}/T#### is not already taken
    (BS0001 -> T0001 when T0001 is free).
  - Otherwise assign the next free T number in that FY (max existing + 1).

Safety:
  - Only rows whose invoice_no matches CGI{fy}/BS#### are touched.
  - No other invoice is modified; no row is deleted.
  - Idempotent: after a successful run there are no BS numbers left, so a second
    run is a no-op.
  - Runs inside a single transaction; rolls back on any error.

Usage:
    python migrate_bs_to_t.py --dry-run    # show planned changes, write nothing
    python migrate_bs_to_t.py --apply      # perform the renumbering
"""
import re
import sys

import database
import models
from sqlalchemy.orm import Session

BS_RE = re.compile(r"^CGI(\d{2}-\d{2})/BS(\d+)$")
T_RE = re.compile(r"^CGI(\d{2}-\d{2})/T(\d+)$")


def suffix_width(no: str) -> int:
    m = re.search(r"(\d+)$", no or "")
    return len(m.group(1)) if m else 4


def run(apply: bool) -> None:
    db = Session(bind=database.engine)
    try:
        all_invoices = db.query(models.TripInvoice).all()

        # taken[fy] = set of T-suffix integers already in use for that FY
        taken: dict[str, set[int]] = {}
        for inv in all_invoices:
            m = T_RE.match(inv.invoice_no or "")
            if m:
                taken.setdefault(m.group(1), set()).add(int(m.group(2)))

        # Collect the Bill of Supply rows to convert, ordered by FY then suffix
        # so lower BS numbers get first pick of their preferred T suffix.
        to_convert = []
        for inv in all_invoices:
            m = BS_RE.match(inv.invoice_no or "")
            if inv.invoice_type == "Bill of Supply" and m:
                to_convert.append((m.group(1), int(m.group(2)), inv))
        to_convert.sort(key=lambda x: (x[0], x[1]))

        if not to_convert:
            print("No Bill of Supply invoices with a BS#### number found. Nothing to do.")
            return

        planned = []
        for fy, seq, inv in to_convert:
            used = taken.setdefault(fy, set())
            new_seq = seq
            if new_seq in used:
                new_seq = (max(used) + 1) if used else 1
            used.add(new_seq)
            width = suffix_width(inv.invoice_no)
            new_no = f"CGI{fy}/T{str(new_seq).zfill(width)}"
            planned.append((inv, inv.invoice_no, new_no))

        print(f"{'APPLYING' if apply else 'DRY RUN'} — {len(planned)} invoice(s):")
        for inv, old, new in planned:
            print(f"  trip_id={inv.trip_id}  {old}  ->  {new}")

        if not apply:
            print("\nDry run only. Re-run with --apply to write these changes.")
            return

        for inv, _old, new in planned:
            inv.invoice_no = new
        db.commit()
        print("\nDone. Committed.")
    except Exception as e:  # noqa: BLE001
        db.rollback()
        print(f"ERROR — rolled back, no changes written: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    if "--apply" in sys.argv:
        run(apply=True)
    elif "--dry-run" in sys.argv:
        run(apply=False)
    else:
        print("Specify --dry-run or --apply")
        sys.exit(1)
