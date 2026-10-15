"""Notes — a private notepad per staff member (Topbar's Notes button, left of
the Calculator). Strictly owner-only: every route scopes to the caller, and
a note belonging to anyone else answers 404 (not 403), so even Admin can't
read or detect someone else's notes. Notes are kept until their owner
deletes them.

Abuse limits (an insider trying to exhaust server storage or memory):
- 20 notes per person, each at most 50,000 characters / 100 KB stored.
- A per-person daily write allowance (DAILY_WRITE_LIMIT bytes, tracked in
  note_write_usage). This is the important one: MySQL's binary log is on,
  so every save rewrites the whole note into it, and the table size alone
  says nothing about how much disk a save loop consumes.
- A per-person write rate limit (WRITES_PER_MINUTE), well above what
  autosave produces while someone is actually typing.
- Request bodies over MAX_REQUEST_BYTES are refused before being read (see
  the notes_request_size middleware in main.py).
- The list returns summaries only; a note's body is fetched on open.
Admin can see each person's counts and sizes (never content) via
GET /notes/admin/usage, and the Activity Log flags anyone who hits a limit.
"""
import threading
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.orm import Session

import activity_tracker
import models
import schemas
from database import SessionLocal, get_db
from security import TokenUser, get_current_user, require_roles

router = APIRouter(prefix="/notes", tags=["Notes"])

MAX_NOTES_PER_USER = 20
DAILY_WRITE_LIMIT = 20_000_000      # bytes of note content saved per person per day
WRITES_PER_MINUTE = 60
MAX_REQUEST_BYTES = 256_000         # enforced in main.py before the body is read
PREVIEW_CHARS = 140

_rate_lock = threading.Lock()
_rate: dict[int, list] = {}  # staff_id -> [window_minute, writes_in_window]


def _me(user: TokenUser) -> int:
    if user.id is None:
        raise HTTPException(400, "Notes need a signed-in staff account.")
    return user.id


def _size(title: str, body: str) -> int:
    return len((title or "").encode("utf-8")) + len((body or "").encode("utf-8"))


def _summary(n: models.Note) -> dict:
    preview = " ".join((n.body or "").split())[:PREVIEW_CHARS]
    return {
        "id": n.id, "title": n.title, "preview": preview, "size_bytes": _size(n.title, n.body),
        "pinned": n.pinned, "created_at": n.created_at, "updated_at": n.updated_at,
    }


