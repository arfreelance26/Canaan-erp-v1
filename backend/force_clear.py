import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

db_user = os.environ.get("DB_USER")
db_password = os.environ.get("DB_PASSWORD")
db_host = os.environ.get("DB_HOST")
db_name = os.environ.get("DB_NAME")

DATABASE_URL = f"mysql+pymysql://{db_user}:{db_password}@{db_host}/{db_name}"
engine = create_engine(DATABASE_URL)

def force_clear():
    with engine.begin() as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
        # Get all tables
        result = conn.execute(text("SHOW TABLES"))
        tables = [row[0] for row in result]
        
        for table in tables:
            print(f"Dropping {table}...")
            conn.execute(text(f"DROP TABLE IF EXISTS `{table}`"))
            
        conn.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
    print("All tables dropped forcefully!")

if __name__ == "__main__":
    force_clear()
