# Database Seed & Data Scripts

One-off utilities for populating, resetting, and importing data into the Canaan ERP
database. They are **not** part of the running API — run them manually as needed.

Each script self-bootstraps: it adds `backend/` to the Python path and switches the
working directory to `backend/`, so imports (`from database import ...`) and the
`../data/*.xlsx` source files resolve correctly **regardless of where you invoke it from**.

## Running

From the `backend/` directory:

```bash
python seeds/seed_customers.py
python seeds/reset_and_seed.py     # guided full wipe + reseed (asks for confirmation)
```

## Contents

| Script | Purpose |
|---|---|
| `reset_and_seed.py` | Orchestrates a full clean wipe + reseed |
| `seed.py` | Master seed routine |
| `seed_customers.py` / `seed_drivers.py` / `seed_fleet.py` / `seed_emi.py` | Seed from `../data/*.xlsx` |
| `seed_staff.py` / `seed_trips.py` | Seed staff and sample trips |
| `seed_finance_manager.py` / `seed_fleet_manager.py` / `seed_tyre_manager.py` | Create role accounts |
| `import_tyres.py` / `import_tyre_fitments.py` | Import tyre data from Excel |
| `reset_database.py` / `clear_database.py` / `force_clear.py` | Drop / clear tables |
| `reset_staff.py` / `reset_fuel_logs.py` / `clear_staff_only.py` | Targeted resets |

> Source spreadsheets live in the repo-root `data/` folder.