def _record_blocked(me: int) -> None:
    """Count a refused write — on its own session, since the request's own
    transaction is about to be abandoned by the HTTPException."""
    db = SessionLocal()
    try:
        stmt = mysql_insert(models.NoteWriteUsage).values(
            staff_id=me, day=activity_tracker.today_ist(), bytes_written=0, writes=0, blocked=1)
        db.execute(stmt.on_duplicate_key_update(blocked=models.NoteWriteUsage.blocked + 1))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _take_rate(me: int) -> None:
    minute = int(time.time() // 60)
    with _rate_lock:
        window, used = _rate.get(me, [minute, 0])
        if window != minute:
            window, used = minute, 0
        if used >= WRITES_PER_MINUTE:
            allowed = False
        else:
            allowed = True
            _rate[me] = [window, used + 1]
        if len(_rate) > 2_000:
            for k in [k for k, (w, _) in _rate.items() if w != minute]:
                del _rate[k]
    if not allowed:
        _record_blocked(me)
        raise HTTPException(429, "You're saving notes too quickly. Please wait a moment.")


def _written_today(db: Session, me: int) -> int:
    row = db.get(models.NoteWriteUsage, (me, activity_tracker.today_ist()))
    return row.bytes_written if row else 0


def _charge_daily(db: Session, me: int, nbytes: int) -> None:
    """Add this write to today's allowance, inside the caller's transaction —
    refused (and the write abandoned) if it would go over the limit."""
    today = activity_tracker.today_ist()
    row = (
        db.query(models.NoteWriteUsage)
        .filter(models.NoteWriteUsage.staff_id == me, models.NoteWriteUsage.day == today)
        .with_for_update()
        .first()
    )
    used = row.bytes_written if row else 0
    if used + nbytes > DAILY_WRITE_LIMIT:
        db.rollback()
        _record_blocked(me)
        raise HTTPException(
            429, f"Daily notes limit reached ({DAILY_WRITE_LIMIT // 1_000_000} MB of saves). Your changes can be saved again tomorrow.")
    if row:
        row.bytes_written = used + nbytes
        row.writes += 1
    else:
        db.add(models.NoteWriteUsage(staff_id=me, day=today, bytes_written=nbytes, writes=1, blocked=0))


def _usage(db: Session, me: int) -> dict:
    count, used = (
        db.query(func.count(models.Note.id),
                 func.coalesce(func.sum(func.length(models.Note.title) + func.length(models.Note.body)), 0))
        .filter(models.Note.staff_id == me)
        .one()
    )
    return {
        "count": int(count), "max_notes": MAX_NOTES_PER_USER, "bytes_used": int(used),
        "note_max_bytes": schemas.NOTE_BODY_MAX_BYTES,
        "written_today": _written_today(db, me), "daily_write_limit": DAILY_WRITE_LIMIT,
    }


def _own_note(db: Session, note_id: int, me: int) -> models.Note:
    note = db.query(models.Note).filter(models.Note.id == note_id, models.Note.staff_id == me).first()
    if not note:
        raise HTTPException(404, "Note not found.")
    return note


@router.get("", response_model=schemas.NoteListOut)
def list_notes(db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    """The caller's notes as summaries (no bodies) — pinned first, then most recently edited."""
    me = _me(user)
    notes = (
        db.query(models.Note)
        .filter(models.Note.staff_id == me)
        .order_by(models.Note.pinned.desc(), models.Note.updated_at.desc(), models.Note.id.desc())
        .all()
    )
    return {"items": [_summary(n) for n in notes], "usage": _usage(db, me)}


@router.get("/admin/usage", response_model=list[schemas.NoteAdminUsageRow], dependencies=[Depends(require_roles())])
def admin_usage(db: Session = Depends(get_db)):
    """Admin only: how much each person stores and saves — counts and sizes,
    never note content."""
    today = activity_tracker.today_ist()
    stored = {
        sid: (int(c), int(b or 0))
        for sid, c, b in db.query(
            models.Note.staff_id, func.count(models.Note.id),
            func.sum(func.length(models.Note.title) + func.length(models.Note.body)),
        ).group_by(models.Note.staff_id).all()
    }
    todays = {
        u.staff_id: u
        for u in db.query(models.NoteWriteUsage).filter(models.NoteWriteUsage.day == today).all()
    }
    ids = set(stored) | set(todays)
    if not ids:
        return []
    names = dict(db.query(models.Staff.id, models.Staff.name).filter(models.Staff.id.in_(ids)).all())
    rows = []
    for sid in ids:
        count, used = stored.get(sid, (0, 0))
        u = todays.get(sid)
        rows.append({
            "staff_id": sid, "name": names.get(sid) or f"Staff #{sid}", "count": count, "bytes_used": used,
            "writes_today": u.writes if u else 0, "written_today": u.bytes_written if u else 0,
            "blocked_today": u.blocked if u else 0,
        })
    rows.sort(key=lambda r: (-r["blocked_today"], -r["bytes_used"]))
    return rows


@router.get("/{note_id}", response_model=schemas.NoteOut)
def get_note(note_id: int, db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    return _own_note(db, note_id, _me(user))


@router.post("", response_model=schemas.NoteOut, status_code=201)
def create_note(payload: schemas.NoteCreate, db: Session = Depends(get_db),
                user: TokenUser = Depends(get_current_user)):
    me = _me(user)
    _take_rate(me)
    # Lock this person's staff row so two simultaneous creates can't both
    # pass the count check below.
    db.query(models.Staff.id).filter(models.Staff.id == me).with_for_update().first()
    if db.query(func.count(models.Note.id)).filter(models.Note.staff_id == me).scalar() >= MAX_NOTES_PER_USER:
        db.rollback()
        _record_blocked(me)
        raise HTTPException(400, f"You can keep up to {MAX_NOTES_PER_USER} notes. Delete or merge some to add more.")
    title = payload.title.strip()
    _charge_daily(db, me, _size(title, payload.body))
    now = datetime.now(timezone.utc)
    note = models.Note(staff_id=me, title=title, body=payload.body,
                       pinned=payload.pinned, created_at=now, updated_at=now)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=schemas.NoteSavedOut)
def update_note(note_id: int, payload: schemas.NoteUpdate, db: Session = Depends(get_db),
                user: TokenUser = Depends(get_current_user)):
    me = _me(user)
    _take_rate(me)
    note = _own_note(db, note_id, me)
    content_changed = payload.title is not None or payload.body is not None
    if content_changed:
        # Charged at the size actually written — the whole row is rewritten
        # (and binary-logged) on every save, not just the changed part.
        new_title = payload.title.strip() if payload.title is not None else note.title
        new_body = payload.body if payload.body is not None else note.body
        _charge_daily(db, me, _size(new_title, new_body))
        note.title, note.body = new_title, new_body
        note.updated_at = datetime.now(timezone.utc)
    if payload.pinned is not None:
        # Pinning isn't an edit, so it doesn't reshuffle "recently edited".
        note.pinned = payload.pinned
    db.commit()
    db.refresh(note)
    return {"note": _summary(note), "usage": _usage(db, me)}


@router.delete("/{note_id}", response_model=schemas.NoteUsageOut)
def delete_note(note_id: int, db: Session = Depends(get_db), user: TokenUser = Depends(get_current_user)):
    me = _me(user)
    _take_rate(me)
    note = _own_note(db, note_id, me)
    db.delete(note)
    db.commit()
    return _usage(db, me)
