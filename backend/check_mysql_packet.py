from database import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    result = db.execute(text("SHOW VARIABLES LIKE 'max_allowed_packet';")).fetchall()
    print(result)
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
