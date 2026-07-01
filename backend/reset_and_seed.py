import sys
import subprocess

def run_script(script_name):
    print(f"\n[{script_name}] Running...")
    try:
        result = subprocess.run([sys.executable, script_name], check=True, text=True, capture_output=True)
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
    print("\nStarting in 3 seconds...")
    
    import time
    time.sleep(3)
    
    scripts = [
        "clear_database.py",
        "seed_staff.py",
        "seed_customers.py",
        "seed_drivers.py",
        "seed_fleet.py",
        "seed_emi.py"
    ]
    
    for script in scripts:
        run_script(script)
        
    print("\n" + "="*60)
    print("✅ DATABASE RESET & SEED COMPLETELY SUCCESSFUL!")
    print("="*60)

if __name__ == "__main__":
    main()
