"""
Migrate invoice_no from old format to new format.

Old:  TM/26-27/001      → CGI26-27/TM0001
Old:  CGI/26-27/001     → CGI26-27/T0001  (Bill of Supply or Tax Invoice)
"""

import re
from database import engine
from sqlalchemy import text


def convert(invoice_no: str, invoice_type: str) -> str | None:
    """Return the converted invoice_no, or None if it already matches the new format."""
    if not invoice_no:
        return None

    # Already in new format — skip
    if re.match(r"^CGI\d{2}-\d{2}/(TM|T)\d{4}$", invoice_no):
        return None

    # Old TM format: TM/YY-YY/NNN
    m = re.match(r"^TM/(\d{2}-\d{2})/(\d+)$", invoice_no)
    if m:
        fy, seq = m.group(1), m.group(2)
        return f"CGI{fy}/TM{seq.zfill(4)}"

    # Old CGI format: CGI/YY-YY/NNN
    m = re.match(r"^CGI/(\d{2}-\d{2})/(\d+)$", invoice_no)
    if m:
        fy, seq = m.group(1), m.group(2)
        return f"CGI{fy}/T{seq.zfill(4)}"

    # Unknown format — leave unchanged
    return None


with engine.connect() as conn:
    rows = conn.execute(text("SELECT id, invoice_no, invoice_type FROM trip_invoices")).fetchall()

    if not rows:
        print("No invoices found — nothing to migrate.")
    else:
        updated = 0
        skipped = 0
        for row in rows:
            rid, old_no, itype = row
            new_no = convert(old_no or "", itype or "")
            if new_no is None:
                skipped += 1
                print(f"  SKIP  id={rid}  '{old_no}'  (already correct or unknown format)")
            else:
                conn.execute(
                    text("UPDATE trip_invoices SET invoice_no = :new WHERE id = :id"),
                    {"new": new_no, "id": rid}
                )
                print(f"  UPDATE id={rid}  '{old_no}'  →  '{new_no}'")
                updated += 1

        conn.commit()
        print(f"\nDone — {updated} updated, {skipped} skipped.")
