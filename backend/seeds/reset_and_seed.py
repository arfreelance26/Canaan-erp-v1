# --- path bootstrap: app modules live in backend/, data in ../data ---
import os as _os, sys as _sys
_BACKEND = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _BACKEND not in _sys.path:
    _sys.path.insert(0, _BACKEND)
_os.chdir(_BACKEND)
# --------------------------------------------------------------------

import sys
import os
import subprocess

# Child scripts live alongside this one in backend/seeds/
_SEEDS_DIR = os.path.dirname(os.path.abspath(__file__))

def run_script(script_name, extra_args=None):
    print(f"\n[{script_name}] Running...")
    try:
        cmd = [sys.executable, os.path.join(_SEEDS_DIR, script_name)] + (extra_args or [])
        result = subprocess.run(cmd, check=True, text=True, capture_output=True)
        print(result.stdout)
        print(f"[{script_name}] SUCCESS")
    except subprocess.CalledProcessError as e:
        print(f"[{script_name}] FAILED!")
        print(e.stdout)
        print(e.stderr)
        sys.exit(1)

def main():
    print("="*60)
    print("      CANAAN ERP - SAFE DATABASE RESET & SEED")
    print("="*60)
    print("\nThis script will:")
    print(" 1. Wipe the entire database schema cleanly.")
    print(" 2. Seed basic Admin and Staff accounts.")
    print(" 3. Seed Customers from Excel.")
    print(" 4. Seed Drivers from Excel.")
    print(" 5. Seed Fleet from Excel.")
    print(" 6. Seed EMI from Excel.")
    print("\nWARNING: This PERMANENTLY DELETES ALL existing data (trips, invoices, everything).")
    answer = input('Type exactly "DELETE ALL DATA" to continue: ').strip()
    if answer != "DELETE ALL DATA":
        print("Aborted. Nothing was changed.")
        sys.exit(0)
    
    scripts = [
        "clear_database.py",
        "seed_staff.py",
        "seed_customers.py",
        "seed_drivers.py",
        "seed_fleet.py",
        "seed_emi.py"
    ]
    
    for script in scripts:
        run_script(script, ["--yes"] if script == "clear_database.py" else None)
        
    print("\n" + "="*60)
    print("✅ DATABASE RESET & SEED COMPLETELY SUCCESSFUL!")
    print("="*60)

if __name__ == "__main__":
    main()
