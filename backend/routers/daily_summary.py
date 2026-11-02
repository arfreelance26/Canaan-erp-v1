"""Admin morning summary (daily_summary.py): yesterday's recap, saved each
morning, and the same recap rebuilt live for Refresh."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import daily_summary
from database import get_db
from security import require_roles

router = APIRouter(prefix="/daily-summary", tags=["Daily Summary"], dependencies=[Depends(require_roles())])


@router.get("")
def morning_summary(db: Session = Depends(get_db)):
    """The saved morning summary (null before the first one is due)."""
    return {"summary": daily_summary.latest(db)}


@router.get("/live")
def live_summary(db: Session = Depends(get_db)):
    """The same day rebuilt from the data as it stands now."""
    return {"summary": daily_summary.refreshed(db)}
