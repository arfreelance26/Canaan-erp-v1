"""Notice Board — a company-wide board opened with B (frontend
components/layout/NoticeBoard.tsx, dropping down beside the bell).

Anyone signed in with a staff account posts; everyone reads. A notice has a
title (optional), text, up to MAX_IMAGES pasted pictures, an Important flag
and an optional "remove after". Its author edits or deletes it; Admin deletes
or pins anyone's. Anyone reacts with any emoji (several per person, the same
one again takes it back). "Seen by" is shown to the author and Admin.

Abuse limits (an insider trying to flood the board or fill the disk):
- text MAX_BODY_CHARS, title MAX_TITLE_CHARS; request bodies over
  MAX_REQUEST_BYTES refused before being read (main.py middleware)
- POSTS_PER_DAY notices per person per IST day
- MAX_IMAGES pictures per notice, each at most MAX_IMAGE_BYTES, real type
  checked from the bytes (JPEG, PNG, WEBP, GIF only)
- reactions rate-limited per person
Deleting someone else's notice (Admin) is written to the Security Log.
"""
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, field_validator
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import activity_tracker
import models
from audit import record_audit
from database import get_db
from routers.files import _sniff_mime
from security import TokenUser, get_current_user
from websocket_manager import emit

router = APIRouter(prefix="/notices", tags=["Notice Board"])

MAX_TITLE_CHARS = 200
MAX_BODY_CHARS = 10_000
MAX_REQUEST_BYTES = 64_000
POSTS_PER_DAY = 30
MAX_IMAGES = 4
MAX_IMAGE_BYTES = 3 * 1024 * 1024
IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
EXPIRY_DAYS = {1, 7, 30}
LIST_LIMIT = 200
MAX_EMOJI_LEN = 16

