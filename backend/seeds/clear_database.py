# --- path bootstrap: app modules live in backend/, data in ../data ---
import os as _os, sys as _sys
_BACKEND = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
if _BACKEND not in _sys.path:
    _sys.path.insert(0, _BACKEND)
_os.chdir(_BACKEND)
# --------------------------------------------------------------------

#!/usr/bin/env python3
from database import engine, Base
import models

from sqlalchemy import text

def clear_database(skip_confirm: bool = False):
    if not skip_confirm:
        print("WARNING: This will PERMANENTLY DELETE every table and all data in the database.")
        answer = input('Type exactly "DELETE ALL DATA" to continue: ').strip()
        if answer != "DELETE ALL DATA":
            print("Aborted. Nothing was changed.")
            return False
    print("Dropping all tables forcefully...")
    with engine.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
        result = conn.execute(text("SHOW TABLES"))
        tables = [row[0] for row in result]
        for table in tables:
            print(f"Dropping {table}...")
            conn.execute(text(f"DROP TABLE IF EXISTS `{table}`"))
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
    
    print("Recreating all tables...")
    Base.metadata.create_all(bind=engine)
    print("Database cleared and schema recreated successfully!")
    return True

if __name__ == "__main__":
    import sys
    clear_database(skip_confirm="--yes" in sys.argv)
