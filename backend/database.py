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

if _DB_USER and _DB_PASSWORD and _DB_HOST and _DB_NAME:
    _encoded = urllib.parse.quote_plus(_DB_PASSWORD)
    _built_url = f"mysql+pymysql://{_DB_USER}:{_encoded}@{_DB_HOST}/{_DB_NAME}"
else:
    _built_url = "mysql+pymysql://root:NAVAROSHAN@localhost/canaan"

DATABASE_URL = os.getenv("DATABASE_URL", _built_url)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