_REACT_WINDOW = 60.0
_REACT_MAX = 120
_react_lock = threading.Lock()
_react_log: dict[int, list[float]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _me(user: TokenUser) -> int:
    if user.id is None:
        raise HTTPException(403, "The Notice Board needs a signed-in staff account.")
    return int(user.id)


def _is_admin(user: TokenUser) -> bool:
    return user.role == "Admin"


def _live(q):
    """Notices not yet past their "remove after"."""
    return q.filter(or_(models.Notice.expires_at.is_(None), models.Notice.expires_at > _now()))


def _get(db: Session, notice_id: int, lock: bool = False) -> models.Notice:
    q = _live(db.query(models.Notice).filter(models.Notice.id == notice_id))
    if lock:
        q = q.with_for_update()
    n = q.first()
    if not n:
        raise HTTPException(404, "This notice was removed.")
    return n


def _out(db: Session, n: models.Notice, me: int | None, user: TokenUser, seen: dict | None = None) -> dict:
    """A notice for the board: reactions grouped by emoji, my own marked."""
    groups: dict[str, dict] = {}
    for r in n.reactions:
        g = groups.setdefault(r.emoji, {"emoji": r.emoji, "count": 0, "mine": False, "names": []})
        g["count"] += 1
        g["names"].append(r.staff_name or "Someone")
        if r.staff_id == me:
            g["mine"] = True
    seen = seen if seen is not None else _seen_counts(db, [n.id], me)
    mine = n.staff_id is not None and n.staff_id == me
    return {
        "id": n.id,
        "staff_id": n.staff_id,
        "author_name": n.author_name,
        "author_role": n.author_role,
        "title": n.title,
        "body": n.body,
        "important": bool(n.important),
        "pinned": bool(n.pinned),
        "expires_at": n.expires_at,
        "edited_at": n.edited_at,
        "created_at": n.created_at,
        "images": [{"id": i.id, "mime": i.mime, "file_name": i.file_name, "size_bytes": i.size_bytes} for i in n.images],
        "reactions": list(groups.values()),
        "seen_count": seen["count"].get(n.id, 0),
        "seen_by_me": n.id in seen["mine"],
        "mine": mine,
        "can_edit": mine,
        "can_delete": mine or _is_admin(user),
        "can_see_seen_by": mine or _is_admin(user),
    }


def _seen_counts(db: Session, ids: list[int], me: int | None) -> dict:
    if not ids:
        return {"count": {}, "mine": set()}
    counts = dict(
        db.query(models.NoticeSeen.notice_id, func.count(models.NoticeSeen.staff_id))
        .filter(models.NoticeSeen.notice_id.in_(ids))
        .group_by(models.NoticeSeen.notice_id)
    )
    mine = set()
    if me is not None:
        mine = {r[0] for r in db.query(models.NoticeSeen.notice_id)
                .filter(models.NoticeSeen.notice_id.in_(ids), models.NoticeSeen.staff_id == me)}
    return {"count": counts, "mine": mine}


def _changed(kind: str, notice_id: int, **extra) -> None:
    emit("notice_board_updated", {"kind": kind, "id": notice_id, **extra})


# ── Payloads ─────────────────────────────────────────────────────────────────

class NoticeIn(BaseModel):
    title: str = ""
    body: str = ""
    important: bool = False
    # Remove after: 1, 7 or 30 days; None = keep until deleted.
    expires_in_days: Optional[int] = None
    # Pictures follow straight after (POST …/images), so no text is needed.
    has_images: bool = False

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) > MAX_TITLE_CHARS:
            raise ValueError(f"The title can be at most {MAX_TITLE_CHARS} characters.")
        return v

    @field_validator("body")
    @classmethod
    def _body(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) > MAX_BODY_CHARS:
            raise ValueError(f"A notice can be at most {MAX_BODY_CHARS:,} characters.")
        return v

    @field_validator("expires_in_days")
    @classmethod
    def _expiry(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v not in EXPIRY_DAYS:
            raise ValueError("Remove after must be 1, 7 or 30 days, or never.")
        return v


class NoticePatch(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    important: Optional[bool] = None
    # 0 = never; 1 / 7 / 30 = that many days from now.
    expires_in_days: Optional[int] = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else NoticeIn._title(v)

    @field_validator("body")
    @classmethod
    def _body(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else NoticeIn._body(v)

    @field_validator("expires_in_days")
    @classmethod
    def _expiry(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v != 0 and v not in EXPIRY_DAYS:
            raise ValueError("Remove after must be 1, 7 or 30 days, or never.")
        return v


class PinIn(BaseModel):
    pinned: bool


class ReactionIn(BaseModel):
    emoji: str

    @field_validator("emoji")
    @classmethod
    def _emoji(cls, v: str) -> str:
        v = (v or "").strip()
        if not v or len(v) > MAX_EMOJI_LEN or any(c.isalnum() or c in "<>&\"'" for c in v):
            raise ValueError("Pick an emoji.")
        return v


class SeenIn(BaseModel):
    ids: list[int]


# ── Read ─────────────────────────────────────────────────────────────────────

@router.get("")
def list_notices(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: TokenUser = Depends(get_current_user),
):
    """The board: pinned first, then newest. `q` searches title, text and author."""
    query = _live(db.query(models.Notice))
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(models.Notice.title.like(term), models.Notice.body.like(term),
                                 models.Notice.author_name.like(term)))
    rows = query.order_by(models.Notice.pinned.desc(), models.Notice.created_at.desc(), models.Notice.id.desc()).limit(LIST_LIMIT).all()
    me = current_user.id
    seen = _seen_counts(db, [n.id for n in rows], me)
    return [_out(db, n, me, current_user, seen) for n in rows]


@router.get("/unseen")
def unseen_notices(db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Notices I haven't seen yet (not my own), newest first — the bell's
    "Notice Board" section and the Important pop-up."""
    if current_user.id is None:
        return []
    me = int(current_user.id)
    seen_ids = db.query(models.NoticeSeen.notice_id).filter(models.NoticeSeen.staff_id == me)
    rows = (
        _live(db.query(models.Notice))
        .filter(or_(models.Notice.staff_id.is_(None), models.Notice.staff_id != me), ~models.Notice.id.in_(seen_ids))
        .order_by(models.Notice.created_at.desc())
        .limit(50).all()
    )
    return [{
        "id": n.id, "title": n.title, "preview": " ".join((n.body or "").split())[:140],
        "author_name": n.author_name, "important": bool(n.important), "image_count": len(n.images),
        "created_at": n.created_at,
    } for n in rows]


@router.post("/seen")
def mark_seen(payload: SeenIn, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """The board was opened with these notices on screen."""
    if current_user.id is None:
        return {"ok": True}
    me = int(current_user.id)
    ids = list({int(i) for i in payload.ids})[:LIST_LIMIT]
    if not ids:
        return {"ok": True}
    live = {r[0] for r in _live(db.query(models.Notice.id)).filter(models.Notice.id.in_(ids))}
    already = {r[0] for r in db.query(models.NoticeSeen.notice_id)
               .filter(models.NoticeSeen.staff_id == me, models.NoticeSeen.notice_id.in_(live))}
    for nid in live - already:
        db.add(models.NoticeSeen(notice_id=nid, staff_id=me))
    if live - already:
        try:
            db.commit()
        except IntegrityError:          # two tabs marked the same notice at once
            db.rollback()
    return {"ok": True}


@router.get("/{notice_id}/seen")
def seen_by(notice_id: int, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Who has seen it — the author and Admin only."""
    n = _get(db, notice_id)
    if not ((n.staff_id is not None and n.staff_id == current_user.id) or _is_admin(current_user)):
        raise HTTPException(403, "Only the person who posted it, or Admin, can see who has seen it.")
    rows = (
        db.query(models.NoticeSeen.seen_at, models.Staff.name, models.Staff.software_designation)
        .join(models.Staff, models.Staff.id == models.NoticeSeen.staff_id)
        .filter(models.NoticeSeen.notice_id == notice_id)
        .order_by(models.NoticeSeen.seen_at.desc())
        .all()
    )
    return [{"name": name, "role": role, "seen_at": at} for at, name, role in rows]


@router.get("/{notice_id}/images/{image_id}")
def get_image(notice_id: int, image_id: int, db: Session = Depends(get_db)):
    _get(db, notice_id)
    img = db.query(models.NoticeImage).filter(
        models.NoticeImage.id == image_id, models.NoticeImage.notice_id == notice_id).first()
    if not img:
        raise HTTPException(404, "Image not found.")
    return Response(content=img.data, media_type=img.mime, headers={
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
    })


# ── Write ────────────────────────────────────────────────────────────────────

def _posts_today(db: Session, me: int) -> int:
    start_ist = datetime.combine(activity_tracker.today_ist(), datetime.min.time())
    start_utc = start_ist - timedelta(hours=5, minutes=30)
    return db.query(func.count(models.Notice.id)).filter(
        models.Notice.staff_id == me, models.Notice.created_at >= start_utc).scalar() or 0


@router.post("", status_code=201)
def create_notice(payload: NoticeIn, db: Session = Depends(get_db), current_user: TokenUser = Depends(get_current_user)):
    """Post to the board. Pictures are uploaded right after (POST …/images)."""
    me = _me(current_user)
    if not payload.title and not payload.body and not payload.has_images:
        raise HTTPException(400, "Write something or paste a picture first.")
    if _posts_today(db, me) >= POSTS_PER_DAY:
        raise HTTPException(429, f"You've posted {POSTS_PER_DAY} notices today — that's the daily limit.")
    staff = db.get(models.Staff, me)
    n = models.Notice(
        staff_id=me,
        author_name=(staff.name if staff else current_user.name) or current_user.name,
        author_role=current_user.role,
        title=payload.title, body=payload.body, important=payload.important,
        expires_at=_now() + timedelta(days=payload.expires_in_days) if payload.expires_in_days else None,
    )
    db.add(n)
    # Housekeeping: notices past their "remove after" go for good.
    db.query(models.Notice).filter(models.Notice.expires_at.isnot(None), models.Notice.expires_at <= _now()) \
        .delete(synchronize_session=False)
    db.commit()
    db.refresh(n)
    _changed("created", n.id, important=bool(n.important), author_id=me)
    return _out(db, n, me, current_user)


@router.patch("/{notice_id}")
def edit_notice(notice_id: int, payload: NoticePatch, db: Session = Depends(get_db),
                current_user: TokenUser = Depends(get_current_user)):
    me = _me(current_user)
    n = _get(db, notice_id, lock=True)
    if n.staff_id != me:
        raise HTTPException(403, "Only the person who posted a notice can edit it.")
    if payload.title is not None:
        n.title = payload.title
    if payload.body is not None:
        n.body = payload.body
    if payload.important is not None:
        n.important = payload.important
    if payload.expires_in_days is not None:
        n.expires_at = None if payload.expires_in_days == 0 else _now() + timedelta(days=payload.expires_in_days)
    if not n.title and not n.body and not n.images:
        raise HTTPException(400, "A notice can't be empty.")
    n.edited_at = _now()
    db.commit()
    db.refresh(n)
    _changed("edited", n.id)
    return _out(db, n, me, current_user)


@router.delete("/{notice_id}", status_code=204)
def delete_notice(notice_id: int, request: Request, db: Session = Depends(get_db),
                  current_user: TokenUser = Depends(get_current_user)):
    n = _get(db, notice_id, lock=True)
    mine = n.staff_id is not None and n.staff_id == current_user.id
    if not (mine or _is_admin(current_user)):
        raise HTTPException(403, "Only the person who posted it, or Admin, can delete a notice.")
    if not mine:
        record_audit(
            "notice.deleted", request=request, actor_id=current_user.id, actor_name=current_user.name,
            actor_role=current_user.role, resource=f"notice:{n.id}",
            detail=f"Posted by {n.author_name}: {(n.title or n.body or '')[:120]}",
        )
    db.delete(n)
    db.commit()
    _changed("deleted", notice_id)
    return Response(status_code=204)


@router.put("/{notice_id}/pin")
def pin_notice(notice_id: int, payload: PinIn, db: Session = Depends(get_db),
               current_user: TokenUser = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only Admin can pin notices.")
    n = _get(db, notice_id, lock=True)
    n.pinned = payload.pinned
    db.commit()
    db.refresh(n)
    _changed("edited", n.id)
    return _out(db, n, current_user.id, current_user)


@router.post("/{notice_id}/images", status_code=201)
async def upload_image(notice_id: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                       current_user: TokenUser = Depends(get_current_user)):
    me = _me(current_user)
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, f"Each picture can be at most {MAX_IMAGE_BYTES // (1024 * 1024)} MB.")
    if not data:
        raise HTTPException(400, "The picture is empty.")
    mime = _sniff_mime(data)
    if mime not in IMAGE_MIMES:
        raise HTTPException(415, "Only pictures (JPG, PNG, WEBP or GIF) can be added to a notice.")
    n = _get(db, notice_id, lock=True)
    if n.staff_id != me:
        raise HTTPException(403, "Only the person who posted a notice can add pictures to it.")
    if len(n.images) >= MAX_IMAGES:
        raise HTTPException(400, f"A notice can have at most {MAX_IMAGES} pictures.")
    name = (file.filename or "image").replace("\\", "/").split("/")[-1][:255] or "image"
    img = models.NoticeImage(notice_id=n.id, mime=mime, file_name=name, size_bytes=len(data), data=data)
    db.add(img)
    db.commit()
    db.refresh(img)
    _changed("edited", n.id)
    return {"id": img.id, "mime": img.mime, "file_name": img.file_name, "size_bytes": img.size_bytes}


@router.delete("/{notice_id}/images/{image_id}", status_code=204)
def delete_image(notice_id: int, image_id: int, db: Session = Depends(get_db),
                 current_user: TokenUser = Depends(get_current_user)):
    me = _me(current_user)
    n = _get(db, notice_id, lock=True)
    if n.staff_id != me:
        raise HTTPException(403, "Only the person who posted a notice can remove its pictures.")
    img = db.query(models.NoticeImage).filter(
        models.NoticeImage.id == image_id, models.NoticeImage.notice_id == notice_id).first()
    if not img:
        raise HTTPException(404, "Image not found.")
    db.delete(img)
    db.commit()
    _changed("edited", n.id)
    return Response(status_code=204)


def _check_react_rate(me: int) -> None:
    now = time.monotonic()
    with _react_lock:
        recent = [t for t in _react_log.get(me, []) if now - t < _REACT_WINDOW]
        if len(recent) >= _REACT_MAX:
            raise HTTPException(429, "You're reacting too quickly. Please slow down.")
        recent.append(now)
        _react_log[me] = recent
        if len(_react_log) > 1000:
            for uid in [u for u, ts in _react_log.items() if not any(now - t < _REACT_WINDOW for t in ts)]:
                _react_log.pop(uid, None)


@router.put("/{notice_id}/reactions")
def toggle_reaction(notice_id: int, payload: ReactionIn, db: Session = Depends(get_db),
                    current_user: TokenUser = Depends(get_current_user)):
    """Add my reaction with this emoji, or take it back if I already have it."""
    me = _me(current_user)
    n = _get(db, notice_id)
    _check_react_rate(me)
    existing = db.query(models.NoticeReaction).filter(
        models.NoticeReaction.notice_id == n.id, models.NoticeReaction.staff_id == me,
        models.NoticeReaction.emoji == payload.emoji).first()
    if existing:
        db.delete(existing)
    else:
        if db.query(func.count(models.NoticeReaction.id)).filter(
                models.NoticeReaction.notice_id == n.id, models.NoticeReaction.staff_id == me).scalar() >= 20:
            raise HTTPException(400, "That's plenty of reactions on one notice.")
        staff = db.get(models.Staff, me)
        db.add(models.NoticeReaction(notice_id=n.id, staff_id=me,
                                     staff_name=staff.name if staff else current_user.name, emoji=payload.emoji))
    try:
        db.commit()
    except IntegrityError:              # a double tap raced: the other one already added it
        db.rollback()
    db.expire(n, ["reactions"])
    db.refresh(n)
    _changed("reacted", n.id)
    return _out(db, n, me, current_user)
