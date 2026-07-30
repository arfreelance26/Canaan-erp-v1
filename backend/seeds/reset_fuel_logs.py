# --- path bootstrap: app modules live in backend/, data in ../data ---
import os as _os, sys as _sys
_BACKEND = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _BACKEND not in _sys.path:
    _sys.path.insert(0, _BACKEND)
_os.chdir(_BACKEND)
# --------------------------------------------------------------------

#!/usr/bin/env python3
from database import engine
from sqlalchemy import text

def reset_fuel_logs():
    print("Truncating fuel_logs table...")
    with engine.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
        conn.execute(text("TRUNCATE TABLE fuel_logs;"))
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
    print("fuel_logs table reset successfully!")

if __name__ == "__main__":
    reset_fuel_logs()
