"""
READ-ONLY production database audit.
Connects directly to production (credentials from .env), runs zero writes.
Checks: row counts, FK integrity, NOT NULL violations, duplicate PKs.
"""
import os, sys
from datetime import datetime
from decimal import Decimal
import urllib.parse
from dotenv import load_dotenv

load_dotenv()

# ── Pull production creds from env (must be uncommented in .env) ─────────────
DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST     = os.getenv("DB_HOST")
DB_NAME     = os.getenv("DB_NAME")
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    url = DATABASE_URL
elif DB_USER and DB_PASSWORD and DB_HOST and DB_NAME:
    encoded = urllib.parse.quote_plus(DB_PASSWORD)
    url = f"mysql+pymysql://{DB_USER}:{encoded}@{DB_HOST}/{DB_NAME}"
else:
    print("ERROR: No DB credentials found in .env. Uncomment the production block first.")
    sys.exit(1)

from sqlalchemy import create_engine, text, inspect
engine = create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 15})

PASS = "✅"
WARN = "⚠️ "
FAIL = "❌"

issues = []

def log(symbol, msg):
    print(f"  {symbol}  {msg}")
    if symbol == FAIL:
        issues.append(msg)

def run(label, sql, params=None):
    with engine.connect() as conn:
        result = conn.execute(text(sql), params or {})
        return result.fetchall()

