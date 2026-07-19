from sqlalchemy import create_engine, text
from urllib.parse import quote_plus
import pandas as pd

DB_USER = "erp_admin"
DB_PASSWORD = "6#xS,Qk1}T)*]QJE"
DB_HOST = "sg2plzcpnl509482.prod.sin2.secureserver.net"
DB_NAME = "canaan_erp_v1"

encoded_password = quote_plus(DB_PASSWORD)

DATABASE_URL = (
    f"mysql+pymysql://{DB_USER}:{encoded_password}@{DB_HOST}:3306/{DB_NAME}"
)

try:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True
    )

    with engine.connect() as conn:
        result = conn.execute(text("SELECT DATABASE(), VERSION()"))
        db_name, version = result.fetchone()

        print("✅ Connected successfully!")
        print("Database:", db_name)
        print("MariaDB Version:", version)

        # # Get all table names
        # tables = conn.execute(text("SHOW TABLES")).fetchall()

        # print("\n============================")
        # print("DATABASE TABLES")
        # print("============================")

        # for (table_name,) in tables:
        #     print(f"\n📋 Table: {table_name}")

        #     # Read first 10 rows into a DataFrame
        #     df = pd.read_sql(
        #         text(f"SELECT * FROM {table_name} LIMIT 10"),
        #         conn
        #     )

        #     if df.empty:
        #         print("(Empty table)")
        #     else:
        #         print(df.to_string(index=False))

except Exception as e:
    print("❌ Connection failed:")
    print(e)