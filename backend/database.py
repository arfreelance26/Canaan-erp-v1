import os
import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

_DB_USER     = os.getenv("DB_USER")
_DB_PASSWORD = os.getenv("DB_PASSWORD")
_DB_HOST     = os.getenv("DB_HOST")
_DB_NAME     = os.getenv("DB_NAME")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if not (_DB_USER and _DB_PASSWORD and _DB_HOST and _DB_NAME):
        raise RuntimeError(
            "Database is not configured. Set DATABASE_URL, or all of "
            "DB_USER/DB_PASSWORD/DB_HOST/DB_NAME, in the environment."
        )
    _encoded = urllib.parse.quote_plus(_DB_PASSWORD)
    DATABASE_URL = f"mysql+pymysql://{_DB_USER}:{_encoded}@{_DB_HOST}/{_DB_NAME}"

# Pool sizing: base 20 persistent connections + up to 40 overflow = 60 max.
# pool_pre_ping revives stale connections; pool_recycle avoids MySQL's 8h idle
# cutoff; pool_timeout is how long a request waits for a free connection before
# erroring. Keep the total (60) comfortably under MySQL's max_connections (151).
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=20,
    max_overflow=40,
    pool_timeout=30,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