# ── 1. Connection ─────────────────────────────────────────────────────────────
print("\n" + "="*64)
print("  CANAAN ERP — PRODUCTION DATABASE AUDIT")
print(f"  Host : {DB_HOST or 'from DATABASE_URL'}")
print(f"  DB   : {DB_NAME or 'from DATABASE_URL'}")
print(f"  Time : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("="*64)

try:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print(f"\n{PASS}  Connected to production database successfully.\n")
except Exception as e:
    print(f"\n{FAIL}  Cannot connect: {e}")
    sys.exit(1)

# ── 2. List all tables & row counts ──────────────────────────────────────────
print("─"*64)
print("  TABLE ROW COUNTS")
print("─"*64)

tables = run("SHOW TABLES")
table_names = [t[0] for t in tables]
total_rows = 0
table_counts = {}

for tbl in table_names:
    count = run(f"SELECT COUNT(*) FROM `{tbl}`")[0][0]
    table_counts[tbl] = count
    total_rows += count
    symbol = PASS if count > 0 else WARN
    log(symbol, f"{tbl:<45} {count:>8,} rows")

print(f"\n  Total tables : {len(table_names)}")
print(f"  Total rows   : {total_rows:,}\n")

# ── 3. Key business table minimums ───────────────────────────────────────────
print("─"*64)
print("  KEY TABLE SANITY (must have data)")
print("─"*64)

MUST_HAVE = {
    "customers":     100,
    "trips":         10,
    "trucks":        1,
    "drivers":       1,
    "trip_invoices": 0,   # 0 = just check it exists, no minimum
}

for tbl, minimum in MUST_HAVE.items():
    if tbl not in table_counts:
        log(FAIL, f"`{tbl}` table does not exist in production schema")
        continue
    count = table_counts[tbl]
    if count < minimum:
        log(FAIL, f"`{tbl}` has only {count:,} rows — expected at least {minimum:,}")
    else:
        log(PASS, f"`{tbl}` has {count:,} rows")

# ── 4. FK integrity checks ───────────────────────────────────────────────────
print()
print("─"*64)
print("  FOREIGN KEY INTEGRITY")
print("─"*64)

FK_CHECKS = [
    # (description, orphan query)
    ("trips → trucks",
     "SELECT COUNT(*) FROM trips t LEFT JOIN trucks tr ON t.truck_id = tr.truck_id WHERE t.truck_id IS NOT NULL AND tr.truck_id IS NULL"),
    ("trips → drivers (primary)",
     "SELECT COUNT(*) FROM trips t LEFT JOIN drivers d ON t.driver_id = d.id WHERE t.driver_id IS NOT NULL AND d.id IS NULL"),
    ("trips → customers",
     "SELECT COUNT(*) FROM trips t LEFT JOIN customers c ON t.customer_id = c.id WHERE t.customer_id IS NOT NULL AND c.id IS NULL"),
    ("trip_sheets → trips",
     "SELECT COUNT(*) FROM trip_sheets ts LEFT JOIN trips t ON ts.trip_id = t.id WHERE t.id IS NULL"),
    ("trip_invoices → trips",
     "SELECT COUNT(*) FROM trip_invoices ti LEFT JOIN trips t ON ti.trip_id = t.id WHERE t.id IS NULL"),
    ("trip_closures → trips",
     "SELECT COUNT(*) FROM trip_closures tc LEFT JOIN trips t ON tc.trip_id = t.id WHERE t.id IS NULL"),
    ("fuel_logs → trucks",
     "SELECT COUNT(*) FROM fuel_logs fl LEFT JOIN trucks tr ON fl.truck_id = tr.truck_id WHERE tr.truck_id IS NULL"),
    ("maintenance_records → trucks",
     "SELECT COUNT(*) FROM maintenance_records mr LEFT JOIN trucks tr ON mr.truck_id = tr.truck_id WHERE tr.truck_id IS NULL"),
    ("driver_attendance → drivers",
     "SELECT COUNT(*) FROM driver_attendance da LEFT JOIN drivers d ON da.driver_id = d.id WHERE d.id IS NULL"),
    ("tyre_fitment_records → tyres",
     "SELECT COUNT(*) FROM tyre_fitment_records tfr LEFT JOIN tyre_inventory ti ON tfr.tyre_id = ti.id WHERE ti.id IS NULL"),
    ("customer_pricing → customers",
     "SELECT COUNT(*) FROM customer_pricing cp LEFT JOIN customers c ON cp.customer_id = c.id WHERE c.id IS NULL"),
    ("edit_approval_requests (no orphan check, standalone)",
     None),
]

for desc, query in FK_CHECKS:
    if query is None:
        continue
    try:
        orphans = run(query)[0][0]
        if orphans > 0:
            log(FAIL, f"{desc} — {orphans:,} orphaned record(s)")
        else:
            log(PASS, f"{desc}")
    except Exception as e:
        log(WARN, f"{desc} — could not check: {e}")

# ── 5. NOT NULL / critical field checks ──────────────────────────────────────
print()
print("─"*64)
print("  CRITICAL NULL FIELD CHECKS")
print("─"*64)

NULL_CHECKS = [
    ("customers missing name",           "SELECT COUNT(*) FROM customers WHERE name IS NULL OR name = ''"),
    ("trips missing trip_number",        "SELECT COUNT(*) FROM trips WHERE trip_number IS NULL OR trip_number = ''"),
    ("trips missing truck_id",           "SELECT COUNT(*) FROM trips WHERE truck_id IS NULL OR truck_id = ''"),
    ("trucks missing registration",      "SELECT COUNT(*) FROM trucks WHERE registration_number IS NULL OR registration_number = ''"),
    ("drivers missing name",             "SELECT COUNT(*) FROM drivers WHERE name IS NULL OR name = ''"),
    ("trip_invoices missing invoice_no", "SELECT COUNT(*) FROM trip_invoices WHERE invoice_number IS NULL OR invoice_number = ''"),
]

for desc, query in NULL_CHECKS:
    try:
        bad = run(query)[0][0]
        if bad > 0:
            log(FAIL, f"{desc} — {bad:,} record(s) affected")
        else:
            log(PASS, desc)
    except Exception as e:
        log(WARN, f"{desc} — could not check ({e})")

# ── 6. Duplicate detection ───────────────────────────────────────────────────
print()
print("─"*64)
print("  DUPLICATE KEY DETECTION")
print("─"*64)

DUP_CHECKS = [
    ("Duplicate customer names",
     "SELECT name, COUNT(*) c FROM customers GROUP BY name HAVING c > 1 LIMIT 5"),
    ("Duplicate trip numbers",
     "SELECT trip_number, COUNT(*) c FROM trips GROUP BY trip_number HAVING c > 1 LIMIT 5"),
    ("Duplicate truck IDs",
     "SELECT truck_id, COUNT(*) c FROM trucks GROUP BY truck_id HAVING c > 1 LIMIT 5"),
    ("Duplicate invoice numbers",
     "SELECT invoice_number, COUNT(*) c FROM trip_invoices GROUP BY invoice_number HAVING c > 1 LIMIT 5"),
]

for desc, query in DUP_CHECKS:
    try:
        dups = run(query)
        if dups:
            log(FAIL, f"{desc} — found: {[(r[0], r[1]) for r in dups]}")
        else:
            log(PASS, desc)
    except Exception as e:
        log(WARN, f"{desc} — could not check ({e})")

# ── 7. Trip status distribution (sanity) ─────────────────────────────────────
print()
print("─"*64)
print("  TRIP STATUS DISTRIBUTION")
print("─"*64)
try:
    statuses = run("SELECT status, COUNT(*) c FROM trips GROUP BY status ORDER BY c DESC")
    for status, count in statuses:
        log(PASS, f"status={status!r:<30} {count:>6,}")
except Exception as e:
    log(WARN, f"Could not query trip statuses: {e}")

# ── 8. Invoice type distribution ─────────────────────────────────────────────
print()
print("─"*64)
print("  INVOICE TYPE DISTRIBUTION")
print("─"*64)
try:
    inv_types = run("SELECT invoice_type, COUNT(*) c FROM trip_invoices GROUP BY invoice_type ORDER BY c DESC")
    for itype, count in inv_types:
        log(PASS, f"type={itype!r:<35} {count:>6,}")
    if not inv_types:
        log(WARN, "No invoices found — is invoicing used yet?")
except Exception as e:
    log(WARN, f"Could not query invoices: {e}")

# ── 9. Schema completeness (compare expected tables vs actual) ────────────────
print()
print("─"*64)
print("  SCHEMA COMPLETENESS")
print("─"*64)

EXPECTED_TABLES = {
    "branches", "trucks", "drivers", "staff", "customers",
    "customer_origins", "customer_destinations", "customer_pricing",
    "final_customer_pricing", "vendors", "driver_assignments",
    "trips", "trip_closures", "trip_sheets", "trip_invoices",
    "driver_attendance", "driver_attendance_remarks", "staff_attendance",
    "leave_requests", "maintenance_records", "fuel_logs",
    "tyre_inventory", "tyre_fitment_records", "sac_codes", "repair_types",
    "emi_records", "recurring_payments", "edit_approval_requests",
    "compensation_transactions", "notifications",
}

actual = set(table_names)
missing = EXPECTED_TABLES - actual
extra   = actual - EXPECTED_TABLES

for tbl in sorted(missing):
    log(FAIL, f"Table `{tbl}` is MISSING from production schema")
for tbl in sorted(extra):
    log(WARN, f"Table `{tbl}` exists in production but not in expected schema (may be fine)")
if not missing and not extra:
    log(PASS, "All expected tables present, no unexpected tables")

# ── Summary ───────────────────────────────────────────────────────────────────
print()
print("="*64)
print("  AUDIT SUMMARY")
print("="*64)
if issues:
    print(f"\n  {FAIL}  {len(issues)} issue(s) found:\n")
    for i, issue in enumerate(issues, 1):
        print(f"    {i}. {issue}")
    print()
else:
    print(f"\n  {PASS}  All checks passed — no data integrity issues detected.")
    print(f"        {total_rows:,} total rows across {len(table_names)} tables.\n")

print("  This script is READ-ONLY. Zero writes were made to the database.")
print("="*64 + "\n")
